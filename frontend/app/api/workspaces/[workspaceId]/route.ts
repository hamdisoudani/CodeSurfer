import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerAxiosFromCookies } from '@/lib/axios-server';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session?.access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const axios = await getServerAxiosFromCookies();
    const response = await axios.get(`/workspaces/${params.workspaceId}/status`);

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('API: Failed to fetch workspace status:', error?.response?.data || error.message);
    return NextResponse.json(
      { error: 'Failed to fetch workspace status', details: error?.response?.data?.message || error.message },
      { status: error?.response?.status || 500 }
    );
  }
}
