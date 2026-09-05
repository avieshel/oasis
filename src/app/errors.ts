import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export interface AppErrorOptions {
  statusCode: number;
  code: string;
  fields?: Record<string, string>;
  detail?: string;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly detail?: string;

  constructor(options: AppErrorOptions) {
    super(options.code);
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.fields = options.fields;
    this.detail = options.detail;
  }
}

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
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.warn(`HttpException ${status}`);
      response.status(status).json({
        error: 'http_error',
        detail: exception.message,
      });
      return;
    }

    this.logger.error(
      'Unhandled error',
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'internal_server_error',
    });
  }
}
