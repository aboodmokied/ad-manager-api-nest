import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  PrismaClientInitializationError,
  PrismaClientKnownRequestError,
} from '@prisma/client/runtime/library';
import { Response } from 'express';

/**
 * Maps Prisma (database) errors to meaningful HTTP responses:
 * - unique constraint violations -> 409
 * - missing records -> 404
 * - database unavailable/connection issues -> 503
 */
@Catch(PrismaClientKnownRequestError, PrismaClientInitializationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status: HttpStatus;
    let message: string;

    if (exception instanceof PrismaClientInitializationError) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Database is currently unavailable. Please try again later.';
    } else {
      switch (exception.code) {
        case 'P2000':
          status = HttpStatus.BAD_REQUEST;
          message = 'A field value is too long for the database column.';
          break;
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'A record with this value already exists.';
          break;
        case 'P2003':
          status = HttpStatus.CONFLICT;
          message =
            'The record is referenced by other data and cannot be saved.';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'The requested record was not found.';
          break;
        case 'P1000':
        case 'P1001':
        case 'P1002':
        case 'P1003':
        case 'P1017':
          status = HttpStatus.SERVICE_UNAVAILABLE;
          message =
            'Database is currently unavailable. Please try again later.';
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = 'A database error occurred. Please try again later.';
          break;
      }
    }

    this.logger.error(
      `Prisma error (${exception.code ?? 'init'}): ${exception.message}`,
      exception.stack,
    );

    response.status(status).json({
      statusCode: status,
      message,
      error: 'Database Error',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
