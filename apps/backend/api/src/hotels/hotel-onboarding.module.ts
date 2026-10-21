import { Injectable, Module } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';

import { createDatabase } from '@ethio-tour/db';
import type { DatabaseClient } from '@ethio-tour/db';
import {
  HotelOnboardingService,
  PostgresHotelOnboardingStore,
  hotelPilotSettings,
} from '@ethio-tour/backend-domain';

import { KeycloakAuthGuard } from '../auth/keycloak-auth.guard';
import { HotelRequestBodyGuard } from './hotel-request-body.guard';
import {
  AdministratorHotelAdmissionsController,
  BureauHotelCasesController,
  HotelApplicationsController,
} from './hotel-onboarding.controller';

@Injectable()
class HotelOnboardingRuntime implements OnModuleDestroy {
  private readonly client: DatabaseClient;
  readonly service: HotelOnboardingService;

  constructor() {
    const database = createDatabase();
    this.client = database.client;
    this.service = new HotelOnboardingService(
      new PostgresHotelOnboardingStore(database.client),
      hotelPilotSettings(),
    );
  }

  onModuleDestroy(): Promise<void> {
    return this.client.end({ timeout: 5 });
  }
}

@Module({
  controllers: [
    HotelApplicationsController,
    BureauHotelCasesController,
    AdministratorHotelAdmissionsController,
  ],
  providers: [
    HotelOnboardingRuntime,
    KeycloakAuthGuard,
    HotelRequestBodyGuard,
    {
      provide: HotelOnboardingService,
      useFactory: (runtime: HotelOnboardingRuntime) => runtime.service,
      inject: [HotelOnboardingRuntime],
    },
  ],
})
export class HotelOnboardingModule {}
