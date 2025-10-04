import { Module } from '@nestjs/common';
import { BackendGrpcController } from './backend.controller';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { InstallationsModule } from '../installations/installations.module';
import { SupabaseService } from '../lib/supabase';

@Module({
  imports: [WorkspacesModule, InstallationsModule],
  controllers: [BackendGrpcController],
  providers: [SupabaseService],
})
export class GrpcModule {}

