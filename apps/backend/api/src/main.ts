import 'reflect-metadata';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { createBackendRuntime } from '@ethio-tour/backend-domain';
import { migrateDatabase } from '@ethio-tour/db';

import { AppModule } from './app.module';
import { corsAllowedOrigins } from './security/cors';

async function bootstrap(): Promise<void> {
  const runtime = createBackendRuntime('api');

  if (process.env.RUN_MIGRATIONS === 'true') {
    await migrateDatabase();
  }

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: corsAllowedOrigins() });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );

  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
  console.info(
    `${runtime.serviceName} foundation started; database configured: ${runtime.databaseConfigured}`,
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
