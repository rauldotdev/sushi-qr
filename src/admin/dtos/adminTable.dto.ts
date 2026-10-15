import { z } from 'zod';

export const createTableSchema = z.object({
  numero: z.coerce.number().int().positive('El número de mesa debe ser un entero positivo'),
  restaurant_id: z.string().uuid().optional()
});

export type CreateTableDto = z.infer<typeof createTableSchema>;
