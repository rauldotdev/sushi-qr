import { z } from 'zod';

export const openTableSchema = z.object({
  tariff_id: z.string().uuid('El ID de tarifa debe ser un UUID válido'),
  comensales: z.coerce.number().int().min(1, 'Debe haber al menos 1 comensal').max(30, 'Máximo 30 comensales por mesa')
});

export type OpenTableDto = z.infer<typeof openTableSchema>;
