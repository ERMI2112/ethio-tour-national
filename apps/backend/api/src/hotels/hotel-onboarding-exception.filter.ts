import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';

import { HotelOnboardingError } from '@ethio-tour/backend-domain';

@Catch(HotelOnboardingError)
export class HotelOnboardingExceptionFilter implements ExceptionFilter<HotelOnboardingError> {
  catch(exception: HotelOnboardingError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: { statusCode: number; message: string }): void };
    }>();
    const statusCode = {
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      invalid: 400,
      unavailable: 503,
    }[exception.code];
    const message = {
      unauthenticated: 'Authentication is required.',
      forbidden: 'The requested hotel operation is not authorized.',
      not_found: 'The private hotel application was not found.',
      conflict: 'The hotel application changed; reload before retrying.',
      invalid: exception.reason,
      unavailable: 'The synthetic hotel pilot is unavailable.',
    }[exception.code];
    response.status(statusCode).json({ statusCode, message });
  }
}
