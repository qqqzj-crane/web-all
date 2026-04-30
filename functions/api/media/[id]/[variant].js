import { errorJson, requireSession, unauthorized } from "../../../_lib/auth.js";
import { getMediaRow, VARIANT_COLUMNS } from "../../../_lib/media.js";

export async function onRequestGet(context) {
  if (!(await requireSession(context))) return unauthorized();

  const variant = context.params.variant;
  const columns = VARIANT_COLUMNS[variant];
  if (!columns) return errorJson("不支持的媒体版本", 404);

  const row = await getMediaRow(context.env, context.params.id);
  if (!row) return errorJson("媒体不存在", 404);

  const [keyColumn, mimeColumn, nameColumn] = columns;
  const key = row[keyColumn];
  if (!key) return errorJson("媒体版本不存在", 404);

  const head = await context.env.PHOTOS_BUCKET.head(key);
  if (!head) return errorJson("文件不存在", 404);

  const rangeHeader = context.request.headers.get("Range");
  const range = parseRange(rangeHeader, head.size);
  if (rangeHeader && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${head.size}`,
      },
    });
  }

  const object = range
    ? await context.env.PHOTOS_BUCKET.get(key, { range: { offset: range.start, length: range.length } })
    : await context.env.PHOTOS_BUCKET.get(key);
  if (!object) return errorJson("文件不存在", 404);

  const url = new URL(context.request.url);
  const download = url.searchParams.get("download") === "1";
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row[mimeColumn] || headers.get("Content-Type") || "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(range ? range.length : head.size));
  headers.set("Cache-Control", "private, max-age=3600");
  if (head.httpEtag) headers.set("ETag", head.httpEtag);
  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${head.size}`);
  if (download) {
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row[nameColumn] || key)}`);
  }

  return new Response(object.body, { status: range ? 206 : 200, headers });
}

function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  let start;
  let end;
  if (match[1] === "" && match[2] === "") return null;

  if (match[1] === "") {
    const suffixLength = Number.parseInt(match[2], 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number.parseInt(match[1], 10);
    end = match[2] === "" ? size - 1 : Number.parseInt(match[2], 10);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  end = Math.min(end, size - 1);
  return { start, end, length: end - start + 1 };
}
