import { errorJson, json, requireSession, unauthorized } from "../_lib/auth.js";
import { createMedia } from "../_lib/media.js";

export async function onRequestPost(context) {
  if (!(await requireSession(context))) return unauthorized();
  try {
    const form = await context.request.formData();
    const media = await createMedia(context.env, form);
    return json({ media }, { status: 201 });
  } catch (error) {
    return errorJson(error.message || "上传失败", 400);
  }
}
