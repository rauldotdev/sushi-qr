import { z } from 'zod';

export const tariffSchema = z.object({
  nombre: z.string().min(1, 'El nombre de la tarifa es obligatorio'),
  precio: z.coerce.number().positive('El precio debe ser positivo'),
  duracion_max_min: z.coerce.number().int().min(15).default(100),
  platos_por_ronda: z.coerce.number().int().min(1).default(8),
  pausa_entre_rondas_s: z.coerce.number().int().min(0).default(600),
  activo: z.boolean().default(true),
  dish_ids: z.array(z.string().uuid()).optional()
});

export type TariffDto = z.infer<typeof tariffSchema>;
