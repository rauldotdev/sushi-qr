import { db } from '../../main/database/db.js';
import { AppError } from '../../common/errors/appError.js';
import { StaffTokenPayload } from '../../common/middleware/authMiddleware.js';
import { ListKitchenOrdersDto } from '../dtos/listKitchenOrders.dto.js';
import { realtimeService } from '../../realtime/services/realtimeService.js';

export class KitchenService {
  /**
   * Obtiene la lista de comandas activas para la pantalla de cocina (KDS)
   * Ordenadas por orden de llegada (FIFO)
   */
  public async getOrders(filters: ListKitchenOrdersDto) {
    const { status, limit, offset } = filters;

    let query = `
      SELECT r.id as round_id, r.numero as round_numero, r.estado as round_estado, r.creado_en as round_creado_en,
             s.id as session_id, s.comensales,
             t.id as table_id, t.numero as table_number,
             l.id as line_id, l.dish_id, l.cantidad, l.estado as line_estado, l.creado_en as line_creado_en,
             d.nombre_es, d.nombre_en, d.imagen
      FROM order_round r
      JOIN table_session s ON s.id = r.session_id
      JOIN "table" t ON t.id = s.table_id
      JOIN order_line l ON l.round_id = r.id
      JOIN dish d ON d.id = l.dish_id
      WHERE s.estado = 'abierta'
    `;

    const params: any[] = [];
    if (status) {
      params.push(status);
      query += ` AND l.estado = $${params.length}`;
    }

    query += ` ORDER BY r.creado_en ASC, l.creado_en ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await db.query(query, params);

    // Agrupar filas por ronda
    const roundsMap = new Map<string, any>();

    for (const row of rows) {
      if (!roundsMap.has(row.round_id)) {
        roundsMap.set(row.round_id, {
          roundId: row.round_id,
          roundNumero: row.round_numero,
          roundEstado: row.round_estado,
          roundCreadoEn: row.round_creado_en,
          sessionId: row.session_id,
          comensales: row.comensales,
          tableId: row.table_id,
          tableNumber: row.table_number,
          lines: []
        });
      }

      roundsMap.get(row.round_id).lines.push({
        id: row.line_id,
        dishId: row.dish_id,
        nombreEs: row.nombre_es,
        nombreEn: row.nombre_en,
        imagen: row.imagen,
        cantidad: row.cantidad,
        estado: row.line_estado,
        creadoEn: row.line_creado_en
      });
    }

    return Array.from(roundsMap.values());
  }

  /**
   * Actualiza el estado de una línea de pedido (en_cola -> en_cocina -> servido / cancelado)
   * Si es cancelación, se registra en audit_log
   */
  public async updateOrderLineStatus(
    lineId: string,
    newEstado: 'en_cola' | 'en_cocina' | 'servido' | 'cancelado',
    staffUser: StaffTokenPayload,
    motivo?: string
  ) {
    const lineRes = await db.query(
      `SELECT l.id, l.round_id, l.dish_id, l.cantidad, l.estado,
              r.session_id, r.numero as round_numero, t.numero as table_number,
              d.nombre_es, d.nombre_en
       FROM order_line l
       JOIN order_round r ON r.id = l.round_id
       JOIN table_session s ON s.id = r.session_id
       JOIN "table" t ON t.id = s.table_id
       JOIN dish d ON d.id = l.dish_id
       WHERE l.id = $1`,
      [lineId]
    );

    const line = lineRes.rows[0];
    if (!line) {
      throw new AppError('ORDER_LINE_NOT_FOUND', 'Línea de pedido no encontrada', 404);
    }

    if (line.estado === newEstado) {
      return {
        lineId: line.id,
        roundId: line.round_id,
        estado: line.estado,
        sessionId: line.session_id
      };
    }

    // Validar máquina de estados de la comanda
    if (line.estado === 'servido') {
      throw new AppError('INVALID_LINE_TRANSITION', 'Un plato ya servido no puede cambiar de estado', 422);
    }
    if (line.estado === 'cancelado') {
      throw new AppError('INVALID_LINE_TRANSITION', 'Un plato ya cancelado no puede cambiar de estado', 422);
    }

    // Transiciones válidas:
    // en_cola -> en_cocina | cancelado
    // en_cocina -> servido | cancelado
    const validTransitions: Record<string, string[]> = {
      en_cola: ['en_cocina', 'cancelado'],
      en_cocina: ['servido', 'cancelado']
    };

    if (!validTransitions[line.estado]?.includes(newEstado)) {
      throw new AppError(
        'INVALID_LINE_TRANSITION',
        `Transición no permitida de '${line.estado}' a '${newEstado}'`,
        422
      );
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 1. Actualizar estado de la línea
      await client.query(`UPDATE order_line SET estado = $1 WHERE id = $2`, [newEstado, lineId]);

      // 2. Si se cancela por personal, auditar obligatoriamente
      if (newEstado === 'cancelado') {
        const auditActor = `${staffUser.nombre} (${staffUser.email})`;
        const auditDetalles = JSON.stringify({
          motivo: motivo || 'Cancelación por personal',
          rol: staffUser.rol,
          userId: staffUser.sub,
          dishId: line.dish_id,
          plato: line.nombre_es,
          cantidad: line.cantidad,
          mesa: line.table_number
        });

        await client.query(
          `INSERT INTO audit_log (actor, accion, entidad, entidad_id, detalles)
           VALUES ($1, 'ORDER_LINE_CANCELLED', 'order_line', $2, $3::jsonb)`,
          [auditActor, lineId, auditDetalles]
        );
      }

      // 3. Evaluar y sincronizar el estado global de la ronda
      const { rows: allLines } = await client.query(
        `SELECT estado FROM order_line WHERE round_id = $1`,
        [line.round_id]
      );

      let newRoundEstado = 'en_cola';
      const allDone = allLines.every((l: any) => l.estado === 'servido' || l.estado === 'cancelado');
      const anyInCooking = allLines.some((l: any) => l.estado === 'en_cocina');

      if (allDone) {
        newRoundEstado = 'servido';
      } else if (anyInCooking) {
        newRoundEstado = 'en_cocina';
      }

      await client.query(`UPDATE order_round SET estado = $1 WHERE id = $2`, [newRoundEstado, line.round_id]);

      await client.query('COMMIT');

      // 4. Notificar en tiempo real a cocina y al comensal
      const updatePayload = {
        lineId: line.id,
        roundId: line.round_id,
        roundNumero: line.round_numero,
        tableNumber: line.table_number,
        dishId: line.dish_id,
        nombreEs: line.nombre_es,
        nombreEn: line.nombre_en,
        cantidad: line.cantidad,
        estadoAnterior: line.estado,
        nuevoEstado: newEstado,
        roundEstado: newRoundEstado,
        motivo
      };

      await Promise.all([
        realtimeService.publishKitchenEvent('ORDER_LINE_UPDATED', updatePayload),
        realtimeService.publishSessionEvent(line.session_id, 'ORDER_LINE_UPDATED', updatePayload)
      ]);

      return {
        lineId: line.id,
        roundId: line.round_id,
        estado: newEstado,
        roundEstado: newRoundEstado,
        sessionId: line.session_id
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const kitchenService = new KitchenService();
