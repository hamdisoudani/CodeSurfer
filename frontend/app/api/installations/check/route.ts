import { getServerAxiosFromCookies } from "@/lib/axios-server";

export async function GET() {
  try {
    const axios = await getServerAxiosFromCookies();
    const res = await axios.get("/installations/check");
    return Response.json(res.data);
  } catch (e: any) {
    const status = e.response?.status || 500;
    const data = e.response?.data || { error: "failed" };
    return new Response(JSON.stringify(data), { status });
  }
}
