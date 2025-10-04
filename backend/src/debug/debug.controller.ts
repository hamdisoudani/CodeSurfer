import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('debug')
export class DebugController {
  constructor(private readonly configService: ConfigService) {}

  @Get('config')
  checkConfig() {
    const config = {
      GITHUB_APP_ID: this.configService.get<string>('GITHUB_APP_ID') ? 'SET' : 'MISSING',
      GITHUB_APP_PRIVATE_KEY: this.configService.get<string>('GITHUB_APP_PRIVATE_KEY') ? 'SET' : 'MISSING',
      SUPABASE_URL: this.configService.get<string>('SUPABASE_URL') ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ? 'SET' : 'MISSING',
      SUPABASE_JWT_SECRET: this.configService.get<string>('SUPABASE_JWT_SECRET') ? 'SET' : 'MISSING',
    };

    console.log('🔍 Environment Configuration Check:', config);
    
    return {
      message: 'Configuration check complete',
      config,
      timestamp: new Date().toISOString()
    };
  }

  @Get('github-app')
  async testGitHubApp() {
    try {
      const { getGithubApp } = await import('../lib/github-app');
      const app = await getGithubApp();
      
      console.log('✅ GitHub App instance created successfully');
      
      // Try to get app info
      const appInfo = await app.octokit.request('GET /app');
      
      return {
        success: true,
        app: {
          id: appInfo.data.id,
          name: appInfo.data.name,
          owner: appInfo.data.owner?.login,
          created_at: appInfo.data.created_at,
        }
      };
    } catch (error) {
      console.error('❌ GitHub App test failed:', error);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }
}
