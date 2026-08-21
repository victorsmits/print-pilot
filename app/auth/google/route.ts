import { cookieHeader, createOAuthFlowValue, getGoogleAuthConfig, OAUTH_FLOW_COOKIE, pkceChallenge, randomUrlSafe, requestOrigin, safeReturnTo } from "../../auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = await getGoogleAuthConfig();
  if (!config) return new Response("OAuth Google n’est pas configuré. Renseigne GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET et SESSION_SECRET.", { status: 503 });
  try {
    const origin = requestOrigin(request, config.publicAppUrl);
    const state = randomUrlSafe(), verifier = randomUrlSafe(48);
    const flow = await createOAuthFlowValue({ state, verifier, returnTo: safeReturnTo(new URL(request.url).searchParams.get("return_to")), expiresAt: Date.now() + 10 * 60 * 1000 }, config.sessionSecret);
    const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${origin}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return new Response(null, { status: 302, headers: { location: authorize.toString(), "set-cookie": cookieHeader(OAUTH_FLOW_COOKIE, flow, origin, 10 * 60) } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Configuration OAuth Google invalide.", { status: 500 });
  }
}
