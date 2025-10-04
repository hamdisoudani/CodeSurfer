import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard, getUserFromRequest } from '../auth.guard';
import { InstallationsService } from './installations.service';
import { LinkInstallationDto } from './dto/link-installation.dto';

@Controller('installations')
export class InstallationsController {
  constructor(private readonly service: InstallationsService) {}

  @Post('link')
  @UseGuards(SupabaseAuthGuard)
  async link(@Body() dto: LinkInstallationDto, @Req() req: any) {
    console.log('🔗 Backend: Received link request for installation:', dto.installationId);
    const user = getUserFromRequest(req) as { id: string } | undefined;
    console.log('👤 Backend: User from request:', user?.id);
    
    try {
      const result = await this.service.linkInstallation(user!.id, dto.installationId);
      console.log('✅ Backend: Link successful:', result);
      return { data: result };
    } catch (error) {
      console.error('❌ Backend: Link failed:', error);
      console.error('❌ Backend: Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.constructor.name
      });
      throw error;
    }
  }

  @Get('check')
  @UseGuards(SupabaseAuthGuard)
  async check(@Req() req: any) {
    const user = getUserFromRequest(req) as { id: string } | undefined;
    const result = await this.service.checkUserInstallations(user!.id);
    return { data: result };
  }

  @Get('repos')
  @UseGuards(SupabaseAuthGuard)
  async getRepos(@Query('installation_id') installationId: string, @Req() req: any) {
    if (!installationId) {
      return { error: 'installation_id is required' };
    }
    const user = getUserFromRequest(req) as { id: string } | undefined;
    const result = await this.service.getRepositories(user!.id, installationId);
    return { data: result };
  }

  @Get('branches')
  @UseGuards(SupabaseAuthGuard)
  async getBranches(
    @Query('installation_id') installationId: string,
    @Query('repo') repo: string,
    @Req() req: any
  ) {
    if (!installationId || !repo) {
      return { error: 'installation_id and repo are required' };
    }
    const user = getUserFromRequest(req) as { id: string } | undefined;
    const result = await this.service.getBranches(user!.id, installationId, repo);
    return { data: result };
  }
}


