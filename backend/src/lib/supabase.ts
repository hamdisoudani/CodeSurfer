import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required Supabase configuration');
    }

    // Use service role key for server-side operations
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  // Helper method for upsert operations
  async upsertUserInstallation(data: {
    user_id: string;
    installation_id: string;
    account_id: number;
    account_login: string;
    account_type: string;
    repository_selection: string;
    permissions: any;
  }) {
    const { data: result, error } = await this.supabase
      .from('user_installations')
      .upsert(
        {
          user_id: data.user_id,
          installation_id: data.installation_id,
          account_id: data.account_id,
          account_login: data.account_login,
          account_type: data.account_type,
          repository_selection: data.repository_selection,
          permissions: data.permissions,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,installation_id',
        }
      )
      .select();

    if (error) {
      throw new Error(`Failed to upsert user installation: ${error.message}`);
    }

    return result;
  }

  // Helper method to ensure user exists
  async upsertUser(authUserId: string, userData?: {
    github_id?: number;
    username?: string;
    email?: string;
    avatar_url?: string;
  }) {
    const { data: result, error } = await this.supabase
      .from('users')
      .upsert(
        {
          auth_user_id: authUserId,
          ...userData,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'auth_user_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to upsert user: ${error.message}`);
    }

    return result;
  }
}
