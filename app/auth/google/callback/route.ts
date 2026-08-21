import { cookieHeader, createSessionValue, getGoogleAuthConfig, OAUTH_FLOW_COOKIE, readCookie, readOAuthFlowValue, requestOrigin, SESSION_COOKIE } from "../../../auth";

export const dynamic = "force-dynamic";

type GoogleUserInfo = { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };

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
  const providerError = url.searchParams.get("error");
  if (providerError) {
    console.error("[PrintPilot OAuth] Google a refusé l’autorisation", { error: providerError });
    return redirect(origin, `/?auth_error=${providerError === "access_denied" ? "google_access_denied" : "google_authorization_failed"}`, [clearFlow]);
  }
  if (!flow || url.searchParams.get("state") !== flow.state || !url.searchParams.get("code")) return redirect(origin, "/?auth_error=invalid_oauth_response", [clearFlow]);
  const redirectUri = `${origin}/auth/google/callback`;
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: url.searchParams.get("code")!, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: flow.verifier }),
    });
  } catch (error) {
    console.error("[PrintPilot OAuth] Connexion TLS à Google impossible", { error: error instanceof Error ? error.message : String(error), redirectUri });
    return redirect(origin, "/?auth_error=google_network_error", [clearFlow]);
  }
  const tokens = await tokenResponse.json() as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) {
    console.error("[PrintPilot OAuth] Échange du code refusé", { status: tokenResponse.status, error: tokens.error, description: tokens.error_description, redirectUri });
    const knownError = tokens.error === "invalid_client" ? "google_invalid_client" : tokens.error === "redirect_uri_mismatch" ? "google_redirect_uri_mismatch" : tokens.error === "invalid_grant" ? "google_invalid_grant" : "google_token_exchange_failed";
    return redirect(origin, `/?auth_error=${knownError}`, [clearFlow]);
  }
  let userResponse: Response;
  try { userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } }); }
  catch (error) {
    console.error("[PrintPilot OAuth] Lecture du profil Google impossible", { error: error instanceof Error ? error.message : String(error) });
    return redirect(origin, "/?auth_error=google_network_error", [clearFlow]);
  }
  const user = await userResponse.json() as GoogleUserInfo;
  if (!userResponse.ok || !user.sub || !user.email || user.email_verified !== true) {
    console.error("[PrintPilot OAuth] Identité Google incomplète", { status: userResponse.status, hasSubject: Boolean(user.sub), hasEmail: Boolean(user.email), emailVerified: user.email_verified });
    return redirect(origin, "/?auth_error=google_identity_invalid", [clearFlow]);
  }
  const session = await createSessionValue({ subject: user.sub, email: user.email, fullName: user.name?.trim() || null, picture: user.picture || null }, config.sessionSecret);
  return redirect(origin, flow.returnTo, [clearFlow, cookieHeader(SESSION_COOKIE, session, origin, 7 * 24 * 60 * 60)]);
}
