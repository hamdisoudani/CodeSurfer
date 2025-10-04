import { NextRequest, NextResponse } from 'next/server';
import { getServerAxiosFromCookies } from '@/lib/axios-server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    console.log('🔗 GitHub App installation callback received');
    
    // Extract the installation_id from the query parameters
    const searchParams = request.nextUrl.searchParams;
    const installationId = searchParams.get('installation_id');
    const setupAction = searchParams.get('setup_action');
    
    console.log('📋 Callback parameters:', { installationId, setupAction });
    
    if (!installationId) {
      console.error('❌ Missing installation_id parameter');
      return NextResponse.redirect(
        new URL('/?error=missing_installation_id', request.url)
      );
    }

    // Check if user is authenticated
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('❌ User not authenticated for installation callback');
      return NextResponse.redirect(
        new URL('/?error=authentication_required&installation_id=' + installationId, request.url)
      );
    }

    console.log('👤 Authenticated user for installation:', user.id);

    try {
      // Call backend to link the installation
      const axios = await getServerAxiosFromCookies();
      console.log('🔗 Calling backend to link installation...');
      
      const response = await axios.post('/installations/link', {
        installationId
      });

      console.log('✅ Installation linked successfully:', response.data);
      
      // Redirect to main page with success message
      const redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('installation_success', 'true');
      redirectUrl.searchParams.set('installation_id', installationId);
      if (setupAction) {
        redirectUrl.searchParams.set('setup_action', setupAction);
      }
      
      console.log('🔄 Redirecting to:', redirectUrl.toString());
      return NextResponse.redirect(redirectUrl);
      
    } catch (backendError: any) {
      console.error('❌ Backend error linking installation:', backendError.response?.data || backendError.message);
      
      // Redirect to main page with error message
      const redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('installation_error', 'true');
      redirectUrl.searchParams.set('error_message', backendError.response?.data?.message || 'Failed to link installation');
      
      return NextResponse.redirect(redirectUrl);
    }
    
  } catch (error) {
    console.error('🚨 Unexpected error in GitHub callback:', error);
    
    // Redirect to main page with generic error
    const redirectUrl = new URL('/', request.url);
    redirectUrl.searchParams.set('installation_error', 'true');
    redirectUrl.searchParams.set('error_message', 'Unexpected error occurred');
    
    return NextResponse.redirect(redirectUrl);
  }
}

// Handle POST method if needed (though GitHub typically uses GET)
export async function POST(request: NextRequest) {
  console.log('📮 POST request to GitHub callback (unusual)');
  return NextResponse.json(
    { error: 'POST method not expected for GitHub App installation callback' }, 
    { status: 405 }
  );
}
