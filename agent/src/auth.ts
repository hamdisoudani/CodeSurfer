import { Auth, HTTPException } from "@langchain/langgraph-sdk/auth";
import { getGrpcClient } from "./lib/grpc-client";

interface WorkspaceContext {
  workspaceId: string;
  repo: string;
  branch: string;
  installationId: string;
  indexStatus: string;
  lastIndexedAt?: string;
  lastCommitSha?: string;
  isIndexed: boolean;
}

interface UserInfo {
  userId: string;
  email: string;
  username: string;
  workspaceId?: string;
  workspaceContext?: WorkspaceContext;
}

// Initialize gRPC client
const grpcClient = getGrpcClient();

// Helper functions for permission logic
function createUserFilter(user: any) {
  return { owner: user.identity };
}

function createWorkspaceFilter(user: any) {
  // For workspace operations, require workspace context
  if (!user.workspaceId) {
    throw new HTTPException(403, { message: "Workspace access required" });
  }
  return { 
    owner: user.identity,
    workspaceId: user.workspaceId 
  };
}

function createWithUserMetadata(value: any, user: any) {
  value.metadata ??= {};
  value.metadata.owner = user.identity;
  value.metadata.user_id = user.identity;
  value.metadata.username = user.username;
  value.metadata.email = user.email;
  return { owner: user.identity };
}

function createWithWorkspaceMetadata(value: any, user: any) {
  if (!user.workspaceId) {
    throw new HTTPException(403, { message: "Workspace context required" });
  }
  value.metadata ??= {};
  value.metadata.owner = user.identity;
  value.metadata.user_id = user.identity;
  value.metadata.username = user.username;
  value.metadata.email = user.email;
  value.metadata.workspaceId = user.workspaceId;
  value.metadata.repo = user.workspaceContext?.repo;
  value.metadata.branch = user.workspaceContext?.branch;
  return { owner: user.identity };
}

const LANGGRAPH_USER_PERMISSIONS = [
  "threads:create",
  "threads:create_run",
  "threads:read",
  "threads:delete",
  "threads:update",
  "threads:search",
  "assistants:create",
  "assistants:read",
  "assistants:delete",
  "assistants:update",
  "assistants:search",
  "store:put",
  "store:get",
  "store:search",
  "store:delete",
  "store:list_namespaces",
];

export const auth = new Auth()
  .authenticate(async (request: Request) => {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return {
        identity: "anonymous",
        permissions: [],
        is_authenticated: false,
        display_name: "CORS Preflight",
      };
    }

    // Extract Authorization header
    const authorization = request.headers.get("authorization");
    if (!authorization) {
      throw new HTTPException(401, { message: "Authorization header missing" });
    }

    // Extract JWT token (expecting "Bearer <token>")
    const parts = authorization.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      throw new HTTPException(401, { message: "Invalid authorization header format" });
    }

    const jwtToken = parts[1];
    if (!jwtToken) {
      throw new HTTPException(401, { message: "JWT token missing" });
    }

    // Debug logging for token
    // console.log("🔐 Agent Auth: Received JWT token", {
    //   tokenLength: jwtToken.length,
    //   tokenPrefix: jwtToken.substring(0, 20) + "...",
    //   url: request.url,
    //   method: request.method,
    //   hasAuthHeader: !!request.headers.get("authorization"),
    //   workspaceHeader: request.headers.get("x-workspace-id"),
    //   contentType: request.headers.get("content-type")
    // });

    // Resolve workspace ID: prefer header, fallback to query param, sanitize
    const headerWorkspaceId =
      request.headers.get("x-workspace-id") ||
      request.headers.get("x-workspace") ||
      request.headers.get("workspace-id") ||
      undefined;
    const url = new URL(request.url);
    const queryWorkspaceId = url.searchParams.get("workspaceId") || undefined;
    const rawWorkspaceId = headerWorkspaceId || queryWorkspaceId || undefined;
    const workspaceId = rawWorkspaceId
      ? rawWorkspaceId.split(/[\/?#]/)[0].trim()
      : undefined;

    try {
      // Step 1: validate JWT without workspace to avoid conflating errors
      const baseUser = await grpcClient.authenticateAgent(jwtToken, undefined);
      if (!baseUser) {
        throw new HTTPException(401, { message: "Invalid or expired token" });
      }

      // Step 2: attach workspace if valid (non-fatal if not)
      let userInfo = baseUser;
      if (workspaceId) {
        const withWs = await grpcClient.authenticateAgent(jwtToken, workspaceId);
        if (withWs) {
          userInfo = withWs;
        }
      }

      // Return user information in LangGraph's expected format
      return {
        identity: userInfo.userId,
        permissions: LANGGRAPH_USER_PERMISSIONS,
        is_authenticated: true,
        display_name: userInfo.username || userInfo.email || userInfo.userId,
        email: userInfo.email,
        username: userInfo.username,
        workspaceId: userInfo.workspaceId,
        workspaceContext: userInfo.workspaceContext,
      };
    } catch (error) {
      console.error("Authentication error:", error);
      throw new HTTPException(401, { message: "Authentication failed" });
    }
  })

  // THREADS: Mixed operations
  .on("threads:create", ({ value, user }) => {
    // 🔥 SCRATCH MODE: Allow thread creation without workspace
    const isScratchMode = value.metadata?.mode === 'scratch';
    
    if (isScratchMode) {
      console.log('🎨 [auth] Creating scratch mode thread - no workspace required');
      return createWithUserMetadata(value, user);
    }
    
    // 🔥 REPO MODE: Thread creation requires workspace context and indexed repo
    if (!user.workspaceContext || !user.workspaceContext.isIndexed) {
      throw new HTTPException(403, { 
        message: user.workspaceContext 
          ? "Repository must be indexed before creating conversations" 
          : "Workspace context required for thread creation" 
      });
    }
    return createWithWorkspaceMetadata(value, user);
  })
  .on("threads:create_run", ({ value, user }) => {
    // 🔥 SCRATCH MODE: Allow run creation without workspace
    const isScratchMode = value.metadata?.mode === 'scratch';
    
    if (isScratchMode) {
      console.log('🎨 [auth] Creating scratch mode run - no workspace required');
      return createWithUserMetadata(value, user);
    }
    
    // 🔥 REPO MODE: Run creation requires workspace context
    if (!user.workspaceContext || !user.workspaceContext.isIndexed) {
      throw new HTTPException(403, { 
        message: user.workspaceContext 
          ? "Repository must be indexed before starting conversations" 
          : "Workspace context required for run creation" 
      });
    }
    return createWithWorkspaceMetadata(value, user);
  })
  // Thread management operations only need user context
  .on("threads:read", ({ user }) => createUserFilter(user))
  .on("threads:update", ({ user }) => createUserFilter(user))
  .on("threads:delete", ({ user }) => createUserFilter(user))
  .on("threads:search", ({ user }) => createUserFilter(user))

  // ASSISTANTS: User-based operations  
  .on("assistants:create", ({ value, user }) => createWithUserMetadata(value, user))
  .on("assistants:read", ({ user }) => createUserFilter(user))
  .on("assistants:update", ({ user }) => createUserFilter(user))
  .on("assistants:delete", ({ user }) => createUserFilter(user))
  .on("assistants:search", ({ user }) => createUserFilter(user))

  // STORE: User-scoped storage
  .on("store:put", ({ user }) => createUserFilter(user))
  .on("store:get", ({ user }) => createUserFilter(user))
  .on("store:search", ({ user }) => createUserFilter(user))
  .on("store:delete", ({ user }) => createUserFilter(user))
  .on("store:list_namespaces", ({ user }) => createUserFilter(user));

// Export types for use in tools
export type { UserInfo };
