import { z } from 'zod';

export const orderItemSchema = z.object({
  dish_id: z.string().uuid('ID de plato inválido'),
  cantidad: z.coerce.number().int().min(1, 'La cantidad mínima es 1').max(20, 'Cantidad máxima excedida')
});

export const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'La comanda debe tener al menos un plato'),
  idempotency_key: z.string().min(10, 'Idempotency key debe tener al menos 10 caracteres').max(64)
});

export type OrderItemDto = z.infer<typeof orderItemSchema>;
export type CreateOrderDto = z.infer<typeof createOrderSchema>;
