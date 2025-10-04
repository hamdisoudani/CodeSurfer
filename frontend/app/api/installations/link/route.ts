import { NextRequest } from "next/server";
import { getServerAxiosFromCookies } from "@/lib/axios-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const axios = await getServerAxiosFromCookies();
    const res = await axios.post("/installations/link", body);
    return Response.json(res.data);
  } catch (e: any) {
    const status = e.response?.status || 500;
    const data = e.response?.data || { error: "failed" };
    return new Response(JSON.stringify(data), { status });
  }
}


