import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ClientProxy } from '@nestjs/microservices';
import { SupabaseService } from '../lib/supabase';
import { CreateWorkspaceDto, WorkspaceStatusDto, IndexJobDto } from './dto/create-workspace.dto';
import { connect, JSONCodec, NatsConnection } from 'nats';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject('NATS_CLIENT') private readonly natsClient: ClientProxy,
  ) {}

  async upsertWorkspace(authUserId: string, createWorkspaceDto: CreateWorkspaceDto) {
    const { repo, branch = 'main', installation_id } = createWorkspaceDto;

    // First ensure user exists and get internal user ID
    const user = await this.supabaseService.upsertUser(authUserId);
    console.log('🔧 Workspace: User resolved:', user.id);

    // Verify user owns the installation
    const { data: installation, error: installError } = await this.supabaseService.client
      .from('user_installations')
      .select('*')
      .eq('user_id', user.id)
      .eq('installation_id', installation_id)
      .single();

    if (installError || !installation) {
      throw new BadRequestException('Installation not found or not owned by user');
    }

    // Upsert workspace
    const { data: workspace, error } = await this.supabaseService.client
      .from('repo_workspaces')
      .upsert(
        {
          user_id: user.id,
          installation_id,
          repo,
          branch,
          index_status: 'pending',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,repo,branch',
        }
      )
      .select('*')
      .single();

    if (error) {
      console.error('❌ Workspace: Failed to upsert workspace:', error);
      throw new BadRequestException(`Failed to create/update workspace: ${error.message}`);
    }

    console.log('✅ Workspace: Upserted successfully:', workspace.id);
    return workspace;
  }

  async getUserWorkspaces(authUserId: string) {
    // Get user ID
    const user = await this.supabaseService.upsertUser(authUserId);

    // Get workspaces with all fields
    const { data: workspaces, error } = await this.supabaseService.client
      .from('repo_workspaces')
      .select(`
        *,
        index_jobs (
          id,
          type,
          status,
          progress,
          started_at,
          finished_at,
          error,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('❌ Workspace: Failed to fetch workspaces:', error);
      throw new BadRequestException(`Failed to fetch workspaces: ${error.message}`);
    }

    // Process workspaces to include latest job info and progress
    const processedWorkspaces = (workspaces || []).map(workspace => {
      const jobs = workspace.index_jobs || [];
      const latestJob = jobs.length > 0
        ? jobs.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        : null;

      return {
        ...workspace,
        latest_job: latestJob,
        // Add computed progress from latest job
        progress: latestJob?.progress || 0,
        job_status: latestJob?.status || null,
        job_error: latestJob?.error || null,
        job_started_at: latestJob?.started_at || null,
        job_finished_at: latestJob?.finished_at || null,
      };
    });

    return processedWorkspaces;
  }

  async getWorkspaceStatus(authUserId: string, workspaceId: string) {
    // Verify user owns the workspace
    const user = await this.supabaseService.upsertUser(authUserId);
    
    const { data: workspace, error } = await this.supabaseService.client
      .from('repo_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (error || !workspace) {
      throw new NotFoundException('Workspace not found or not owned by user');
    }

    // Get latest index job if any
    const { data: latestJob } = await this.supabaseService.client
      .from('index_jobs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return {
      workspace_id: workspace.id,
      repo: workspace.repo,
      branch: workspace.branch,
      index_status: workspace.index_status,
      last_indexed_at: workspace.last_indexed_at,
      last_commit_sha: workspace.last_commit_sha,
      embed_provider: workspace.embed_provider,
      embed_model: workspace.embed_model,
      snapshot_id: workspace.snapshot_id,
      volume_id: workspace.volume_id,
      latest_job: latestJob ? {
        id: latestJob.id,
        type: latestJob.type,
        status: latestJob.status,
        progress: latestJob.progress,
        started_at: latestJob.started_at,
        finished_at: latestJob.finished_at,
        error: latestJob.error,
      } : null,
    };
  }

  async startIndexing(authUserId: string, workspaceId: string, indexJobDto: IndexJobDto) {
    // Verify user owns the workspace
    const user = await this.supabaseService.upsertUser(authUserId);
    
    const { data: workspace, error: workspaceError } = await this.supabaseService.client
      .from('repo_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (workspaceError || !workspace) {
      throw new NotFoundException('Workspace not found or not owned by user');
    }

    // Create index job
    const { data: job, error: jobError } = await this.supabaseService.client
      .from('index_jobs')
      .insert({
        workspace_id: workspaceId,
        type: indexJobDto.type || 'index',
        status: 'pending',
        progress: 0,
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (jobError || !job) {
      console.error('❌ Workspace: Failed to create index job:', jobError);
      throw new BadRequestException(`Failed to create index job: ${jobError?.message}`);
    }

    // Update workspace status to building
    await this.supabaseService.client
      .from('repo_workspaces')
      .update({ 
        index_status: 'building',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workspaceId);

    console.log('🚀 Workspace: Index job created:', job.id);

    // Publish indexing job to NATS queue for consumer processing
    try {
      const jobMessage = {
        workspace_id: workspaceId,
        user_id: user.id,
        installation_id: workspace.installation_id,
        repo: workspace.repo,
        branch: workspace.branch,
        type: indexJobDto.type || 'index',
        job_id: job.id,
        timestamp: new Date().toISOString(),
      };

      console.log('📤 Publishing indexing job to NATS queue:', jobMessage);
      
      // Publish to indexing job queue for consumer processing
      this.natsClient.emit('indexing.jobs.queue', jobMessage);

      return {
        job_id: job.id,
        workspace_id: workspaceId,
        status: 'queued',
        message: 'Indexing job queued successfully',
      };
    } catch (error) {
      console.error('❌ Failed to publish job to NATS:', error);
      
      // Update job status to failed
      await this.supabaseService.client
        .from('index_jobs')
        .update({ 
          status: 'failed',
          error: 'Failed to queue job for processing',
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      throw new BadRequestException('Failed to queue indexing job');
    }
  }

  async updateWorkspaceStatus(workspaceId: string, statusDto: WorkspaceStatusDto) {
    // This method will be called by the indexer service (via gRPC) to update status
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (statusDto.status) updateData.index_status = statusDto.status;
    if (statusDto.last_indexed_at) updateData.last_indexed_at = statusDto.last_indexed_at;
    if (statusDto.commit_sha) updateData.last_commit_sha = statusDto.commit_sha;

    const { error } = await this.supabaseService.client
      .from('repo_workspaces')
      .update(updateData)
      .eq('id', workspaceId);

    if (error) {
      console.error('❌ Workspace: Failed to update status:', error);
      throw new BadRequestException(`Failed to update workspace status: ${error.message}`);
    }

    // Update index job if provided
    if (statusDto.progress !== undefined || statusDto.phase || statusDto.error) {
      const jobUpdate: any = {};
      if (statusDto.progress !== undefined) jobUpdate.progress = statusDto.progress;
      if (statusDto.error) jobUpdate.error = statusDto.error;
      if (statusDto.status === 'ready' || statusDto.status === 'failed') jobUpdate.finished_at = new Date().toISOString();

      await this.supabaseService.client
        .from('index_jobs')
        .update(jobUpdate)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    console.log('✅ Workspace: Status updated for workspace:', workspaceId);
    // Fan-out to SSE subscribers
    try {
      this.natsClient.emit(`indexing.progress.${workspaceId}`, { workspace_id: workspaceId, ...statusDto });
    } catch {}
    return { success: true };
  }

  async createSnapshot(authUserId: string, workspaceId: string, description?: string) {
    // Verify user owns the workspace
    const user = await this.supabaseService.upsertUser(authUserId);
    
    const { data: workspace, error } = await this.supabaseService.client
      .from('repo_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (error || !workspace) {
      throw new NotFoundException('Workspace not found or not owned by user');
    }

    // Generate snapshot ID (would be replaced with actual Daytona API call)
    const snapshotId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Update workspace with snapshot ID
    const { error: updateError } = await this.supabaseService.client
      .from('repo_workspaces')
      .update({ 
        snapshot_id: snapshotId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workspaceId);

    if (updateError) {
      console.error('❌ Workspace: Failed to save snapshot ID:', updateError);
      throw new BadRequestException(`Failed to save snapshot: ${updateError.message}`);
    }

    console.log('📸 Workspace: Snapshot created:', snapshotId);

    // TODO: Here we would call Daytona API to create actual snapshot
    return {
      snapshot_id: snapshotId,
      workspace_id: workspaceId,
      status: 'created',
      message: 'Snapshot created successfully',
    };
  }

  async markStale(authUserId: string, workspaceId: string) {
    // Verify user owns the workspace
    const user = await this.supabaseService.upsertUser(authUserId);
    
    const { data: workspace, error } = await this.supabaseService.client
      .from('repo_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .eq('user_id', user.id)
      .single();

    if (error || !workspace) {
      throw new NotFoundException('Workspace not found or not owned by user');
    }

    // Update workspace status to stale
    const { error: updateError } = await this.supabaseService.client
      .from('repo_workspaces')
      .update({ 
        index_status: 'stale',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workspaceId);

    if (updateError) {
      console.error('❌ Workspace: Failed to mark stale:', updateError);
      throw new BadRequestException(`Failed to mark workspace stale: ${updateError.message}`);
    }

    console.log('⚠️ Workspace: Marked as stale:', workspaceId);
    return { success: true, message: 'Workspace marked as stale' };
  }

  // SSE event stream using NATS subject as source
  createWorkspaceEventStream(workspaceId: string): Observable<any> {
    const progressSubject = `indexing.progress.${workspaceId}`;
    const statusSubject = `indexing.status.${workspaceId}`;
    const sc = JSONCodec();

    return from(connect({ servers: process.env.NATS_URL || 'nats://localhost:4222' })).pipe(
      switchMap((nc: NatsConnection) => {
        return new Observable((subscriber) => {
          console.log(`[SSE] NATS: Subscribing to ${progressSubject} and ${statusSubject}`);

          const progressSub = nc.subscribe(progressSubject);
          const durableSub = nc.subscribe(statusSubject);

          const consume = async (sub: any) => {
            for await (const msg of sub) {
              try {
                const payload = sc.decode(msg.data);
                subscriber.next({ data: payload });
                const status = (payload as any)?.status;
                if (['ready', 'failed', 'cancelled'].includes(status)) {
                  subscriber.complete();
                }
              } catch (err) {
                subscriber.error(err);
              }
            }
          };

          (async () => {
            await Promise.race([consume(progressSub), consume(durableSub)]);
          })().catch((err) => subscriber.error(err));

          return async () => {
            console.log(`[SSE] Client disconnected. Unsubscribing from NATS subjects`);
            try { await progressSub.drain(); } catch {}
            try { await durableSub.drain(); } catch {}
            if (!nc.isClosed()) {
              await nc.close();
            }
          };
        });
      }),
    );
  }

  private async getWorkspaceStatusFromDb(workspaceId: string) {
    const { data: ws } = await this.supabaseService.client
      .from('repo_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();
    return {
      workspace_id: ws?.id,
      index_status: ws?.index_status,
      last_indexed_at: ws?.last_indexed_at,
      last_commit_sha: ws?.last_commit_sha,
    };
  }
}
