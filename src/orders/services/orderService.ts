import { db } from '../../main/database/db.js';
import { AppError } from '../../common/errors/appError.js';
import { OrderItemDto } from '../dtos/createOrder.dto.js';
import { buffetRulesEngine, DishValidationContext } from './buffetRulesEngine.js';

export class OrderService {
  /**
   * Crea una nueva ronda de pedidos aplicando idempotencia y las reglas de buffet en una sola transacción
   */
  public async createOrderRound(sessionId: string, items: OrderItemDto[], idempotencyKey: string) {
    // 1. Verificación de Idempotencia previa
    const existingRoundRes = await db.query(
      `SELECT r.id, r.session_id, r.numero, r.idempotency_key, r.estado, r.creado_en
       FROM order_round r
       WHERE r.session_id = $1 AND r.idempotency_key = $2`,
      [sessionId, idempotencyKey]
    );

    if (existingRoundRes.rows[0]) {
      const round = existingRoundRes.rows[0];
      const { rows: lines } = await db.query(
        `SELECT l.id, l.round_id, l.dish_id, l.cantidad, l.estado, d.nombre_es, d.nombre_en
         FROM order_line l
         JOIN dish d ON d.id = l.dish_id
         WHERE l.round_id = $1`,
        [round.id]
      );

      // Comprobar si el contenido solicitado coincide
      const existingItemsMap = new Map(lines.map((l: any) => [l.dish_id, l.cantidad]));
      const matches =
        items.length === lines.length &&
        items.every((it) => existingItemsMap.get(it.dish_id) === it.cantidad);

      if (!matches) {
        throw new AppError(
          'IDEMPOTENCY_CONFLICT',
          'La clave de idempotencia ya fue utilizada para un pedido diferente',
          409
        );
      }

      return { round, lines, isIdempotentReplay: true };
    }

    // 2. Obtener datos de la sesión activa y su tarifa
    const sessionRes = await db.query(
      `SELECT s.id, s.inicio, s.comensales, s.estado, s.tariff_id,
              t.duracion_max_min, t.platos_por_ronda, t.pausa_entre_rondas_s
       FROM table_session s
       JOIN tariff t ON t.id = s.tariff_id
       WHERE s.id = $1`,
      [sessionId]
    );

    const sessionData = sessionRes.rows[0];
    if (!sessionData || sessionData.estado !== 'abierta') {
      throw new AppError('SESSION_EXPIRED', 'La sesión no está abierta', 401);
    }

    // 3. Consultar platos pedidos y validar su presencia en la tarifa
    const dishIds = items.map((i) => i.dish_id);
    const dishesRes = await db.query(
      `SELECT d.id, d.activo, d.limite_por_ronda,
              CASE WHEN td.dish_id IS NOT NULL THEN true ELSE false END as is_in_tariff
       FROM dish d
       LEFT JOIN tariff_dish td ON td.dish_id = d.id AND td.tariff_id = $1
       WHERE d.id = ANY($2::uuid[])`,
      [sessionData.tariff_id, dishIds]
    );

    const dishesMap = new Map<string, DishValidationContext>();
    for (const d of dishesRes.rows) {
      dishesMap.set(d.id, {
        id: d.id,
        activo: d.activo,
        limitePorRonda: d.limite_por_ronda,
        isInTariff: d.is_in_tariff
      });
    }

    // 4. Consultar última ronda de la sesión (para cooldown y estado pendiente)
    const lastRoundRes = await db.query(
      `SELECT r.id, r.creado_en,
              EXISTS (
                SELECT 1 FROM order_line l
                WHERE l.round_id = r.id AND l.estado IN ('en_cola', 'en_cocina')
              ) as has_unserved_lines
       FROM order_round r
       WHERE r.session_id = $1
       ORDER BY r.numero DESC
       LIMIT 1`,
      [sessionId]
    );

    const lastRoundData = lastRoundRes.rows[0]
      ? {
          createdAt: lastRoundRes.rows[0].creado_en,
          hasUnservedLines: lastRoundRes.rows[0].has_unserved_lines
        }
      : null;

    // 5. Validar motor de reglas del buffet (puro)
    buffetRulesEngine.validate(
      items,
      {
        sessionId: sessionData.id,
        inicio: sessionData.inicio,
        comensales: sessionData.comensales,
        duracionMaxMin: sessionData.duracion_max_min,
        platosPorRonda: sessionData.platos_por_ronda,
        pausaEntreRondasS: sessionData.pausa_entre_rondas_s
      },
      dishesMap,
      lastRoundData
    );

    // 6. Transacción atómica corta: insertar ronda y líneas
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const nextNumRes = await client.query(
        `SELECT COALESCE(MAX(numero), 0) + 1 as next_num 
         FROM order_round 
         WHERE session_id = $1`,
        [sessionId]
      );
      const nextNumero = nextNumRes.rows[0].next_num;

      const roundInsert = await client.query(
        `INSERT INTO order_round (session_id, numero, idempotency_key, estado)
         VALUES ($1, $2, $3, 'en_cola')
         RETURNING id, session_id, numero, idempotency_key, estado, creado_en`,
        [sessionId, nextNumero, idempotencyKey]
      );
      const newRound = roundInsert.rows[0];

      const insertedLines: any[] = [];
      for (const item of items) {
        const lineInsert = await client.query(
          `INSERT INTO order_line (round_id, dish_id, cantidad, estado)
           VALUES ($1, $2, $3, 'en_cola')
           RETURNING id, round_id, dish_id, cantidad, estado, creado_en`,
          [newRound.id, item.dish_id, item.cantidad]
        );
        insertedLines.push(lineInsert.rows[0]);
      }

      await client.query('COMMIT');
      return { round: newRound, lines: insertedLines, isIdempotentReplay: false };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        // Restricción única en (session_id, idempotency_key) disparada por concurrencia
        throw new AppError('DUPLICATE_ORDER', 'El pedido ya fue registrado con esta clave de idempotencia', 409);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene todas las rondas y líneas de una sesión
   */
  public async getSessionOrders(sessionId: string) {
    const { rows: rounds } = await db.query(
      `SELECT r.id, r.numero, r.idempotency_key, r.estado, r.creado_en
       FROM order_round r
       WHERE r.session_id = $1
       ORDER BY r.numero ASC`,
      [sessionId]
    );

    const result: any[] = [];
    for (const round of rounds) {
      const { rows: lines } = await db.query(
        `SELECT l.id, l.dish_id, l.cantidad, l.estado, l.creado_en,
                d.nombre_es, d.nombre_en, d.imagen
         FROM order_line l
         JOIN dish d ON d.id = l.dish_id
         WHERE l.round_id = $1
         ORDER BY l.creado_en ASC`,
        [round.id]
      );
      result.push({
        ...round,
        lines
      });
    }

    return result;
  }

  /**
   * Permite al comensal cancelar una línea mientras esté en cola (antes de entrar a cocina)
   */
  public async cancelOrderLineByCustomer(lineId: string, sessionId: string) {
    const { rows } = await db.query(
      `SELECT l.id, l.estado, r.session_id
       FROM order_line l
       JOIN order_round r ON r.id = l.round_id
       WHERE l.id = $1 AND r.session_id = $2`,
      [lineId, sessionId]
    );

    const line = rows[0];
    if (!line) {
      throw new AppError('ORDER_LINE_NOT_FOUND', 'Línea de pedido no encontrada', 404);
    }

    if (line.estado !== 'en_cola') {
      throw new AppError(
        'LINE_CANNOT_BE_CANCELLED',
        'Solo se pueden cancelar platos mientras están en cola antes de entrar a cocina',
        422
      );
    }

    await db.query(`UPDATE order_line SET estado = 'cancelado' WHERE id = $1`, [lineId]);
    return { lineId, estado: 'cancelado' };
  }
}

export const orderService = new OrderService();
