import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { OrderRepository } from './order.repository';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [OrderRepository],
})
export class AppModule {}
