import { NextRequest } from "next/server";
import { getServerAxiosFromCookies } from "@/lib/axios-server";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const installationId = searchParams.get('installation_id');
    const repo = searchParams.get('repo');
    
    if (!installationId || !repo) {
      return Response.json({ error: 'installation_id and repo are required' }, { status: 400 });
    }

    const axios = await getServerAxiosFromCookies();
    const res = await axios.get(`/installations/branches?installation_id=${installationId}&repo=${encodeURIComponent(repo)}`);
    return Response.json(res.data);
  } catch (e: any) {
    const status = e.response?.status || 500;
    const data = e.response?.data || { error: "failed" };
    return new Response(JSON.stringify(data), { status });
  }
}