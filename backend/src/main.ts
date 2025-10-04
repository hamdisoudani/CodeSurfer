import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  // Create HTTP application
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: [process.env.FRONTEND_ORIGIN || 'http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Create gRPC microservice
  const grpcApp = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: 'backend',
      protoPath: join(__dirname, '../proto/backend.proto'),
      url: '0.0.0.0:50052',
    },
  });

  // Start both servers
  await grpcApp.listen();
  console.log('🚀 gRPC server listening on 0.0.0.0:50052');
  
  await app.listen(process.env.BACKEND_PORT ?? 3000);
  console.log(`🚀 HTTP server listening on port ${process.env.BACKEND_PORT ?? 3000}`);
}
bootstrap();
