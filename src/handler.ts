// Handler del Lambda HTTP, lee y parsea el body del evento

import { nanoid } from 'nanoid';
import { RequestSchema } from './lib/schema';
import { buildEmptyAggregateResponse, type AggregateResponse } from './lib/response';
import { aggregateClaim } from './lib/aggregate';

// Handler de Lambda (entry point)
export const main = async (event: any) => {
  const correlationId = nanoid(); // ID unico por request

  try {
    const rawBody = typeof event?.body === 'string' ? event.body : JSON.stringify(event?.body || '{}');
    const body = JSON.parse(rawBody ?? '{}');

    const parsed = RequestSchema.safeParse(body);

    // Retorna 442 si la validacion falla
    if (!parsed.success) {
      return {
        statusCode: 422,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid payload',
          details: parsed.error.flatten()
        })
      };
    }

    const { claim_id, images } = parsed.data;

    const agg = await aggregateClaim(images);

    // Response tiene tipo AggregateResponse (mutable)
    const response: AggregateResponse = buildEmptyAggregateResponse({
      claim_id,
      total: images.length
    });

    // resultados del agregado en la estructura de salida
    response.source_images = agg.source_images;
    response.areas = agg.areas;
    response.overall_damage_severity = agg.overall_damage_severity;
    response.data_gaps = agg.data_gaps;
    response.confidence = agg.confidence;

    // Retorna exitoso 200
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(response)
    };

  } catch (err: any) {
    console.error('Handler error:', err?.message, err?.stack); // Log de error para CloudWatch

    // Retorna 500 cpara el reporte de error
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: err?.message || 'unexpected',
        correlation_id: correlationId
      })
    };
  }
};
