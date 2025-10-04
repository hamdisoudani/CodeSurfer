import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { type UserInfo } from "../auth";
import { type SearchResult } from "../generated/backend";

// Singleton instance
let clientInstance: any = null;

class BackendGRPCClient {
  private client: any;

  constructor(backendGrpcUrl: string) {
    console.log("🔧 gRPC: Initializing client for", backendGrpcUrl);

    const protoPath = path.join(process.cwd(), "proto", "backend.proto");
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition) as any;

    this.client = new proto.backend.BackendService(
      backendGrpcUrl,
      grpc.credentials.createInsecure()
    );

    console.log("✅ gRPC: Client initialized");
  }

  async authenticateAgent(
    jwtToken: string,
    workspaceId?: string
  ): Promise<UserInfo | null> {
    return new Promise((resolve, reject) => {
      this.client.AuthenticateAgent(
        { jwt_token: jwtToken, workspace_id: workspaceId },
        (error: any, response: any) => {
          if (error) {
            console.error("❌ gRPC: AuthenticateAgent failed:", error);
            return reject(error);
          }
          if (!response.success) {
            console.error("❌ gRPC: Authentication failed:", response.error);
            return resolve(null);
          }

          const userContext = response.user_context;
          const workspaceContext = response.workspace_context;

          const userInfo: UserInfo = {
            userId: userContext?.user_id || "",
            email: userContext?.email || "",
            username: userContext?.username || "",
          };

          if (workspaceContext) {
            userInfo.workspaceId = workspaceContext.workspace_id;
            userInfo.workspaceContext = {
              workspaceId: workspaceContext.workspace_id,
              repo: workspaceContext.repo,
              branch: workspaceContext.branch,
              installationId: workspaceContext.installation_id,
              indexStatus: workspaceContext.index_status,
              lastIndexedAt: workspaceContext.last_indexed_at,
              lastCommitSha: workspaceContext.last_commit_sha,
              isIndexed: workspaceContext.is_indexed,
            };
          }

          resolve(userInfo);
        }
      );
    });
  }

  async queryWorkspace(
    workspaceId: string,
    query: string,
    limit: number = 10,
    similarityThreshold: number = 0.7
  ): Promise<{ success: boolean; results?: SearchResult[]; error?: string }> {
    return new Promise((resolve, reject) => {
      this.client.QueryWorkspace(
        { workspace_id: workspaceId, query, limit, similarity_threshold: similarityThreshold },
        (error: any, response: any) => {
          if (error) {
            console.error("❌ gRPC: QueryWorkspace failed:", error);
            return reject(error);
          }
          resolve(response);
        }
      );
    });
  }

  async getGitHubToken(
    installationId: string,
    workspaceId?: string,
    repo?: string,
    repositories?: string[]
  ): Promise<{ token: string; expiresAt: string } | null> {
    return new Promise((resolve, reject) => {
      this.client.GetGitHubToken(
        { installation_id: installationId, workspace_id: workspaceId || "", repo: repo || "", repositories: repositories || [] },
        (error: any, response: any) => {
          if (error) {
            console.error("❌ gRPC: GetGitHubToken failed:", error);
            return reject(error);
          }
          if (!response?.success || !response?.token) {
            console.error("❌ gRPC: GetGitHubToken unsuccessful:", response?.error);
            return resolve(null);
          }
          resolve({ token: response.token, expiresAt: response.expires_at || response.expiresAt });
        }
      );
    });
  }
}

export function getGrpcClient(): BackendGRPCClient {
  if (!clientInstance) {
    const backendGrpcUrl = process.env.BACKEND_GRPC_URL || "backend:50052";
    clientInstance = new BackendGRPCClient(backendGrpcUrl);
  }
  return clientInstance;
}
