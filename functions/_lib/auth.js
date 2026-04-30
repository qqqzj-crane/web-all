const COOKIE_NAME = "album_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function errorJson(message, status = 400) {
  return json({ error: message }, { status });
}

export function unauthorized() {
  return errorJson("请先登录相册", 401);
}

export async function requireSession(context) {
  const session = await readSession(context.request, context.env);
  if (!session) return null;
  return session;
}

export async function readSession(request, env) {
  const token = parseCookies(request.headers.get("Cookie") || "")[COOKIE_NAME];
  if (!token || !env.SESSION_SECRET) return null;

  const [payloadPart, signature] = token.split(".");
  if (!payloadPart || !signature) return null;

  const expected = await sign(payloadPart, env.SESSION_SECRET);
  if (!constantEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyPassword(password, env) {
  if (!env.ALBUM_PASSWORD_HASH) {
    throw new Error("缺少 ALBUM_PASSWORD_HASH 环境变量");
  }

  const expected = env.ALBUM_PASSWORD_HASH.trim();
  if (expected.startsWith("plain:")) {
    return constantEqual(password, expected.slice("plain:".length));
  }

  const actualHash = await sha256Hex(password);
  const expectedHash = expected.startsWith("sha256:") ? expected.slice("sha256:".length) : expected;
  return constantEqual(actualHash, expectedHash.toLowerCase());
}

export async function createSessionCookie(request, env) {
  if (!env.SESSION_SECRET) {
    throw new Error("缺少 SESSION_SECRET 环境变量");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now,
      exp: now + SESSION_TTL_SECONDS,
    }),
  );
  const token = `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
  return serializeCookie(request, COOKIE_NAME, token, {
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
}

export function clearSessionCookie(request) {
  return serializeCookie(request, COOKIE_NAME, "", {
    maxAge: 0,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
}

function serializeCookie(request, name, value, options) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return [
    `${name}=${value}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
    options.httpOnly ? "HttpOnly" : "",
  ]
    .filter(Boolean)
    .join("; ")
    .concat(secure);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncode(signature);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), part.slice(index + 1)];
      }),
  );
}

function constantEqual(left, right) {
  const a = String(left);
  const b = String(right);
  let mismatch = a.length === b.length ? 0 : 1;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= a.charCodeAt(index % a.length) ^ b.charCodeAt(index % b.length);
  }
  return mismatch === 0;
}

function base64UrlEncode(value) {
  const bytes =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : typeof value === "string"
        ? new TextEncoder().encode(value)
        : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
