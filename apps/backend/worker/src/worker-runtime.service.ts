import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { createBackendRuntime } from '@ethio-tour/backend-domain';

@Injectable()
export class WorkerRuntimeService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private heartbeatTimer: NodeJS.Timeout | undefined;

  onModuleInit(): void {
    const runtime = createBackendRuntime('worker');
    this.logger.log(
      `worker foundation started; database configured: ${runtime.databaseConfigured}`,
    );
    this.heartbeatTimer = setInterval(() => {
      this.logger.debug('worker foundation heartbeat');
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }
}
