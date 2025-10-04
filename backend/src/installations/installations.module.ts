import { Module } from '@nestjs/common';
import { InstallationsController } from './installations.controller';
import { InstallationsService } from './installations.service';
import { SupabaseService } from '../lib/supabase';
import { RedisModule } from '../lib/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [InstallationsController],
  providers: [InstallationsService, SupabaseService],
  exports: [InstallationsService], // Export for use in other modules (like gRPC service)
})
export class InstallationsModule {}


