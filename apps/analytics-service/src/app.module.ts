import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AnalyticsRepository } from './analytics.repository';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AnalyticsRepository],
})
export class AppModule {}
