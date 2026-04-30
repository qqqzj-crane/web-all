import { json, requireSession, unauthorized } from "../../_lib/auth.js";
import { listMedia } from "../../_lib/media.js";

export async function onRequestGet(context) {
  if (!(await requireSession(context))) return unauthorized();
  return json({ media: await listMedia(context.env) });
}
