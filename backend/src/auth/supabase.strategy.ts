import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy) {
  public constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // This ensures expired tokens are rejected
      secretOrKey: configService.get<string>('SUPABASE_JWT_SECRET'),
    });
  }

  async validate(payload: any): Promise<any> {
    // Check if token is expired (additional safety check)
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < currentTime) {
      throw new UnauthorizedException('Token has expired');
    }

    // Validate that this is a Supabase token with required fields
    if (!payload.sub || !payload.aud || payload.aud !== 'authenticated') {
      throw new UnauthorizedException('Invalid token format');
    }

    return {
      id: payload.sub,
      email: payload.email,
      app_metadata: payload.app_metadata,
      user_metadata: payload.user_metadata,
      role: payload.role,
      exp: payload.exp,
      iat: payload.iat,
    };
  }
}
