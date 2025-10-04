import { IsString, IsOptional } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  repo: string; // Format: "owner/repo"

  @IsString()
  @IsOptional()
  branch?: string = 'main';

  @IsString()
  installation_id: string;
}

export class WorkspaceStatusDto {
  @IsString()
  @IsOptional()
  status?: 'pending' | 'building' | 'ready' | 'failed' | 'stale';

  @IsOptional()
  progress?: number;

  @IsString()
  @IsOptional()
  phase?: string;

  @IsString()
  @IsOptional()
  error?: string;

  // Granular progress fields (optional)
  @IsOptional()
  total_files?: number;

  @IsOptional()
  processed_files?: number;

  @IsOptional()
  total_nodes?: number;

  @IsOptional()
  embedded_nodes?: number;

  @IsString()
  @IsOptional()
  last_indexed_at?: string;

  @IsString()
  @IsOptional()
  commit_sha?: string;
}

export class IndexJobDto {
  @IsString()
  @IsOptional()
  type?: 'index' | 'reindex' | 'incremental' = 'index';
}

export class SnapshotDto {
  @IsString()
  @IsOptional()
  description?: string;
}
