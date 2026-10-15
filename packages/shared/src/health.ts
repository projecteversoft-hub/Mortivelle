import { z } from 'zod';

export const livenessResponseSchema = z.object({ status: z.literal('ok') });
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/** Readiness is deliberately coarse: no infrastructure detail is exposed publicly. */
export const readinessResponseSchema = z.object({ status: z.enum(['ok', 'unavailable']) });
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
