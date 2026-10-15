import { db } from '../../main/database/db.js';
import { redis } from '../../main/redis/redisClient.js';
import { AppError } from '../../common/errors/appError.js';

export interface CustomerSessionStatus {
  isOpen: boolean;
  tableNumber: number;
  session?: {
    id: string;
    comensales: number;
    inicio: string;
    tariffId: string;
    tariffName: string;
    duracionMaxMin: number;
    platosPorRonda: number;
    pausaEntreRondasS: number;
  };
}

export class CustomerSessionService {
  /**
   * Consulta el estado de una mesa a través de su qr_token público sin filtrar datos sensibles
   */
  public async getTableStatus(qrToken: string): Promise<CustomerSessionStatus> {
    const { rows } = await db.query(
      `SELECT t.numero, s.id as session_id, s.comensales, s.inicio, s.estado,
              tr.id as tariff_id, tr.nombre as tariff_nombre, tr.duracion_max_min,
              tr.platos_por_ronda, tr.pausa_entre_rondas_s
       FROM "table" t
       LEFT JOIN table_session s ON s.table_id = t.id AND s.estado = 'abierta'
       LEFT JOIN tariff tr ON tr.id = s.tariff_id
       WHERE t.qr_token = $1`,
      [qrToken]
    );

    const record = rows[0];
    if (!record) {
      throw new AppError('TABLE_NOT_FOUND', 'Mesa no encontrada con el código QR escaneado', 404);
    }

    if (!record.session_id || record.estado !== 'abierta') {
      return {
        isOpen: false,
        tableNumber: record.numero
      };
    }

    return {
      isOpen: true,
      tableNumber: record.numero,
      session: {
        id: record.session_id,
        comensales: record.comensales,
        inicio: record.inicio,
        tariffId: record.tariff_id,
        tariffName: record.tariff_nombre,
        duracionMaxMin: record.duracion_max_min,
        platosPorRonda: record.platos_por_ronda,
        pausaEntreRondasS: record.pausa_entre_rondas_s
      }
    };
  }

  /**
   * Une al cliente a una sesión de mesa previamente abierta por sala
   */
  public async joinSession(qrToken: string): Promise<{
    sessionId: string;
    tableId: string;
    tableNumber: number;
    tariffId: string;
    comensales: number;
    inicio: string;
    tariff: {
      nombre: string;
      duracionMaxMin: number;
      platosPorRonda: number;
      pausaEntreRondasS: number;
    };
  }> {
    const { rows } = await db.query(
      `SELECT t.id as table_id, t.numero, s.id as session_id, s.comensales, s.inicio, s.estado,
              tr.id as tariff_id, tr.nombre as tariff_nombre, tr.duracion_max_min,
              tr.platos_por_ronda, tr.pausa_entre_rondas_s
       FROM "table" t
       LEFT JOIN table_session s ON s.table_id = t.id AND s.estado = 'abierta'
       LEFT JOIN tariff tr ON tr.id = s.tariff_id
       WHERE t.qr_token = $1`,
      [qrToken]
    );

    const record = rows[0];
    if (!record) {
      throw new AppError('TABLE_NOT_FOUND', 'Mesa no encontrada con este código QR', 404);
    }

    if (!record.session_id || record.estado !== 'abierta') {
      throw new AppError(
        'SESSION_NOT_OPEN',
        'La mesa no está abierta. Por favor, avisa a un camarero para que active tu mesa antes de pedir.',
        409
      );
    }

    return {
      sessionId: record.session_id,
      tableId: record.table_id,
      tableNumber: record.numero,
      tariffId: record.tariff_id,
      comensales: record.comensales,
      inicio: record.inicio,
      tariff: {
        nombre: record.tariff_nombre,
        duracionMaxMin: record.duracion_max_min,
        platosPorRonda: record.platos_por_ronda,
        pausaEntreRondasS: record.pausa_entre_rondas_s
      }
    };
  }

  /**
   * Valida activamente que una sesión siga abierta y no haya caducado
   */
  public async validateActiveSession(sessionId: string): Promise<{
    id: string;
    tableId: string;
    tariffId: string;
    comensales: number;
    inicio: string;
    duracionMaxMin: number;
    platosPorRonda: number;
    pausaEntreRondasS: number;
  }> {
    // 1. Consultar base de datos asegurando estado 'abierta'
    const { rows } = await db.query(
      `SELECT s.id, s.table_id, s.tariff_id, s.comensales, s.inicio, s.estado,
              tr.duracion_max_min, tr.platos_por_ronda, tr.pausa_entre_rondas_s
       FROM table_session s
       JOIN tariff tr ON tr.id = s.tariff_id
       WHERE s.id = $1`,
      [sessionId]
    );

    const session = rows[0];
    if (!session || session.estado !== 'abierta') {
      throw new AppError('SESSION_EXPIRED', 'La sesión de la mesa no está activa o ha sido cerrada', 401);
    }

    // 2. Comprobar si ha superado la duración máxima de la tarifa
    const startTime = new Date(session.inicio).getTime();
    const now = Date.now();
    const elapsedMinutes = (now - startTime) / (1000 * 60);

    if (elapsedMinutes >= session.duracion_max_min) {
      // Marcar como caducada
      await db.query(`UPDATE table_session SET estado = 'caducada', fin = NOW() WHERE id = $1`, [sessionId]);
      const redisClient = redis.getClient();
      await redisClient.del(`table:active:${session.table_id}`);
      throw new AppError('SESSION_EXPIRED', 'El tiempo máximo del buffet ha finalizado', 401);
    }

    return {
      id: session.id,
      tableId: session.table_id,
      tariffId: session.tariff_id,
      comensales: session.comensales,
      inicio: session.inicio,
      duracionMaxMin: session.duracion_max_min,
      platosPorRonda: session.platos_por_ronda,
      pausaEntreRondasS: session.pausa_entre_rondas_s
    };
  }
}

export const customerSessionService = new CustomerSessionService();
