import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@ethio-tour/contracts';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      service: 'api',
      status: 'ok',
      phase: '1B',
      timestamp: new Date().toISOString(),
    };
  }
}
