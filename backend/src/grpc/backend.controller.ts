import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { InstallationsService } from '../installations/installations.service';
import { SupabaseService } from '../lib/supabase';
import {
  GetGitHubTokenRequest,
  GetGitHubTokenResponse,
  UpdateWorkspaceStatusRequest,
  UpdateWorkspaceStatusResponse,
  AuthenticateAgentRequest,
  AuthenticateAgentResponse,
  QueryWorkspaceRequest,
  QueryWorkspaceResponse,
  BackendServiceControllerMethods,
} from '../generated/backend';

@Controller()
export class BackendGrpcController {
  private readonly logger = new Logger(BackendGrpcController.name);
  private indexerClient: any;

  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly installationsService: InstallationsService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.initializeIndexerClient();
  }

  private initializeIndexerClient() {
    try {
      const indexerGrpcUrl = process.env.INDEXER_GRPC_URL || 'indexer:50051';
      const protoPath = path.join(process.cwd(), 'proto', 'backend.proto');
      
      const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });
      
      const proto = grpc.loadPackageDefinition(packageDefinition) as any;
      
      this.indexerClient = new proto.backend.BackendService(
        indexerGrpcUrl,
        grpc.credentials.createInsecure()
      );
      
      this.logger.log(`📡 gRPC: Indexer client initialized for ${indexerGrpcUrl}`);
    } catch (error) {
      this.logger.error('❌ gRPC: Failed to initialize indexer client:', error);
      this.indexerClient = null;
    }
  }

  @GrpcMethod('BackendService', 'GetGitHubToken')
  async getGitHubToken(data: GetGitHubTokenRequest): Promise<GetGitHubTokenResponse> {
    try {
      this.logger.log(`🔑 gRPC: Getting GitHub token for installation ${data.installationId}`);
      
      // Get installation token using existing service
      const tokenData = await this.installationsService.getInstallationToken(
        parseInt(data.installationId)
      );

      if (!tokenData?.token) {
        throw new Error('Failed to get installation token');
      }

      return {
        token: tokenData.token,
        expiresAt: tokenData.expires_at || new Date(Date.now() + 3600000).toISOString(), // 1 hour default
        success: true,
      };

    } catch (error) {
      this.logger.error(`❌ gRPC: Failed to get GitHub token:`, error);
      return {
        token: '',
        expiresAt: '',
        success: false,
        error: error.message,
      };
    }
  }

  @GrpcMethod('BackendService', 'UpdateWorkspaceStatus')
  async updateWorkspaceStatus(data: UpdateWorkspaceStatusRequest): Promise<UpdateWorkspaceStatusResponse> {
    try {
      this.logger.log(`📊 gRPC: Updating workspace ${data.workspaceId} status to ${data.status}`);
      
      // Convert gRPC request to WorkspaceStatusDto format
      const statusDto: any = {};
      if (data.status) statusDto.status = data.status;
      if (data.progress !== undefined) statusDto.progress = data.progress;
      if (data.phase) statusDto.phase = data.phase;
      if (data.error) statusDto.error = data.error;
      if (data.lastIndexedAt) statusDto.last_indexed_at = data.lastIndexedAt;
      if (data.commitSha) statusDto.commit_sha = data.commitSha;

      // Update workspace status using existing service
      await this.workspacesService.updateWorkspaceStatus(data.workspaceId, statusDto);

      return {
        success: true,
        message: 'Workspace status updated successfully',
      };

    } catch (error) {
      this.logger.error(`❌ gRPC: Failed to update workspace status:`, error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Helper method to get workspace by ID
  private async getWorkspaceById(workspaceId: string) {
    const { data: workspace, error } = await this.supabaseService.client
      .from('repo_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (error) {
      this.logger.error(`❌ gRPC: Failed to fetch workspace ${workspaceId}:`, error);
      return null;
    }

    return workspace;
  }

  // Helper method to get internal user ID from auth user ID
  private async getInternalUserId(authUserId: string) {
    const { data: user, error } = await this.supabaseService.client
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    if (error) {
      this.logger.error(`❌ gRPC: Failed to fetch internal user ID for ${authUserId}:`, error);
      return null;
    }

    return user?.id;
  }

  // Helper method to get installation by ID
  private async getInstallationById(installationId: string) {
    const { data: installation, error } = await this.supabaseService.client
      .from('user_installations')
      .select('*')
      .eq('installation_id', installationId)
      .single();

    if (error) {
      this.logger.error(`❌ gRPC: Failed to fetch installation ${installationId}:`, error);
      return null;
    }

    return installation;
  }

  @GrpcMethod('BackendService', 'AuthenticateAgent')
  async authenticateAgent(data: AuthenticateAgentRequest): Promise<AuthenticateAgentResponse> {
    try {
      this.logger.log(`🔐 gRPC: Authenticating agent with JWT token`);
      
      // Verify JWT token with Supabase
      const { data: { user }, error: authError } = await this.supabaseService.client.auth.getUser(data.jwtToken);
      
      if (authError || !user) {
        this.logger.warn(`❌ gRPC: Invalid JWT token: ${authError?.message}`);
        return {
          success: false,
          error: 'Invalid or expired token',
        };
      }

      this.logger.log(`✅ gRPC: User authenticated: ${user.id} (${user.email})`);

      const response: AuthenticateAgentResponse = {
        success: true,
        userContext: {
          userId: user.id,
          email: user.email || '',
          username: user.user_metadata?.login || user.user_metadata?.name || user.email || '',
        },
      };

      // If workspace ID provided, validate and return workspace context
      if (data.workspaceId) {
        try {
          const workspace = await this.getWorkspaceById(data.workspaceId);
          
          if (!workspace) {
            this.logger.warn(`❌ gRPC: Workspace not found: ${data.workspaceId}`);
            return {
              success: false,
              error: 'Workspace not found',
            };
          }

          // Get internal user ID from auth user ID
          const internalUserId = await this.getInternalUserId(user.id);
          
          if (!internalUserId) {
            this.logger.warn(`❌ gRPC: Internal user not found for auth user ${user.id}`);
            return {
              success: false,
              error: 'User not found in system',
            };
          }

          // Verify user owns this workspace
          if (workspace.user_id !== internalUserId) {
            this.logger.warn(`❌ gRPC: User ${user.id} (internal: ${internalUserId}) does not own workspace ${data.workspaceId} (owner: ${workspace.user_id})`);
            return {
              success: false,
              error: 'Access denied to workspace',
            };
          }

          response.workspaceContext = {
            workspaceId: workspace.id,
            repo: workspace.repo,
            branch: workspace.branch,
            installationId: workspace.installation_id,
            indexStatus: workspace.index_status || 'pending',
            lastIndexedAt: workspace.last_indexed_at,
            lastCommitSha: workspace.commit_sha,
            isIndexed: workspace.index_status === 'ready',
          };

          this.logger.log(`✅ gRPC: Workspace context provided: ${workspace.repo}:${workspace.branch} (${workspace.index_status})`);
        } catch (wsError) {
          this.logger.error(`❌ gRPC: Failed to get workspace context:`, wsError);
          return {
            success: false,
            error: 'Failed to load workspace context',
          };
        }
      }

      return response;
    } catch (error) {
      this.logger.error(`❌ gRPC: Authentication error:`, error);
      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  @GrpcMethod('BackendService', 'QueryWorkspace')
  async queryWorkspace(data: QueryWorkspaceRequest): Promise<QueryWorkspaceResponse> {
    try {
      this.logger.log(`🔍 gRPC: Querying workspace ${data.workspaceId} with query: "${data.query}"`);
      
      if (!this.indexerClient) {
        this.logger.error('❌ gRPC: Indexer client not available');
        return {
          success: false,
          error: 'Indexer service unavailable',
          results: [],
        };
      }

      // Forward the query to Python indexer
      return new Promise((resolve) => {
        this.indexerClient.QueryWorkspace(
          {
            workspace_id: data.workspaceId,
            query: data.query,
            limit: data.limit || 10,
            similarity_threshold: data.similarityThreshold || 0.7,
          },
          (error: any, response: any) => {
            if (error) {
              this.logger.error(`❌ gRPC: Indexer query failed:`, error);
              resolve({
                success: false,
                error: error.message || 'Query failed',
                results: [],
              });
              return;
            }

            this.logger.log(`✅ gRPC: Query returned ${response.results?.length || 0} results`);
            this.logger.debug(`Raw response from Python indexer: ${JSON.stringify(response, null, 2)}`);
            
            // Manually construct a clean response object to ensure proper serialization
            const cleanResponse = {
              success: response.success,
              error: response.error,
              results: (response.results || []).map((r: any) => ({
                content: r.content,
                filePath: r.file_path ?? r.filePath,
                startLine: r.start_line ?? r.startLine,
                endLine: r.end_line ?? r.endLine,
                similarityScore: r.similarity_score ?? r.similarityScore,
                chunkId: r.chunk_id ?? r.chunkId,
              })),
            };
            
            resolve(cleanResponse);
          }
        );
      });
    } catch (error) {
      this.logger.error(`❌ gRPC: Query error:`, error);
      return {
        success: false,
        error: error.message,
        results: [],
      };
    }
  }
}
