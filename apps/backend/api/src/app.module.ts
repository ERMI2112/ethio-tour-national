import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthModule } from './health/health.module';
import { HotelOnboardingModule } from './hotels/hotel-onboarding.module';
import { RegistryModule } from './registry/registry.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    RegistryModule,
    HotelOnboardingModule,
  ],
})
export class AppModule {}
