// Esquema base para la estructura del pedido que llegara a la API

import { z } from 'zod';

export const RequestSchema = z.object({
  claim_id: z.string().min(1, { message: 'claim_id es requerido' }),
  loss_type: z.literal('wind'),
  images: z
    .array(
      z.string().refine(
        (val) => {
          try {
            new URL(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: 'Cada imagen debe ser una URL válida' }
      )
    )
    .min(1, { message: 'images no puede estar vacío' })
    .max(100, { message: 'Máximo 100 imágenes' })
});

export type AggregationRequest = z.infer<typeof RequestSchema>;