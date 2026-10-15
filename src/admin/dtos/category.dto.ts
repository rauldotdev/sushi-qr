import { z } from 'zod';

export const categorySchema = z.object({
  nombre_es: z.string().min(1, 'El nombre en español es obligatorio'),
  nombre_en: z.string().min(1, 'El nombre en inglés es obligatorio'),
  orden: z.coerce.number().int().default(0)
});

export type CategoryDto = z.infer<typeof categorySchema>;
