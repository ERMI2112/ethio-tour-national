import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import {
  createBackendRuntime,
  OutboxNotificationDispatcher,
  PostgresRegistryStore,
} from '@ethio-tour/backend-domain';
import { createDatabase } from '@ethio-tour/db';
import type { DatabaseClient } from '@ethio-tour/db';

@Injectable()
export class WorkerRuntimeService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private pollTimer: NodeJS.Timeout | undefined;
  private polling = false;
  private client: DatabaseClient | undefined;
  private dispatcher: OutboxNotificationDispatcher | undefined;

  onModuleInit(): void {
    const runtime = createBackendRuntime('worker');
    this.logger.log(`worker runtime started; database configured: ${runtime.databaseConfigured}`);
    const database = createDatabase();
    this.client = database.client;
    this.dispatcher = new OutboxNotificationDispatcher(new PostgresRegistryStore(database.client));
    const configuredInterval = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5000);
    const pollInterval = Number.isFinite(configuredInterval)
      ? Math.max(1000, configuredInterval)
      : 5000;
    this.pollTimer = setInterval(() => void this.dispatchOutbox(), pollInterval);
    void this.dispatchOutbox();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    while (this.polling) await new Promise((resolve) => setTimeout(resolve, 10));
    await this.client?.end({ timeout: 5 });
  }

  private async dispatchOutbox(): Promise<void> {
    if (!this.dispatcher || this.polling) return;
    this.polling = true;
    try {
      const dispatched = await this.dispatcher.dispatchBatch();
      if (dispatched > 0) this.logger.log(`outbox events processed: ${dispatched}`);
    } catch {
      this.logger.error('Outbox dispatch failed; pending events remain available for retry.');
    } finally {
      this.polling = false;
    }
  }
}
