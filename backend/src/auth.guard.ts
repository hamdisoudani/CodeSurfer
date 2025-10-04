import { AuthGuard } from '@nestjs/passport';

export class SupabaseAuthGuard extends AuthGuard('jwt') {}

export function getUserFromRequest<T = any>(req: any): T | undefined {
  return req?.user as T | undefined;
}


