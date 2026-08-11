import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { MerchantRepository } from './merchant.repository';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [MerchantRepository],
})
export class AppModule {}
