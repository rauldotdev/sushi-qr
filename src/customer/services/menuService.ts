import crypto from 'node:crypto';
import { db } from '../../main/database/db.js';
import { redis } from '../../main/redis/redisClient.js';

export interface MenuDish {
  id: string;
  nombre_es: string;
  nombre_en: string;
  descripcion_es: string;
  descripcion_en: string;
  imagen: string;
  alergenos: string[];
  limite_por_ronda: number;
}

export interface MenuCategory {
  id: string;
  nombre_es: string;
  nombre_en: string;
  orden: number;
  platos: MenuDish[];
}

export interface CachedMenu {
  tariffId: string;
  etag: string;
  categories: MenuCategory[];
}

export class MenuService {
  /**
   * Genera el hash ETag determinista a partir del contenido de la carta
   */
  public generateEtag(payload: unknown): string {
    return `"${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}"`;
  }

  /**
   * Obtiene la carta de la tarifa desde Redis o PostgreSQL con soporte de ETag y 304
   */
  public async getMenu(
    tariffId: string,
    clientEtag?: string,
    excludeAllergens: string[] = []
  ): Promise<{ notModified: boolean; etag: string; menu?: MenuCategory[] }> {
    const redisClient = redis.getClient();
    const cacheKey = `menu:tariff:${tariffId}`;

    let cachedData: CachedMenu | null = null;
    const rawCache = await redisClient.get(cacheKey);

    if (rawCache) {
      cachedData = JSON.parse(rawCache) as CachedMenu;
    } else {
      // 1. Fallo de caché en Redis: consultar PostgreSQL
      const { rows } = await db.query(
        `SELECT c.id as category_id, c.nombre_es as cat_nombre_es, c.nombre_en as cat_nombre_en, c.orden as cat_orden,
                d.id as dish_id, d.nombre_es as dish_nombre_es, d.nombre_en as dish_nombre_en,
                d.descripcion_es, d.descripcion_en, d.imagen, d.alergenos, d.limite_por_ronda
         FROM category c
         JOIN dish d ON d.category_id = c.id AND d.activo = true
         JOIN tariff_dish td ON td.dish_id = d.id AND td.tariff_id = $1
         ORDER BY c.orden ASC, d.nombre_es ASC`,
        [tariffId]
      );

      const categoryMap = new Map<string, MenuCategory>();

      for (const row of rows) {
        if (!categoryMap.has(row.category_id)) {
          categoryMap.set(row.category_id, {
            id: row.category_id,
            nombre_es: row.cat_nombre_es,
            nombre_en: row.cat_nombre_en,
            orden: row.cat_orden,
            platos: []
          });
        }

        const cat = categoryMap.get(row.category_id)!;
        const alergenosArray = typeof row.alergenos === 'string' ? JSON.parse(row.alergenos) : (row.alergenos || []);

        cat.platos.push({
          id: row.dish_id,
          nombre_es: row.dish_nombre_es,
          nombre_en: row.dish_nombre_en,
          descripcion_es: row.descripcion_es || '',
          descripcion_en: row.descripcion_en || '',
          imagen: row.imagen || '',
          alergenos: alergenosArray,
          limite_por_ronda: row.limite_por_ronda
        });
      }

      const categories = Array.from(categoryMap.values());
      const etag = this.generateEtag(categories);

      cachedData = {
        tariffId,
        etag,
        categories
      };

      // Guardar en Redis con TTL de 1 hora (se invalida atómicamente si admin modifica)
      await redisClient.set(cacheKey, JSON.stringify(cachedData), 'EX', 3600);
    }

    // 2. Comprobación condicional ETag (HTTP 304 Not Modified)
    if (clientEtag && clientEtag === cachedData.etag && excludeAllergens.length === 0) {
      return { notModified: true, etag: cachedData.etag };
    }

    // 3. Filtrado por alérgenos si se solicitó
    let filteredCategories = cachedData.categories;
    if (excludeAllergens.length > 0) {
      filteredCategories = cachedData.categories.map((cat) => ({
        ...cat,
        platos: cat.platos.filter((dish) =>
          !dish.alergenos.some((a) => excludeAllergens.includes(a.toLowerCase()))
        )
      }));
    }

    return {
      notModified: false,
      etag: cachedData.etag,
      menu: filteredCategories
    };
  }
}

export const menuService = new MenuService();
