-- Supabase Database Schema
-- Run these commands in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  auth_user_id UUID NOT NULL UNIQUE, -- References auth.users.id
  github_id BIGINT,
  username TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User installations table
CREATE TABLE IF NOT EXISTS user_installations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  account_id BIGINT NOT NULL,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  repository_selection TEXT,
  permissions JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, installation_id)
);

-- Repository workspaces table
CREATE TABLE IF NOT EXISTS repo_workspaces (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  repo TEXT NOT NULL, -- Format: "owner/repo"
  branch TEXT NOT NULL DEFAULT 'main',
  snapshot_id TEXT,
  volume_id TEXT,
  index_path TEXT,
  index_status TEXT DEFAULT 'pending' CHECK (index_status IN ('pending', 'building', 'ready', 'failed', 'stale')),
  last_commit_sha TEXT,
  last_indexed_at TIMESTAMP WITH TIME ZONE,
  embed_provider TEXT,
  embed_model TEXT,
  index_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, repo, branch)
);

-- Index jobs table
CREATE TABLE IF NOT EXISTS index_jobs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES repo_workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'index' CHECK (type IN ('index', 'reindex', 'incremental')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE repo_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE index_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth_user_id = auth.uid());

-- RLS Policies for user_installations table
CREATE POLICY "Users can view their own installations" ON user_installations
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can manage their own installations" ON user_installations
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- RLS Policies for repo_workspaces table
CREATE POLICY "Users can view their own workspaces" ON repo_workspaces
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can manage their own workspaces" ON repo_workspaces
  FOR ALL USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- RLS Policies for index_jobs table
CREATE POLICY "Users can view their workspace jobs" ON index_jobs
  FOR SELECT USING (workspace_id IN (
    SELECT id FROM repo_workspaces WHERE user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can manage their workspace jobs" ON index_jobs
  FOR ALL USING (workspace_id IN (
    SELECT id FROM repo_workspaces WHERE user_id IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  ));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_user_installations_user_id ON user_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_installations_installation_id ON user_installations(installation_id);
CREATE INDEX IF NOT EXISTS idx_repo_workspaces_user_id ON repo_workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_repo_workspaces_repo_branch ON repo_workspaces(repo, branch);
CREATE INDEX IF NOT EXISTS idx_index_jobs_workspace_id ON index_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_index_jobs_status ON index_jobs(status);

-- Function to automatically update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_installations_updated_at BEFORE UPDATE ON user_installations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_repo_workspaces_updated_at BEFORE UPDATE ON repo_workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
