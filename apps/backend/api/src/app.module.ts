import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthModule } from './health/health.module';
import { RegistryModule } from './registry/registry.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule, RegistryModule],
})
export class AppModule {}
