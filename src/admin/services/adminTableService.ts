import crypto from 'node:crypto';
import { db } from '../../main/database/db.js';
import { AppError } from '../../common/errors/appError.js';
import { CreateTableDto } from '../dtos/adminTable.dto.js';

export interface TableEntity {
  id: string;
  restaurant_id: string;
  numero: number;
  qr_token: string;
  creado_en: string;
}

export class AdminTableService {
  /**
   * Genera un token aleatorio criptográficamente seguro de al menos 128 bits
   */
  public generateQrToken(): string {
    return crypto.randomBytes(32).toString('hex'); // 256 bits
  }

  /**
   * Crea una nueva mesa con un qr_token seguro
   */
  public async createTable(restaurantId: string, dto: CreateTableDto): Promise<TableEntity> {
    const targetRestaurantId = dto.restaurant_id || restaurantId;
    const qrToken = this.generateQrToken();

    try {
      const { rows } = await db.query<TableEntity>(
        `INSERT INTO "table" (restaurant_id, numero, qr_token)
         VALUES ($1, $2, $3)
         RETURNING id, restaurant_id, numero, qr_token, creado_en`,
        [targetRestaurantId, dto.numero, qrToken]
      );
      return rows[0]!;
    } catch (err: any) {
      if (err.code === '23505') {
        throw new AppError('TABLE_NUMBER_EXISTS', `La mesa número ${dto.numero} ya existe en este local`, 409);
      }
      throw err;
    }
  }

  /**
   * Lista todas las mesas con información de su sesión activa si la hubiera
   */
  public async listTables(restaurantId: string): Promise<any[]> {
    const { rows } = await db.query(
      `SELECT t.id, t.numero, t.qr_token, t.creado_en,
              s.id as active_session_id, s.estado as session_estado,
              s.comensales, s.inicio as session_inicio, s.tariff_id
       FROM "table" t
       LEFT JOIN table_session s ON s.table_id = t.id AND s.estado = 'abierta'
       WHERE t.restaurant_id = $1
       ORDER BY t.numero ASC`,
      [restaurantId]
    );
    return rows;
  }

  /**
   * Elimina una mesa por ID
   */
  public async deleteTable(id: string): Promise<void> {
    const { rowCount } = await db.query(`DELETE FROM "table" WHERE id = $1`, [id]);
    if (!rowCount || rowCount === 0) {
      throw new AppError('TABLE_NOT_FOUND', 'Mesa no encontrada', 404);
    }
  }
}

export const adminTableService = new AdminTableService();
