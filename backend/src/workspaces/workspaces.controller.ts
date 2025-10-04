import { Controller, Get, Post, Param, Body, UseGuards, Request, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto, WorkspaceStatusDto, IndexJobDto, SnapshotDto } from './dto/create-workspace.dto';
import { SupabaseAuthGuard } from '../auth.guard';

@Controller('workspaces')
@UseGuards(SupabaseAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post('upsert')
  async upsertWorkspace(@Request() req: any, @Body() createWorkspaceDto: CreateWorkspaceDto) {
    const authUserId = req.user?.id || req.user?.sub;
    if (!authUserId) {
      throw new Error('User not authenticated');
    }
    
    console.log('📝 Controller: Upserting workspace for user:', authUserId);
    const result = await this.workspacesService.upsertWorkspace(authUserId, createWorkspaceDto);
    
    return {
      success: true,
      workspace: result,
      message: 'Workspace created/updated successfully',
    };
  }

  @Get()
  async getUserWorkspaces(@Request() req: any) {
    const authUserId = req.user?.id || req.user?.sub;
    if (!authUserId) {
      throw new Error('User not authenticated');
    }
    
    console.log('📋 Controller: Fetching workspaces for user:', authUserId);
    const workspaces = await this.workspacesService.getUserWorkspaces(authUserId);
    
    return {
      success: true,
      workspaces,
      count: workspaces.length,
    };
  }

  @Get(':id/status')
  async getWorkspaceStatus(@Request() req: any, @Param('id') workspaceId: string) {
    const authUserId = req.user?.id || req.user?.sub;
    if (!authUserId) {
      throw new Error('User not authenticated');
    }
    
    console.log('📊 Controller: Fetching status for workspace:', workspaceId);
    const status = await this.workspacesService.getWorkspaceStatus(authUserId, workspaceId);
    
    return {
      success: true,
      ...status,
    };
  }

  @Post(':id/index')
  async startIndexing(
    @Request() req: any, 
    @Param('id') workspaceId: string,
    @Body() indexJobDto: IndexJobDto
  ) {
    const authUserId = req.user?.id || req.user?.sub;
    if (!authUserId) {
      throw new Error('User not authenticated');
    }
    
    console.log('🚀 Controller: Starting indexing for workspace:', workspaceId);
    const result = await this.workspacesService.startIndexing(authUserId, workspaceId, indexJobDto);
    
    return {
      success: true,
      ...result,
    };
  }

  @Post(':id/snapshot')
  async createSnapshot(
    @Request() req: any, 
    @Param('id') workspaceId: string,
    @Body() snapshotDto: SnapshotDto
  ) {
    const authUserId = req.user?.id || req.user?.sub;
    if (!authUserId) {
      throw new Error('User not authenticated');
    }
    
    console.log('📸 Controller: Creating snapshot for workspace:', workspaceId);
    const result = await this.workspacesService.createSnapshot(authUserId, workspaceId, snapshotDto.description);
    
    return {
      success: true,
      ...result,
    };
  }

  @Post(':id/mark-stale')
  async markStale(@Request() req: any, @Param('id') workspaceId: string) {
    const authUserId = req.user?.sub;
    if (!authUserId) {
      throw new Error('User not authenticated');
    }
    
    console.log('⚠️ Controller: Marking workspace as stale:', workspaceId);
    const result = await this.workspacesService.markStale(authUserId, workspaceId);
    
    return {
      success: true,
      ...result,
    };
  }

  // Internal endpoint for indexer service to update status (no auth required)
  @Post(':id/status')
  async updateWorkspaceStatus(
    @Param('id') workspaceId: string,
    @Body() statusDto: WorkspaceStatusDto
  ) {
    console.log('🔄 Controller: Updating status for workspace:', workspaceId, statusDto);
    const result = await this.workspacesService.updateWorkspaceStatus(workspaceId, statusDto);
    
    return {
      success: true,
      ...result,
    };
  }

  // Server-Sent Events stream for real-time indexing progress
  @Sse(':id/events')
  @UseGuards() // override class-level guard; SSE is anonymous
  events(@Param('id') workspaceId: string): Observable<MessageEvent> {
    return this.workspacesService.createWorkspaceEventStream(workspaceId);
  }
}
