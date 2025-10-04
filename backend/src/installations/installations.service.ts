import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { getGithubApp, getInstallationOctokit } from '../lib/github-app';
import { SupabaseService } from '../lib/supabase';
import { RedisService } from '../lib/redis.service';

@Injectable()
export class InstallationsService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly redisService: RedisService,
  ) {}

  async linkInstallation(authUserId: string, installationId: string) {
    console.log('🔗 Service: Starting link process for user:', authUserId, 'installation:', installationId);
    
    // Security check: Validate installation ID format
    if (!installationId || !/^\d+$/.test(installationId)) {
      console.error('❌ Service: Invalid installation ID format:', installationId);
      throw new UnauthorizedException('Invalid installation ID format');
    }
    
    // 1) Verify installation exists and is accessible by our app
    console.log('📱 Service: Getting GitHub App instance...');
    let app;
    try {
      app = await getGithubApp();
      console.log('✅ Service: GitHub App instance created');
    } catch (error) {
      console.error('❌ Service: Failed to create GitHub App instance:', error);
      throw new Error('GitHub App configuration error: ' + error.message);
    }
    
    console.log('🐙 Service: Getting installation Octokit...');
    let octokit;
    try {
      octokit = await getInstallationOctokit(Number(installationId));
    } catch (error) {
      console.error('❌ Service: Error getting installation Octokit:', error);
      throw new UnauthorizedException('Failed to authenticate with installation: ' + error.message);
    }
    
    if (!octokit) {
      console.error('❌ Service: Invalid installation - could not get Octokit client');
      throw new UnauthorizedException('Installation not found or inaccessible');
    }
    console.log('✅ Service: Installation verified successfully');

    // 2) Fetch installation details
    console.log('📋 Service: Fetching installation details from GitHub...');
    let inst;
    try {
      inst = await app.octokit.request('GET /app/installations/{installation_id}', {
        installation_id: Number(installationId),
      });
    } catch (error) {
      console.error('❌ Service: Failed to fetch installation details from GitHub:', error);
      throw new UnauthorizedException('Failed to fetch installation details from GitHub: ' + error.message);
    }
    
    const info = inst.data as any;
    const account = info.account || {};
    const repository_selection = info.repository_selection;
    const permissions = info.permissions;
    console.log('📋 Service: Installation details:', { account: account.login, type: account.type, repo_selection: repository_selection });

    // Security: Verify installation is active and not suspended
    if (info.suspended_at) {
      console.error('❌ Service: Installation is suspended:', info.suspended_at);
      throw new UnauthorizedException('Installation is suspended');
    }

    // Security: Check if installation has required permissions
    const requiredPermissions = ['contents', 'metadata']; // Add your required permissions
    const hasRequiredPermissions = requiredPermissions.every(perm => 
      permissions && permissions[perm] && ['read', 'write'].includes(permissions[perm])
    );
    
    if (!hasRequiredPermissions) {
      console.error('❌ Service: Installation missing required permissions:', permissions);
      throw new UnauthorizedException('Installation missing required permissions');
    }
    
    console.log('✅ Service: Installation security checks passed');

    // 3) Ensure user exists in our database and get internal user ID
    console.log('👤 Service: Upserting user in database...');
    let user;
    try {
      user = await this.supabaseService.upsertUser(authUserId, {
        github_id: account.id,
        username: account.login,
        avatar_url: account.avatar_url,
      });
      console.log('👤 Service: User upserted:', user.id);
    } catch (error) {
      console.error('❌ Service: Failed to upsert user:', error);
      throw new Error('Database error - failed to create/update user: ' + error.message);
    }

    // 4) Upsert installation into Supabase
    console.log('💾 Service: Saving installation to database...');
    let result;
    try {
      result = await this.supabaseService.upsertUserInstallation({
        user_id: user.id,
        installation_id: installationId,
        account_id: account.id,
        account_login: account.login,
        account_type: account.type,
        repository_selection,
        permissions,
      });
      console.log('💾 Service: Installation saved successfully');
    } catch (error) {
      console.error('❌ Service: Failed to save installation:', error);
      throw new Error('Database error - failed to save installation: ' + error.message);
    }

    return {
      linked: true,
      installationId,
      authUserId,
      account: { id: account.id, login: account.login, type: account.type },
      repository_selection,
      permissions,
      saved: result,
    };
  }

  async checkUserInstallations(authUserId: string) {
    // First ensure user exists and get internal user ID
    const user = await this.supabaseService.upsertUser(authUserId);
    
    // Get user's installations from database
    const { data: installations, error } = await this.supabaseService.client
      .from('user_installations')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      throw new Error(`Failed to fetch installations: ${error.message}`);
    }

    return {
      installations: installations || [],
      hasInstallations: installations && installations.length > 0,
    };
  }

  async getRepositories(authUserId: string, installationId: string) {
    // 1) Get user and verify installation ownership
    const user = await this.supabaseService.upsertUser(authUserId);
    await this.verifyUserInstallation(user.id, installationId);

    // 2) Get repositories from GitHub
    const octokit = await getInstallationOctokit(Number(installationId));
    if (!octokit) {
      throw new UnauthorizedException('Invalid installation');
    }

    const { data } = await octokit.request('GET /installation/repositories', {
      per_page: 100,
    });

    return {
      repositories: data.repositories.map((repo: any) => ({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        description: repo.description,
        default_branch: repo.default_branch,
        updated_at: repo.updated_at,
        html_url: repo.html_url,
      })),
    };
  }

  async getBranches(authUserId: string, installationId: string, repoFullName: string) {
    // 1) Get user and verify installation ownership
    const user = await this.supabaseService.upsertUser(authUserId);
    await this.verifyUserInstallation(user.id, installationId);

    // 2) Get branches from GitHub
    const octokit = await getInstallationOctokit(Number(installationId));
    if (!octokit) {
      throw new UnauthorizedException('Invalid installation');
    }

    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository format. Expected: owner/repo');
    }

    const { data } = await octokit.request('GET /repos/{owner}/{repo}/branches', {
      owner,
      repo,
      per_page: 100,
    });

    return {
      branches: data.map((branch: any) => ({
        name: branch.name,
        commit: {
          sha: branch.commit.sha,
          url: branch.commit.url,
        },
        protected: branch.protected,
      })),
    };
  }

  async getInstallationToken(installationId: number) {
    const cacheKey = `github-token:${installationId}`;

    // 1. Check cache first
    try {
      const cachedToken = await this.redisService.get(cacheKey);
      if (cachedToken) {
        const tokenData = JSON.parse(cachedToken);
        // Quick check to see if it's close to expiry, refresh if within 5 mins
        if (new Date(tokenData.expires_at).getTime() > Date.now() + 5 * 60 * 1000) {
          console.log('✅ Service: Returning cached installation token for', installationId);
          return tokenData;
        }
      }
    } catch (error) {
      console.error('❌ Service: Redis GET error:', error);
      // Do not block if Redis fails, proceed to mint a new token
    }
    
    // 2. If not in cache or expired, mint a new token
    try {
      console.log('✨ Service: Minting new installation token for', installationId);
      const app = await getGithubApp();
      const { data } = await app.octokit.request('POST /app/installations/{installation_id}/access_tokens', {
        installation_id: installationId,
      });

      const tokenData = {
        token: data.token,
        expires_at: data.expires_at,
      };

      // 3. Save the new token to cache with a TTL that matches its expiry
      try {
        const expiresInSeconds = Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000);
        if (expiresInSeconds > 0) {
          await this.redisService.set(cacheKey, JSON.stringify(tokenData), expiresInSeconds);
          console.log('💾 Service: Saved new token to Redis cache with TTL:', expiresInSeconds);
        }
      } catch (error) {
        console.error('❌ Service: Redis SET error:', error);
        // Do not block if caching fails, the user still gets their token
      }

      return tokenData;
    } catch (error) {
      console.error('❌ Service: Failed to get installation token:', error);
      throw new Error('Failed to get installation token: ' + error.message);
    }
  }

  private async verifyUserInstallation(userId: string, installationId: string) {
    const { data: installation, error } = await this.supabaseService.client
      .from('user_installations')
      .select('*')
      .eq('user_id', userId)
      .eq('installation_id', installationId)
      .single();

    if (error || !installation) {
      throw new ForbiddenException('Installation not found or access denied');
    }

    return installation;
  }
}


