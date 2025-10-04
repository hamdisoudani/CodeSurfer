import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { SupabaseService } from '../lib/supabase';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'NATS_CLIENT',
        transport: Transport.NATS,
        options: {
          servers: [process.env.NATS_URL || 'nats://localhost:4222'],
        },
      },
    ]),
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, SupabaseService],
  exports: [WorkspacesService], // Export for use in other modules (like indexer communication)
})
export class WorkspacesModule {}
