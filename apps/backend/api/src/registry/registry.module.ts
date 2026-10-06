import { Injectable, Module } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';

import { createDatabase } from '@ethio-tour/db';
import type { DatabaseClient } from '@ethio-tour/db';
import { PostgresRegistryStore, RegistryService } from '@ethio-tour/backend-domain';

import { KeycloakAuthGuard } from '../auth/keycloak-auth.guard';
import { PublicRegistryController } from './public-registry.controller';
import { RegistryController } from './registry.controller';

@Injectable()
class RegistryRuntime implements OnModuleDestroy {
  private readonly client: DatabaseClient;
  readonly service: RegistryService;

  constructor() {
    const database = createDatabase();
    this.client = database.client;
    this.service = new RegistryService(new PostgresRegistryStore(database.client));
  }

  onModuleDestroy(): Promise<void> {
    return this.client.end({ timeout: 5 });
  }
}

@Module({
  controllers: [RegistryController, PublicRegistryController],
  providers: [
    RegistryRuntime,
    KeycloakAuthGuard,
    {
      provide: RegistryService,
      useFactory: (runtime: RegistryRuntime) => runtime.service,
      inject: [RegistryRuntime],
    },
  ],
})
export class RegistryModule {}
