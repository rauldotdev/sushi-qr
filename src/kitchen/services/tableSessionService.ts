import crypto from 'node:crypto';
import { db } from '../../main/database/db.js';
import { redis } from '../../main/redis/redisClient.js';
import { AppError } from '../../common/errors/appError.js';
import { OpenTableDto } from '../dtos/waiterTable.dto.js';

export interface TableSessionEntity {
  id: string;
  table_id: string;
  tariff_id: string;
  comensales: number;
  inicio: string;
  fin: string | null;
  estado: 'abierta' | 'cerrada' | 'caducada';
  session_token_hash: string;
}

export class TableSessionService {
  /**
   * Hashea el token de sesión con SHA-256 para almacenamiento seguro
   */
  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Abre la sesión de una mesa por el personal de sala
   */
  public async openSession(tableId: string, staffUserId: string, dto: OpenTableDto): Promise<{ session: TableSessionEntity; rawSessionToken: string }> {
    // 1. Validar que la mesa existe
    const tableRes = await db.query('SELECT id, numero, restaurant_id FROM "table" WHERE id = $1', [tableId]);
    if (!tableRes.rows[0]) {
      throw new AppError('TABLE_NOT_FOUND', 'Mesa no encontrada', 404);
    }

    // 2. Comprobar que no tiene ya una sesión abierta
    const existingSessionRes = await db.query(
      `SELECT id FROM table_session WHERE table_id = $1 AND estado = 'abierta'`,
      [tableId]
    );
    if (existingSessionRes.rows[0]) {
      throw new AppError('TABLE_ALREADY_OPEN', 'La mesa ya tiene una sesión abierta activa', 409);
    }

    // 3. Validar que la tarifa existe y está activa
    const tariffRes = await db.query(
      `SELECT id, duracion_max_min, platos_por_ronda, pausa_entre_rondas_s 
       FROM tariff 
       WHERE id = $1 AND activo = true`,
      [dto.tariff_id]
    );
    if (!tariffRes.rows[0]) {
      throw new AppError('TARIFF_NOT_FOUND', 'Tarifa no encontrada o inactiva', 404);
    }

    // 4. Generar token de sesión criptográfico (256 bits) y su hash SHA-256
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawSessionToken);

    // 5. Insertar sesión en PostgreSQL
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<TableSessionEntity>(
        `INSERT INTO table_session (table_id, tariff_id, comensales, estado, session_token_hash)
         VALUES ($1, $2, $3, 'abierta', $4)
         RETURNING id, table_id, tariff_id, comensales, inicio, fin, estado, session_token_hash`,
        [tableId, dto.tariff_id, dto.comensales, tokenHash]
      );
      const session = rows[0]!;

      // 6. Registrar en audit_log
      await client.query(
        `INSERT INTO audit_log (actor, accion, entidad, entidad_id, detalles)
         VALUES ($1, 'OPEN_TABLE', 'table_session', $2, $3)`,
        [staffUserId, session.id, JSON.stringify({ tableId, comensales: dto.comensales, tariffId: dto.tariff_id })]
      );

      await client.query('COMMIT');

      // 7. Guardar en caché Redis para acceso de alta velocidad
      const redisClient = redis.getClient();
      const sessionPayload = JSON.stringify({
        id: session.id,
        tableId: session.table_id,
        tariffId: session.tariff_id,
        comensales: session.comensales,
        estado: 'abierta',
        inicio: session.inicio
      });

      // TTL de 4 horas en Redis
      await redisClient.set(`session:token:${tokenHash}`, sessionPayload, 'EX', 14400);
      await redisClient.set(`table:active:${tableId}`, session.id, 'EX', 14400);

      return { session, rawSessionToken };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cierra la sesión de una mesa e invalida el token de inmediato
   */
  public async closeSession(tableId: string, staffUserId: string): Promise<{ sessionId: string }> {
    const { rows } = await db.query<TableSessionEntity>(
      `SELECT id, session_token_hash FROM table_session 
       WHERE table_id = $1 AND estado = 'abierta'`,
      [tableId]
    );

    const activeSession = rows[0];
    if (!activeSession) {
      throw new AppError('NO_ACTIVE_SESSION', 'La mesa no tiene una sesión abierta para cerrar', 404);
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE table_session 
         SET estado = 'cerrada', fin = NOW() 
         WHERE id = $1`,
        [activeSession.id]
      );

      // Registrar en auditoría
      await client.query(
        `INSERT INTO audit_log (actor, accion, entidad, entidad_id, detalles)
         VALUES ($1, 'CLOSE_TABLE', 'table_session', $2, $3)`,
        [staffUserId, activeSession.id, JSON.stringify({ tableId })]
      );

      await client.query('COMMIT');

      // Invalidar inmediatamente en Redis
      const redisClient = redis.getClient();
      await redisClient.del(`session:token:${activeSession.session_token_hash}`);
      await redisClient.del(`table:active:${tableId}`);

      return { sessionId: activeSession.id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const tableSessionService = new TableSessionService();
