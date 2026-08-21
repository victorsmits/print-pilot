import { cookies } from "next/headers";

export type AuthenticatedUser = {
  displayName: string;
  email: string;
  fullName: string | null;
  picture: string | null;
};

export type GoogleAuthConfig = {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  publicAppUrl: string | null;
};

type SessionPayload = AuthenticatedUser & {
  provider: "google";
  subject: string;
  expiresAt: number;
};

export type OAuthFlowPayload = {
  state: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
};

export const SESSION_COOKIE = "printpilot_session";
export const OAUTH_FLOW_COOKIE = "printpilot_oauth_flow";

async function workerEnv(): Promise<Record<string, unknown>> {
  try {
    const { env } = await import("cloudflare:workers");
    return env as unknown as Record<string, unknown>;
  } catch {
    return {};
  }
}

function envString(env: Record<string, unknown>, key: string) {
  return String(env[key] ?? "").trim();
}

export async function getGoogleAuthConfig(): Promise<GoogleAuthConfig | null> {
  const env = await workerEnv();
  const clientId = envString(env, "GOOGLE_CLIENT_ID");
  const clientSecret = envString(env, "GOOGLE_CLIENT_SECRET");
  const sessionSecret = envString(env, "SESSION_SECRET");
  if (!clientId || !clientSecret || sessionSecret.length < 32) return null;
  return { clientId, clientSecret, sessionSecret, publicAppUrl: envString(env, "PUBLIC_APP_URL") || null };
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const env = await workerEnv();
  if (envString(env, "AUTH_DISABLED").toLowerCase() === "true") {
    const email = envString(env, "SELF_HOSTED_USER_EMAIL").toLowerCase() || "owner@printpilot.local";
    const fullName = envString(env, "SELF_HOSTED_USER_NAME") || "Propriétaire PrintPilot";
    return { displayName: fullName, email, fullName, picture: null };
  }
  const config = await getGoogleAuthConfig();
  if (!config) return null;
  const store = await cookies();
  const session = await verifySignedValue<SessionPayload>(store.get(SESSION_COOKIE)?.value ?? "", config.sessionSecret);
  if (!session || session.provider !== "google" || !session.subject || !session.email || session.expiresAt <= Date.now()) return null;
  return { displayName: session.displayName || session.email, email: session.email.toLowerCase(), fullName: session.fullName, picture: session.picture };
}

export async function createSessionValue(user: { subject: string; email: string; fullName: string | null; picture: string | null }, secret: string) {
  const payload: SessionPayload = {
    provider: "google",
    subject: user.subject,
    email: user.email.toLowerCase(),
    fullName: user.fullName,
    displayName: user.fullName || user.email,
    picture: user.picture,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  return signValue(payload, secret);
}

export async function createOAuthFlowValue(payload: OAuthFlowPayload, secret: string) {
  return signValue(payload, secret);
}

export async function readOAuthFlowValue(value: string, secret: string) {
  const payload = await verifySignedValue<OAuthFlowPayload>(value, secret);
  return payload && payload.state && payload.verifier && payload.expiresAt > Date.now() ? payload : null;
}

export function safeReturnTo(value: string | null | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://printpilot.local");
    return url.origin === "https://printpilot.local" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

export function requestOrigin(request: Request, configuredOrigin: string | null) {
  if (configuredOrigin) {
    const url = new URL(configuredOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("PUBLIC_APP_URL doit commencer par http:// ou https://.");
    return url.origin;
  }
  return new URL(request.url).origin;
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function cookieHeader(name: string, value: string, origin: string, maxAge: number) {
  const secure = new URL(origin).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function randomUrlSafe(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(value);
}

export async function pkceChallenge(verifier: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

async function signValue(value: unknown, secret: string) {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const signature = await hmac(payload, secret);
  return `${payload}.${base64Url(signature)}`;
}

async function verifySignedValue<T>(value: string, secret: string): Promise<T | null> {
  const [payload, encodedSignature, extra] = value.split(".");
  if (!payload || !encodedSignature || extra) return null;
  try {
    const expected = await hmac(payload, secret), actual = fromBase64Url(encodedSignature);
    if (actual.length !== expected.length) return null;
    let difference = 0; for (let index = 0; index < actual.length; index++) difference |= actual[index] ^ expected[index];
    if (difference !== 0) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as T;
  } catch {
    return null;
  }
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function base64Url(value: Uint8Array) {
  let binary = ""; for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized), bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
