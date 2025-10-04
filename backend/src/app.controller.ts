import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { AppService } from './app.service';
import * as jose from 'jose';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = authorization.slice('bearer '.length).trim();
    const supabaseUrl = process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      throw new UnauthorizedException('Server not configured');
    }
    const jwks = jose.createRemoteJWKSet(new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/jwks`));
    try {
      const { payload, protectedHeader } = await jose.jwtVerify(token, jwks, {
        issuer: `${supabaseUrl.replace(/\/$/, '')}/auth/v1`,
        audience: 'authenticated',
      });
      return {
        userId: payload.sub,
        email: (payload as any).email,
        provider: (payload as any).app_metadata?.provider,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch (e) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  // Webhooks route will be moved to a dedicated module later
}
