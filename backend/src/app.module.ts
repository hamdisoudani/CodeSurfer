import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InstallationsModule } from './installations/installations.module';
import { AuthModule } from './auth/auth.module';
import { DebugModule } from './debug/debug.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { GrpcModule } from './grpc/grpc.module';

@Module({
  imports: [
    // Loads environment variables from .env into process.env
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    InstallationsModule,
    WorkspacesModule,
    DebugModule,
    GrpcModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
