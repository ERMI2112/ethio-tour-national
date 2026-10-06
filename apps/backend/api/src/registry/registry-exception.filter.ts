import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';

import { RegistryError } from '@ethio-tour/backend-domain';

@Catch(RegistryError)
export class RegistryExceptionFilter implements ExceptionFilter<RegistryError> {
  catch(exception: RegistryError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: { statusCode: number; message: string }): void };
    }>();
    const statusCode = {
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      invalid: 400,
    }[exception.code];
    const message = {
      unauthenticated: 'Authentication is required.',
      forbidden: 'The requested operation is not authorized.',
      not_found: 'Registry resource was not found.',
      conflict: 'The registry state changed; reload before retrying.',
      invalid: 'The registry request is invalid.',
    }[exception.code];
    response.status(statusCode).json({ statusCode, message });
  }
}
