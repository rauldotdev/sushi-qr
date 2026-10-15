import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { adminCatalogService } from '../services/adminCatalogService.js';
import { categorySchema } from '../dtos/category.dto.js';
import { dishSchema } from '../dtos/dish.dto.js';
import { tariffSchema } from '../dtos/tariff.dto.js';
import { authorizeRole } from '../../common/middleware/authMiddleware.js';
import { AppError } from '../../common/errors/appError.js';

export const adminCatalogRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.addHook('preHandler', app.authenticateStaff);
  app.addHook('preHandler', authorizeRole(['admin']));

  // --- CATEGORÍAS ---
  app.post('/categories', async (request, reply) => {
    const parseResult = categorySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }
    const category = await adminCatalogService.createCategory(parseResult.data);
    return reply.status(201).send({ category });
  });

  app.get('/categories', async (_request, reply) => {
    const categories = await adminCatalogService.listCategories();
    return reply.status(200).send({ categories });
  });

  app.put('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = categorySchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }
    const category = await adminCatalogService.updateCategory(id, parseResult.data);
    return reply.status(200).send({ category });
  });

  app.delete('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await adminCatalogService.deleteCategory(id);
    return reply.status(200).send({ message: 'Categoría eliminada' });
  });

  // --- PLATOS ---
  app.post('/dishes', async (request, reply) => {
    const parseResult = dishSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }
    const dish = await adminCatalogService.createDish(parseResult.data);
    return reply.status(201).send({ dish });
  });

  app.get('/dishes', async (request, reply) => {
    const { category_id } = request.query as { category_id?: string };
    const dishes = await adminCatalogService.listDishes(category_id);
    return reply.status(200).send({ dishes });
  });

  app.put('/dishes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = dishSchema.partial().safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }
    const dish = await adminCatalogService.updateDish(id, parseResult.data);
    return reply.status(200).send({ dish });
  });

  app.delete('/dishes/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await adminCatalogService.deleteDish(id);
    return reply.status(200).send({ message: 'Plato eliminado' });
  });

  // --- TARIFAS ---
  app.post('/tariffs', async (request, reply) => {
    const parseResult = tariffSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }
    const tariff = await adminCatalogService.createTariff(parseResult.data);
    return reply.status(201).send({ tariff });
  });

  app.get('/tariffs', async (_request, reply) => {
    const tariffs = await adminCatalogService.listTariffs();
    return reply.status(200).send({ tariffs });
  });

  app.post('/tariffs/:id/dishes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { dish_ids } = request.body as { dish_ids: string[] };
    if (!Array.isArray(dish_ids)) {
      throw new AppError('VALIDATION_ERROR', 'dish_ids debe ser un array', 400);
    }
    await adminCatalogService.assignDishesToTariff(id, dish_ids);
    return reply.status(200).send({ message: 'Platos asignados a la tarifa' });
  });
};
