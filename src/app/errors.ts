import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from './errors/error-classes';
import { ErrorCode } from './errors/error-codes';
import { ZodError } from 'zod';

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      this.logger.warn(`AppError ${exception.code} (${exception.statusCode})`);
      response.status(exception.statusCode).json({
        error: exception.code,
        ...(exception.fields ? { fields: exception.fields } : {}),
        ...(exception.detail ? { detail: exception.detail } : {}),
        ...(exception.meta ? { meta: exception.meta } : {}),
      });
      return;
    }

    if (exception instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of exception.issues) {
        const path = issue.path.join('.');
        // eslint-disable-next-line security/detect-object-injection -- path is from Zod schema keys, not user-controlled property access
        fields[path] = issue.message;
      }
      this.logger.warn(`ZodError: ${JSON.stringify(fields)}`);
      response.status(HttpStatus.BAD_REQUEST).json({
        error: ErrorCode.VALIDATION_ERROR,
        fields,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.warn(`HttpException ${status}`);
      response.status(status).json({
        error: ErrorCode.HTTP_ERROR,
        detail: exception.message,
      });
      return;
    }

    this.logger.error(
      'Unhandled error',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: ErrorCode.INTERNAL_ERROR,
    });
  }
}

export { AppError } from './errors/error-classes';
export * from './errors/error-codes';
export * from './errors/error-classes';
