import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { InventoryRepository } from './inventory.repository';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [InventoryRepository],
})
export class AppModule {}
