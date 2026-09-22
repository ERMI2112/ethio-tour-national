import { Module } from '@nestjs/common';

import { WorkerRuntimeService } from './worker-runtime.service';

@Module({
  providers: [WorkerRuntimeService],
})
export class AppModule {}
