import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { TracingInterceptor } from '@pinaka-delivery-hub/observability';
import { AppModule } from './app.module';

try {
  process.loadEnvFile('.env');
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code !== 'ENOENT') throw error;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalInterceptors(new TracingInterceptor());
  const port = process.env.CONNECTOR_SERVICE_PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Connector Service running on http://localhost:${port}`);
}
bootstrap();
