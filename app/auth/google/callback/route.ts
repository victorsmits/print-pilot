import { cookieHeader, createSessionValue, getGoogleAuthConfig, OAUTH_FLOW_COOKIE, readCookie, readOAuthFlowValue, requestOrigin, SESSION_COOKIE } from "../../../auth";

export const dynamic = "force-dynamic";

type GoogleUserInfo = { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };

function redirect(origin: string, path: string, cookies: string[]) {
  const headers = new Headers({ location: new URL(path, origin).toString() });
  cookies.forEach(value => headers.append("set-cookie", value));
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  const config = await getGoogleAuthConfig();
  if (!config) return new Response("OAuth Google n’est pas configuré.", { status: 503 });
  let origin: string;
  try { origin = requestOrigin(request, config.publicAppUrl); } catch { return new Response("PUBLIC_APP_URL est invalide.", { status: 500 }); }
  const url = new URL(request.url), flow = await readOAuthFlowValue(readCookie(request, OAUTH_FLOW_COOKIE), config.sessionSecret);
  const clearFlow = cookieHeader(OAUTH_FLOW_COOKIE, "", origin, 0);
  if (!flow || url.searchParams.get("state") !== flow.state || !url.searchParams.get("code")) return redirect(origin, "/?auth_error=invalid_oauth_response", [clearFlow]);
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: url.searchParams.get("code")!, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: `${origin}/auth/google/callback`, grant_type: "authorization_code", code_verifier: flow.verifier }),
    });
    const tokens = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error || "token_exchange_failed");
    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    const user = await userResponse.json() as GoogleUserInfo;
    if (!userResponse.ok || !user.sub || !user.email || user.email_verified !== true) throw new Error("google_identity_invalid");
    const session = await createSessionValue({ subject: user.sub, email: user.email, fullName: user.name?.trim() || null, picture: user.picture || null }, config.sessionSecret);
    return redirect(origin, flow.returnTo, [clearFlow, cookieHeader(SESSION_COOKIE, session, origin, 7 * 24 * 60 * 60)]);
  } catch {
    return redirect(origin, "/?auth_error=google_login_failed", [clearFlow]);
  }
}
