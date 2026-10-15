import { z } from 'zod';

export const dishSchema = z.object({
  category_id: z.string().uuid('ID de categoría inválido'),
  nombre_es: z.string().min(1, 'El nombre en español es obligatorio'),
  nombre_en: z.string().min(1, 'El nombre en inglés es obligatorio'),
  descripcion_es: z.string().optional().default(''),
  descripcion_en: z.string().optional().default(''),
  imagen: z.string().optional().default(''),
  alergenos: z.array(z.string()).default([]),
  limite_por_ronda: z.coerce.number().int().min(1).default(2),
  activo: z.boolean().default(true)
});

export type DishDto = z.infer<typeof dishSchema>;
