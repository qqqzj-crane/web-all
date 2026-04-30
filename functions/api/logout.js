import { clearSessionCookie, json } from "../_lib/auth.js";

export function onRequestPost(context) {
  return json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(context.request),
      },
    },
  );
}
