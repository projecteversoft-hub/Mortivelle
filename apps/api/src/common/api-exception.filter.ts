import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode, type ApiError } from '@tech-realty-rentals/shared';
import { DOMAIN_ERROR_MESSAGES, DomainException } from './domain-exception';

const STATUS_TO_CODE: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BadRequest,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.Unauthorized,
  [HttpStatus.FORBIDDEN]: ErrorCode.Forbidden,
  [HttpStatus.NOT_FOUND]: ErrorCode.NotFound,
  [HttpStatus.CONFLICT]: ErrorCode.Conflict,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PayloadTooLarge,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RateLimited,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.ServiceUnavailable,
};

const SAFE_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'The request is invalid.',
  [HttpStatus.UNAUTHORIZED]: 'Authentication is required.',
  [HttpStatus.FORBIDDEN]: 'You do not have access to this resource.',
  [HttpStatus.NOT_FOUND]: 'The requested resource was not found.',
  [HttpStatus.CONFLICT]: 'The request conflicts with the current state.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'The request body is too large.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests. Please try again later.',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable.',
};

/**
 * Maps every error to the shared ApiError shape. Messages come from a fixed safe table, so
 * stack traces, database errors, and provider payloads can never leak to clients.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // DomainException is the only way application code attaches a specific code/message
    // beyond the generic status-based tables below; its shape is fully controlled by us.
    if (exception instanceof DomainException) {
      const body: ApiError = {
        code: exception.errorCode,
        message: DOMAIN_ERROR_MESSAGES[exception.errorCode] ?? 'The request is invalid.',
        ...(exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
        requestId: req.requestId ?? 'unknown',
      };
      res.status(exception.getStatus()).json(body);
      return;
    }

    // body-parser style errors expose a numeric `status` rather than being HttpExceptions.
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : typeof (exception as { status?: unknown })?.status === 'number'
          ? (exception as { status: number }).status
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const known = status in STATUS_TO_CODE;
    if (!known && status >= 500) {
      this.logger.error(
        `Unhandled error on ${req.method} ${req.originalUrl.split('?')[0]}: ${
          exception instanceof Error ? exception.name : 'unknown'
        }`,
      );
    }

    const body: ApiError = {
      code: STATUS_TO_CODE[status] ?? (status >= 500 ? ErrorCode.Internal : ErrorCode.BadRequest),
      message:
        SAFE_MESSAGES[status] ??
        (status >= 500 ? 'An unexpected error occurred.' : 'The request is invalid.'),
      requestId: req.requestId ?? 'unknown',
    };
    res.status(known || status < 500 ? status : HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
