import { cookieHeader, getGoogleAuthConfig, requestOrigin, SESSION_COOKIE } from "../../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = await getGoogleAuthConfig();
  const origin = requestOrigin(request, config?.publicAppUrl ?? null);
  return new Response(null, { status: 302, headers: { location: `${origin}/`, "set-cookie": cookieHeader(SESSION_COOKIE, "", origin, 0) } });
}
