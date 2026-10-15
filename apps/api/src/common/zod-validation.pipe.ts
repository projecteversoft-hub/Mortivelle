import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ErrorCode } from '@tech-realty-rentals/shared';
import { DomainException } from './domain-exception';

/**
 * Validates (and normalizes/coerces, e.g. lower-casing email) a request body/query against
 * a shared Zod schema. All external input is validated at the API boundary this way
 * (CLAUDE.md §5); failures surface as the shared ApiError shape with per-field messages.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.length > 0 ? issue.path.join('.') : '_';
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new DomainException(ErrorCode.ValidationFailed, HttpStatus.BAD_REQUEST, fieldErrors);
    }
    return result.data;
  }
}
