import type { RegistryStore } from './registry-store';

export class OutboxNotificationDispatcher {
  constructor(private readonly store: RegistryStore) {}

  dispatchBatch(limit = 50): Promise<number> {
    return this.store.dispatchOutbox(limit);
  }
}
