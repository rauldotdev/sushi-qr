import { db } from '../../main/database/db.js';
import { redis } from '../../main/redis/redisClient.js';
import { AppError } from '../../common/errors/appError.js';
import { CategoryDto } from '../dtos/category.dto.js';
import { DishDto } from '../dtos/dish.dto.js';
import { TariffDto } from '../dtos/tariff.dto.js';

export class AdminCatalogService {
  /**
   * Invalida todas las claves de caché de carta en Redis
   */
  public async invalidateMenuCache(): Promise<void> {
    const client = redis.getClient();
    const stream = client.scanStream({
      match: 'menu:tariff:*',
      count: 100
    });

    const pipeline = client.pipeline();
    stream.on('data', (keys: string[]) => {
      if (keys.length > 0) {
        keys.forEach((key) => pipeline.del(key));
      }
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', async () => {
        try {
          await pipeline.exec();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      stream.on('error', reject);
    });
  }

  // --- CATEGORÍAS ---
  public async createCategory(dto: CategoryDto) {
    const { rows } = await db.query(
      `INSERT INTO category (nombre_es, nombre_en, orden)
       VALUES ($1, $2, $3)
       RETURNING id, nombre_es, nombre_en, orden, creado_en`,
      [dto.nombre_es, dto.nombre_en, dto.orden]
    );
    await this.invalidateMenuCache();
    return rows[0]!;
  }

  public async listCategories() {
    const { rows } = await db.query(`SELECT * FROM category ORDER BY orden ASC, nombre_es ASC`);
    return rows;
  }

  public async updateCategory(id: string, dto: Partial<CategoryDto>) {
    const { rows } = await db.query(
      `UPDATE category 
       SET nombre_es = COALESCE($1, nombre_es),
           nombre_en = COALESCE($2, nombre_en),
           orden = COALESCE($3, orden)
       WHERE id = $4
       RETURNING *`,
      [dto.nombre_es, dto.nombre_en, dto.orden, id]
    );
    if (!rows[0]) throw new AppError('CATEGORY_NOT_FOUND', 'Categoría no encontrada', 404);
    await this.invalidateMenuCache();
    return rows[0];
  }

  public async deleteCategory(id: string) {
    const dishCount = await db.query(`SELECT COUNT(*) as count FROM dish WHERE category_id = $1`, [id]);
    if (Number(dishCount.rows[0].count) > 0) {
      throw new AppError('CATEGORY_NOT_EMPTY', 'No se puede eliminar una categoría que contiene platos asociados', 409);
    }
    const { rowCount } = await db.query(`DELETE FROM category WHERE id = $1`, [id]);
    if (!rowCount || rowCount === 0) throw new AppError('CATEGORY_NOT_FOUND', 'Categoría no encontrada', 404);
    await this.invalidateMenuCache();
  }

  // --- PLATOS ---
  public async createDish(dto: DishDto) {
    const cat = await db.query(`SELECT id FROM category WHERE id = $1`, [dto.category_id]);
    if (!cat.rows[0]) throw new AppError('CATEGORY_NOT_FOUND', 'Categoría inexistente', 404);

    const { rows } = await db.query(
      `INSERT INTO dish (category_id, nombre_es, nombre_en, descripcion_es, descripcion_en, imagen, alergenos, limite_por_ronda, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING *`,
      [
        dto.category_id,
        dto.nombre_es,
        dto.nombre_en,
        dto.descripcion_es,
        dto.descripcion_en,
        dto.imagen,
        JSON.stringify(dto.alergenos),
        dto.limite_por_ronda,
        dto.activo
      ]
    );
    await this.invalidateMenuCache();
    return rows[0]!;
  }

  public async listDishes(categoryId?: string) {
    let query = `SELECT d.*, c.nombre_es as categoria_nombre_es, c.nombre_en as categoria_nombre_en 
                 FROM dish d 
                 JOIN category c ON c.id = d.category_id`;
    const params: unknown[] = [];
    if (categoryId) {
      query += ` WHERE d.category_id = $1`;
      params.push(categoryId);
    }
    query += ` ORDER BY c.orden ASC, d.nombre_es ASC`;
    const { rows } = await db.query(query, params);
    return rows;
  }

  public async updateDish(id: string, dto: Partial<DishDto>) {
    const existing = await db.query(`SELECT * FROM dish WHERE id = $1`, [id]);
    if (!existing.rows[0]) throw new AppError('DISH_NOT_FOUND', 'Plato no encontrado', 404);

    const current = existing.rows[0];
    const { rows } = await db.query(
      `UPDATE dish 
       SET category_id = COALESCE($1, category_id),
           nombre_es = COALESCE($2, nombre_es),
           nombre_en = COALESCE($3, nombre_en),
           descripcion_es = COALESCE($4, descripcion_es),
           descripcion_en = COALESCE($5, descripcion_en),
           imagen = COALESCE($6, imagen),
           alergenos = COALESCE($7::jsonb, alergenos),
           limite_por_ronda = COALESCE($8, limite_por_ronda),
           activo = COALESCE($9, activo)
       WHERE id = $10
       RETURNING *`,
      [
        dto.category_id ?? current.category_id,
        dto.nombre_es ?? current.nombre_es,
        dto.nombre_en ?? current.nombre_en,
        dto.descripcion_es ?? current.descripcion_es,
        dto.descripcion_en ?? current.descripcion_en,
        dto.imagen ?? current.imagen,
        dto.alergenos ? JSON.stringify(dto.alergenos) : null,
        dto.limite_por_ronda ?? current.limite_por_ronda,
        dto.activo ?? current.activo,
        id
      ]
    );

    await this.invalidateMenuCache();
    return rows[0];
  }

  public async deleteDish(id: string) {
    const { rowCount } = await db.query(`DELETE FROM dish WHERE id = $1`, [id]);
    if (!rowCount || rowCount === 0) throw new AppError('DISH_NOT_FOUND', 'Plato no encontrado', 404);
    await this.invalidateMenuCache();
  }

  // --- TARIFAS ---
  public async createTariff(dto: TariffDto) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO tariff (nombre, precio, duracion_max_min, platos_por_ronda, pausa_entre_rondas_s, activo)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [dto.nombre, dto.precio, dto.duracion_max_min, dto.platos_por_ronda, dto.pausa_entre_rondas_s, dto.activo]
      );
      const tariff = rows[0]!;

      if (dto.dish_ids && dto.dish_ids.length > 0) {
        for (const dishId of dto.dish_ids) {
          await client.query(
            `INSERT INTO tariff_dish (tariff_id, dish_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [tariff.id, dishId]
          );
        }
      }

      await client.query('COMMIT');
      await this.invalidateMenuCache();
      return tariff;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  public async listTariffs() {
    const { rows } = await db.query(`SELECT * FROM tariff ORDER BY precio ASC`);
    return rows;
  }

  public async assignDishesToTariff(tariffId: string, dishIds: string[]) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query(`DELETE FROM tariff_dish WHERE tariff_id = $1`, [tariffId]);
      for (const dishId of dishIds) {
        await client.query(
          `INSERT INTO tariff_dish (tariff_id, dish_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [tariffId, dishId]
        );
      }
      await client.query('COMMIT');
      await this.invalidateMenuCache();
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const adminCatalogService = new AdminCatalogService();
