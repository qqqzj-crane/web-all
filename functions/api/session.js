import { json, readSession } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const session = await readSession(context.request, context.env);
  return json({ authenticated: Boolean(session) });
}
