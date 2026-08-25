import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AggregatorWebhookRepository } from './aggregator-webhook.repository';

@Module({
  controllers: [AppController],
  providers: [AggregatorWebhookRepository],
})
export class AppModule {}
