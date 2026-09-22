import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  await NestFactory.createApplicationContext(AppModule);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
