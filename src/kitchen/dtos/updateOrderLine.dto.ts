import { z } from 'zod';

export const updateOrderLineSchema = z.object({
  estado: z.enum(['en_cola', 'en_cocina', 'servido', 'cancelado']),
  motivo: z.string().trim().max(255).optional()
});

export type UpdateOrderLineDto = z.infer<typeof updateOrderLineSchema>;
