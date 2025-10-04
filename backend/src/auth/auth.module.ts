import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { SupabaseAuthGuard } from '../auth.guard';
import { SupabaseStrategy } from './supabase.strategy';

@Module({
  imports: [
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => {
        return {
          global: true,
          secret: configService.get<string>('SUPABASE_JWT_SECRET'),
          signOptions: { 
            expiresIn: '1h', // Match Supabase's 3600 seconds (1 hour)
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [SupabaseAuthGuard, SupabaseStrategy],
  exports: [SupabaseAuthGuard, JwtModule],
})
export class AuthModule {}
