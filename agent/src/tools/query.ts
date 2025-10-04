import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { type LangGraphRunnableConfig } from "@langchain/langgraph";
import { type UserInfo } from "../auth";
import { getGrpcClient } from "../lib/grpc-client";

const queryCodebaseToolSchema = z.object({
  query: z.string().describe("The natural language query to search for in the codebase."),
  limit: z.number().optional().default(10).describe("The maximum number of results to return."),
  similarityThreshold: z.number().optional().default(0.7).describe("The minimum similarity score for a result to be included."),
});

type QueryCodebaseToolSchema = z.infer<typeof queryCodebaseToolSchema>;

export const queryCodebaseTool = tool(
  async (
    input: QueryCodebaseToolSchema,
    config: LangGraphRunnableConfig
  ) => {
    // Read authenticated user from configurable (same pattern as context tool)
    const configurable = (config as any)?.configurable ?? {};
    const user = (configurable?.langgraph_auth_user as UserInfo | undefined) ?? undefined;

    if (!user?.workspaceContext?.isIndexed) {
      return { success: false, error: "Workspace is not indexed. Please ensure the repository is fully indexed before querying.", results: [] };
    }

    if (!user.workspaceId) {
      return { success: false, error: "No workspace context found. Cannot query codebase.", results: [] };
    }

    try {
      const grpcClient = getGrpcClient();
      const response = await grpcClient.queryWorkspace(
        user.workspaceId,
        input.query,
        input.limit,
        input.similarityThreshold
      );

      if (!response || !response.results || response.results.length === 0) {
        return { success: true, results: [] };
      }
      
      // Log the raw response to debug data issues
      console.log("Raw gRPC response in agent:", JSON.stringify(response, null, 2));

      // Normalize to a clean, camelCase JSON the frontend can render
      const normalized = response.results.map((r: any) => {
        const rawPath = r.file_path ?? r.filePath ?? "";
        const filePath = typeof rawPath === 'string' 
          ? rawPath.replace(/^\/home\/daytona\/repo\//, '') 
          : '';
        const startLine = r.start_line ?? r.startLine ?? null;
        const endLine = r.end_line ?? r.endLine ?? null;
        const scoreVal = r.similarity_score ?? r.similarityScore;
        const similarityScore = typeof scoreVal === 'number' ? scoreVal : (typeof scoreVal === 'string' ? Number(scoreVal) : 0);

        return {
          filePath,
          startLine,
          endLine,
          similarityScore,
          content: (r.content ?? "").toString(),
          chunkId: r.chunk_id ?? r.chunkId ?? undefined,
        };
      });

      return { success: true, results: normalized };

    } catch (error: any) {
      console.error("Error in queryCodebaseTool:", error);
      return { success: false, error: error.message, results: [] };
    }
  },
  {
    name: "query_codebase",
    description: "Performs a semantic search/query on the indexed codebase of the current repository.",
    schema: queryCodebaseToolSchema,
  }
);
