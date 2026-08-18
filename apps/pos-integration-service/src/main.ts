import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { TracingInterceptor } from '@pinaka-delivery-hub/observability';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new TracingInterceptor());
  const port = process.env.PORT || 3007;
  await app.listen(port);
  console.log(`🚀 POS Integration Service running on http://localhost:${port}`);
  console.log(`🔌 Target POS Web App: https://merchantrestaurant.alektasolutions.com/ (Store: Pinaka_013)`);
}
bootstrap();
