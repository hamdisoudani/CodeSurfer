import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerAxiosFromCookies } from '@/lib/axios-server';

export async function POST(
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

    const body = await request.json();
    const axios = await getServerAxiosFromCookies();
    const response = await axios.post(`/workspaces/${params.workspaceId}/snapshot`, body);

    return NextResponse.json(response.data);
  } catch (error: any) {
    console.error('API: Failed to create snapshot:', error?.response?.data || error.message);
    return NextResponse.json(
      { error: 'Failed to create snapshot', details: error?.response?.data?.message || error.message },
      { status: error?.response?.status || 500 }
    );
  }
}
