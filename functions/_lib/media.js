export const VARIANT_COLUMNS = {
  poster: ["poster_key", "poster_mime", "poster_name"],
  large: ["large_key", "large_mime", "large_name"],
  original: ["original_key", "original_mime", "original_name"],
  motion: ["motion_key", "motion_mime", "motion_name"],
  original_still: ["original_still_key", "original_still_mime", "original_still_name"],
  original_motion: ["original_motion_key", "original_motion_mime", "original_motion_name"],
  playback_video: ["playback_video_key", "playback_video_mime", "playback_video_name"],
  original_video: ["original_video_key", "original_video_mime", "original_video_name"],
};

const MAX_FILE_BYTES = 95 * 1024 * 1024;
const TYPES = new Set(["photo", "live", "video"]);

export function parseList(value) {
  return String(value || "")
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeMedia(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    caption: row.caption,
    people: safeJson(row.people, []),
    tags: safeJson(row.tags, []),
    taken_at: row.taken_at,
    duration: row.duration,
    created_at: row.created_at,
    updated_at: row.updated_at,
    variants: Object.fromEntries(
      Object.entries(VARIANT_COLUMNS).map(([variant, [key]]) => [variant, Boolean(row[key])]),
    ),
  };
}

export async function listMedia(env) {
  const result = await env.ALBUM_DB.prepare(
    `SELECT * FROM media ORDER BY COALESCE(taken_at, created_at) DESC, created_at DESC`,
  ).all();
  return (result.results || []).map(serializeMedia);
}

export async function getMediaRow(env, id) {
  return env.ALBUM_DB.prepare(`SELECT * FROM media WHERE id = ?`).bind(id).first();
}

export async function deleteMedia(env, row) {
  const keys = Object.values(VARIANT_COLUMNS)
    .map(([key]) => row[key])
    .filter(Boolean);
  await Promise.all(keys.map((key) => env.PHOTOS_BUCKET.delete(key)));
  await env.ALBUM_DB.prepare(`DELETE FROM media WHERE id = ?`).bind(row.id).run();
}

export async function updateMedia(env, id, patch) {
  const allowed = ["title", "caption", "people", "tags", "taken_at", "duration"];
  const entries = Object.entries(patch).filter(([key]) => allowed.includes(key));
  if (entries.length === 0) return getMediaRow(env, id);

  const values = entries.map(([key, value]) => {
    if (key === "people" || key === "tags") return JSON.stringify(Array.isArray(value) ? value : parseList(value));
    return value ?? null;
  });
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  await env.ALBUM_DB.prepare(`UPDATE media SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(...values, id)
    .run();
  return getMediaRow(env, id);
}

export async function createMedia(env, form) {
  const type = String(form.get("type") || "");
  if (!TYPES.has(type)) throw new Error("不支持的媒体类型");

  const id = crypto.randomUUID();
  const title = cleanText(form.get("title")) || "未命名";
  const caption = cleanText(form.get("caption"));
  const takenAt = cleanText(form.get("taken_at")) || null;
  const duration = Number.parseInt(form.get("duration") || "", 10);
  const people = JSON.stringify(parseList(form.get("people")));
  const tags = JSON.stringify(parseList(form.get("tags")));

  const variants = await saveVariants(env, type, id, form);
  await env.ALBUM_DB.prepare(
    `INSERT INTO media (
      id, type, title, caption, people, tags, taken_at, duration,
      poster_key, poster_mime, poster_name,
      large_key, large_mime, large_name,
      original_key, original_mime, original_name,
      motion_key, motion_mime, motion_name,
      original_still_key, original_still_mime, original_still_name,
      original_motion_key, original_motion_mime, original_motion_name,
      playback_video_key, playback_video_mime, playback_video_name,
      original_video_key, original_video_mime, original_video_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      type,
      title,
      caption,
      people,
      tags,
      takenAt,
      Number.isFinite(duration) ? duration : null,
      variants.poster?.key || null,
      variants.poster?.mime || null,
      variants.poster?.name || null,
      variants.large?.key || null,
      variants.large?.mime || null,
      variants.large?.name || null,
      variants.original?.key || null,
      variants.original?.mime || null,
      variants.original?.name || null,
      variants.motion?.key || null,
      variants.motion?.mime || null,
      variants.motion?.name || null,
      variants.original_still?.key || null,
      variants.original_still?.mime || null,
      variants.original_still?.name || null,
      variants.original_motion?.key || null,
      variants.original_motion?.mime || null,
      variants.original_motion?.name || null,
      variants.playback_video?.key || null,
      variants.playback_video?.mime || null,
      variants.playback_video?.name || null,
      variants.original_video?.key || null,
      variants.original_video?.mime || null,
      variants.original_video?.name || null,
    )
    .run();

  return serializeMedia(await getMediaRow(env, id));
}

async function saveVariants(env, type, id, form) {
  const required = {
    photo: ["poster", "large", "original"],
    live: ["poster", "motion", "original_still", "original_motion"],
    video: ["poster", "playback_video", "original_video"],
  }[type];

  const variants = {};
  for (const variant of required) {
    const file = requireFile(form, variant);
    variants[variant] = await putVariant(env, type, id, variant, file);
  }
  return variants;
}

async function putVariant(env, type, id, variant, file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name || variant} 超过 95MB，请拆分或压缩后再上传`);
  }
  const key = `${type}/${id}/${variant}-${safeFileName(file.name || "media.bin")}`;
  const mime = file.type || guessMime(file.name) || "application/octet-stream";
  await env.PHOTOS_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: mime,
      cacheControl: "private, max-age=3600",
    },
    customMetadata: {
      originalName: file.name || variant,
      variant,
      mediaId: id,
    },
  });
  return { key, mime, name: file.name || `${variant}.bin` };
}

function requireFile(form, name) {
  const file = form.get(name);
  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`缺少 ${name} 文件`);
  }
  return file;
}

function cleanText(value) {
  return String(value || "").trim().slice(0, 800);
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function safeFileName(name) {
  const cleaned = String(name)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "media.bin";
}

function guessMime(name) {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  return "";
}
