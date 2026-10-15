import { z } from 'zod';

export const listKitchenOrdersSchema = z.object({
  status: z.enum(['en_cola', 'en_cocina', 'servido', 'cancelado']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

export type ListKitchenOrdersDto = z.infer<typeof listKitchenOrdersSchema>;
