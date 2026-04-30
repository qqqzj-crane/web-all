import { errorJson, json, requireSession, unauthorized } from "../../../_lib/auth.js";
import { deleteMedia, getMediaRow, serializeMedia, updateMedia } from "../../../_lib/media.js";

export async function onRequestPatch(context) {
  if (!(await requireSession(context))) return unauthorized();
  const row = await getMediaRow(context.env, context.params.id);
  if (!row) return errorJson("媒体不存在", 404);
  const patch = await context.request.json();
  const updated = await updateMedia(context.env, row.id, patch);
  return json({ media: serializeMedia(updated) });
}

export async function onRequestDelete(context) {
  if (!(await requireSession(context))) return unauthorized();
  const row = await getMediaRow(context.env, context.params.id);
  if (!row) return errorJson("媒体不存在", 404);
  await deleteMedia(context.env, row);
  return json({ ok: true });
}
