const MAX_CLIENT_UPLOAD_BYTES = 95 * 1024 * 1024;
const IMAGE_LARGE_EDGE = 1800;
const IMAGE_POSTER_EDGE = 760;

const state = {
  media: [],
  filterType: "all",
  search: "",
  uploadType: "photo",
  activeMedia: null,
};

const authView = document.querySelector("#auth-view");
const albumView = document.querySelector("#album-view");
const loginForm = document.querySelector("#login-form");
const logoutButton = document.querySelector("#logout-button");
const galleryPage = document.querySelector("#gallery-page");
const uploadPage = document.querySelector("#upload-page");
const galleryNav = document.querySelector("#gallery-nav");
const uploadNav = document.querySelector("#upload-nav");
const openUploadButton = document.querySelector("#open-upload-button");
const backGalleryButton = document.querySelector("#back-gallery-button");
const galleryGrid = document.querySelector("#gallery-grid");
const emptyState = document.querySelector("#empty-state");
const typeFilter = document.querySelector("#type-filter");
const searchInput = document.querySelector("#search-input");
const uploadType = document.querySelector("#upload-type");
const uploadForm = document.querySelector("#upload-form");
const uploadButton = document.querySelector("#upload-button");
const uploadProgress = document.querySelector("#upload-progress");
const toast = document.querySelector("#toast");
const mediaDialog = document.querySelector("#media-dialog");
const dialogClose = document.querySelector("#dialog-close");
const dialogMedia = document.querySelector("#dialog-media");
const dialogType = document.querySelector("#dialog-type");
const dialogTitle = document.querySelector("#dialog-title");
const dialogCaption = document.querySelector("#dialog-caption");
const downloadLink = document.querySelector("#download-link");
const deleteButton = document.querySelector("#delete-button");

init();

async function init() {
  bindEvents();
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      showAlbum();
      await refreshMedia();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

function bindEvents() {
  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", handleLogout);
  galleryNav.addEventListener("click", () => showGalleryPage());
  uploadNav.addEventListener("click", () => showUploadPage());
  openUploadButton.addEventListener("click", () => showUploadPage());
  backGalleryButton.addEventListener("click", () => showGalleryPage());
  typeFilter.addEventListener("click", handleTypeFilter);
  searchInput.addEventListener("input", () => {
    state.search = searchInput.value.trim().toLowerCase();
    renderGallery();
  });
  uploadType.addEventListener("click", handleUploadType);
  uploadForm.addEventListener("submit", handleUpload);
  uploadForm.addEventListener("reset", () => {
    window.setTimeout(() => setUploadType("photo"), 0);
  });
  dialogClose.addEventListener("click", () => mediaDialog.close());
  deleteButton.addEventListener("click", handleDelete);
  mediaDialog.addEventListener("click", (event) => {
    if (event.target === mediaDialog) mediaDialog.close();
  });
}

async function handleLogin(event) {
  event.preventDefault();
  const password = new FormData(loginForm).get("password");
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ password }),
      headers: { "Content-Type": "application/json" },
    });
    loginForm.reset();
    showAlbum();
    await refreshMedia();
    showToast("已进入相册");
  } catch (error) {
    showToast(error.message || "密码不正确");
  }
}

async function handleLogout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  state.media = [];
  showAuth();
}

function handleTypeFilter(event) {
  const button = event.target.closest("button[data-type]");
  if (!button) return;
  state.filterType = button.dataset.type;
  for (const item of typeFilter.querySelectorAll("button")) {
    item.setAttribute("aria-pressed", String(item === button));
  }
  renderGallery();
}

function handleUploadType(event) {
  const button = event.target.closest("button[data-upload-type]");
  if (!button) return;
  setUploadType(button.dataset.uploadType);
}

function setUploadType(type) {
  state.uploadType = type;
  for (const button of uploadType.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.uploadType === type));
  }
  for (const group of document.querySelectorAll("[data-file-group]")) {
    group.hidden = group.dataset.fileGroup !== type;
  }
}

async function handleUpload(event) {
  event.preventDefault();
  uploadButton.disabled = true;
  uploadButton.textContent = "准备中";
  uploadProgress.textContent = "";
  try {
    const form = new FormData(uploadForm);
    const jobs = buildUploadJobs(form, state.uploadType);
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      uploadButton.textContent = `上传中 ${index + 1}/${jobs.length}`;
      uploadProgress.textContent = `正在处理 ${index + 1}/${jobs.length}: ${job.displayName}`;
      const payload = await buildUploadPayload(form, state.uploadType, job);
      const totalBytes = Array.from(payload.values())
        .filter((value) => value instanceof File)
        .reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_CLIENT_UPLOAD_BYTES) {
        throw new Error(`${job.displayName} 超过 95MB，请压缩或单独处理。`);
      }
      await api("/api/upload", { method: "POST", body: payload });
    }
    uploadForm.reset();
    setUploadType("photo");
    await refreshMedia();
    showGalleryPage();
    showToast(`上传完成：${jobs.length} 个`);
  } catch (error) {
    showToast(error.message || "上传失败");
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = "上传";
    uploadProgress.textContent = "";
  }
}

function buildUploadJobs(form, type) {
  if (type === "photo") {
    const originals = filesOf(form, "photo_original");
    const posters = filesOf(form, "photo_poster");
    if (originals.length === 0) throw new Error("请选择至少一张原始照片");
    return originals.map((original, index) => ({
      original,
      poster: posters[index] || null,
      title: stripExtension(original.name),
      dateSource: original,
      displayName: original.name,
    }));
  }

  if (type === "live") {
    const stills = sortFiles(filesOf(form, "live_still"));
    const motions = sortFiles(filesOf(form, "live_motion"));
    const posters = sortFiles(filesOf(form, "live_poster"));
    if (stills.length === 0 || motions.length === 0) {
      throw new Error("请选择实况静态原件和动态原件");
    }
    if (stills.length !== motions.length) {
      throw new Error("实况静态原件和动态原件数量需要一致");
    }
    if (posters.length > 0 && posters.length !== stills.length) {
      throw new Error("批量实况封面数量需要和静态原件一致，或者不传封面");
    }
    return stills.map((still, index) => ({
      still,
      motion: motions[index],
      poster: posters[index] || null,
      title: stripExtension(still.name),
      dateSource: still,
      displayName: `${still.name} + ${motions[index].name}`,
    }));
  }

  if (type === "video") {
    const originals = filesOf(form, "video_original");
    const playbacks = filesOf(form, "video_playback");
    const posters = filesOf(form, "video_poster");
    if (originals.length === 0) throw new Error("请选择至少一个视频原件");
    if (playbacks.length > 0 && playbacks.length !== originals.length) {
      throw new Error("批量视频播放版数量需要和视频原件一致，或者不传播放版");
    }
    if (posters.length > 0 && posters.length !== originals.length) {
      throw new Error("批量视频封面数量需要和视频原件一致，或者不传封面");
    }
    return originals.map((original, index) => ({
      original,
      playback: playbacks[index] || original,
      poster: posters[index] || null,
      title: stripExtension(original.name),
      dateSource: original,
      displayName: original.name,
    }));
  }

  throw new Error("不支持的上传类型");
}

async function buildUploadPayload(form, type, job) {
  const payload = new FormData();
  payload.set("type", type);
  payload.set("title", job.title);
  payload.set("caption", stringField(form, "caption"));
  payload.set("taken_at", await extractTakenAt(job.dateSource));
  payload.set("people", "");
  payload.set("tags", "");

  if (type === "photo") {
    const original = job.original;
    const posterSource = job.poster || original;
    const poster = await resizeImage(posterSource, IMAGE_POSTER_EDGE, "poster");
    const large = await resizeImage(original, IMAGE_LARGE_EDGE, "large").catch(() =>
      resizeImage(posterSource, IMAGE_LARGE_EDGE, "large"),
    );
    payload.set("original", original, original.name);
    payload.set("large", large, large.name);
    payload.set("poster", poster, poster.name);
  }

  if (type === "live") {
    const still = job.still;
    const motion = job.motion;
    const posterSource = job.poster || still;
    const poster = await resizeImage(posterSource, IMAGE_POSTER_EDGE, "live-poster");
    payload.set("original_still", still, still.name);
    payload.set("original_motion", motion, motion.name);
    payload.set("poster", poster, poster.name);
    payload.set("motion", motion, motion.name);
    const duration = await readVideoDuration(motion).catch(() => 0);
    if (duration) payload.set("duration", String(Math.round(duration)));
  }

  if (type === "video") {
    const original = job.original;
    const playback = job.playback;
    const posterFile = job.poster || (await captureVideoPoster(playback));
    const duration = await readVideoDuration(playback).catch(() => 0);
    payload.set("original_video", original, original.name);
    payload.set("playback_video", playback, playback.name);
    payload.set("poster", posterFile, posterFile.name);
    if (duration) payload.set("duration", String(Math.round(duration)));
  }

  return payload;
}

async function refreshMedia() {
  const response = await api("/api/media");
  state.media = response.media || [];
  renderGallery();
}

function renderGallery() {
  const items = filteredMedia();
  galleryGrid.replaceChildren(...items.map(renderMediaCard));
  emptyState.hidden = items.length > 0;
}

function filteredMedia() {
  return state.media.filter((item) => {
    if (state.filterType !== "all" && item.type !== state.filterType) return false;
    if (!state.search) return true;
    const haystack = [item.caption, item.taken_at].join(" ").toLowerCase();
    return haystack.includes(state.search);
  });
}

function renderMediaCard(item) {
  const card = document.createElement("article");
  card.className = "media-card";
  card.dataset.type = item.type;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "media-open";
  button.setAttribute("aria-label", `打开 ${item.caption || item.title || "媒体"}`);
  button.addEventListener("click", () => openMedia(item));

  const poster = document.createElement("img");
  poster.loading = "lazy";
  poster.decoding = "async";
  poster.src = mediaUrl(item.id, "poster");
  poster.alt = item.title || "相册媒体";
  button.append(poster);

  if (item.type === "live") {
    const liveVideo = document.createElement("video");
    liveVideo.src = mediaUrl(item.id, "motion");
    liveVideo.muted = true;
    liveVideo.loop = true;
    liveVideo.playsInline = true;
    liveVideo.preload = "none";
    liveVideo.className = "live-preview";
    button.append(liveVideo);
    button.addEventListener("pointerenter", () => playPreview(liveVideo));
    button.addEventListener("pointerleave", () => pausePreview(liveVideo));
    button.addEventListener("pointerdown", () => playPreview(liveVideo));
    button.addEventListener("pointerup", () => pausePreview(liveVideo));
    button.addEventListener("pointercancel", () => pausePreview(liveVideo));
  }

  const badge = document.createElement("span");
  badge.className = "type-badge";
  badge.textContent = typeLabel(item.type);
  button.append(badge);

  if (item.type === "video") {
    const play = document.createElement("span");
    play.className = "play-badge";
    play.textContent = "播放";
    button.append(play);
  }

  const copy = document.createElement("div");
  copy.className = "media-copy";
  copy.hidden = !item.caption;
  copy.innerHTML = item.caption ? `<p>${escapeHtml(item.caption)}</p>` : "";

  card.append(button, copy);
  return card;
}

function openMedia(item) {
  state.activeMedia = item;
  dialogMedia.replaceChildren();
  dialogType.textContent = typeLabel(item.type);
  dialogTitle.hidden = !item.caption;
  dialogTitle.textContent = item.caption || "";
  dialogCaption.textContent = "";

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = mediaUrl(item.id, "playback_video");
    video.poster = mediaUrl(item.id, "poster");
    video.controls = true;
    video.playsInline = true;
    dialogMedia.append(video);
    downloadLink.href = mediaUrl(item.id, "original_video", true);
  } else if (item.type === "live") {
    const wrap = document.createElement("button");
    wrap.className = "live-detail";
    wrap.type = "button";
    wrap.setAttribute("aria-label", "按住播放实况照片");
    const image = document.createElement("img");
    image.src = mediaUrl(item.id, "poster");
    image.alt = item.title || "实况照片";
    const video = document.createElement("video");
    video.src = mediaUrl(item.id, "motion");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "metadata";
    wrap.append(image, video);
    wrap.addEventListener("pointerenter", () => playPreview(video));
    wrap.addEventListener("pointerleave", () => pausePreview(video));
    wrap.addEventListener("pointerdown", () => playPreview(video));
    wrap.addEventListener("pointerup", () => pausePreview(video));
    dialogMedia.append(wrap);
    downloadLink.href = mediaUrl(item.id, "original_still", true);
  } else {
    const image = document.createElement("img");
    image.src = mediaUrl(item.id, "large");
    image.alt = item.title || "照片";
    dialogMedia.append(image);
    downloadLink.href = mediaUrl(item.id, "original", true);
  }

  mediaDialog.showModal();
}

async function handleDelete() {
  if (!state.activeMedia) return;
  const confirmed = window.confirm(`确定删除「${state.activeMedia.title || "这条媒体"}」吗？`);
  if (!confirmed) return;
  try {
    await api(`/api/media/${state.activeMedia.id}`, { method: "DELETE" });
    mediaDialog.close();
    await refreshMedia();
    showToast("已删除");
  } catch (error) {
    showToast(error.message || "删除失败");
  }
}

function showAuth() {
  authView.hidden = false;
  albumView.hidden = true;
}

function showAlbum() {
  authView.hidden = true;
  albumView.hidden = false;
  showGalleryPage();
}

function showGalleryPage() {
  galleryPage.hidden = false;
  uploadPage.hidden = true;
  galleryNav.setAttribute("aria-pressed", "true");
  uploadNav.setAttribute("aria-pressed", "false");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showUploadPage() {
  galleryPage.hidden = true;
  uploadPage.hidden = false;
  galleryNav.setAttribute("aria-pressed", "false");
  uploadNav.setAttribute("aria-pressed", "true");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error(data?.error || `请求失败：${response.status}`);
  }
  return data;
}

async function resizeImage(file, maxEdge, suffix) {
  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    if (!blob) throw new Error("无法生成网页图片");
    return new File([blob], `${stripExtension(file.name)}-${suffix}.webp`, { type: "image/webp" });
  } catch {
    throw new Error("浏览器无法读取这张图片来生成网页版本，请额外提供 JPG/PNG/WebP 封面。");
  }
}

async function captureVideoPoster(file) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = URL.createObjectURL(file);
  try {
    await once(video, "loadedmetadata");
    video.currentTime = Math.min(1, Math.max(0, video.duration / 10 || 0));
    await once(video, "seeked");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob) throw new Error("无法生成视频封面");
    return new File([blob], `${stripExtension(file.name)}-poster.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

async function readVideoDuration(file) {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = URL.createObjectURL(file);
  try {
    await once(video, "loadedmetadata");
    return video.duration || 0;
  } finally {
    URL.revokeObjectURL(video.src);
  }
}

function once(target, eventName) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("媒体读取超时")), 8000);
    target.addEventListener(
      eventName,
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    target.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("无法读取媒体文件"));
      },
      { once: true },
    );
  });
}

function playPreview(video) {
  video.dataset.playing = "true";
  video.play().catch(() => {});
}

function pausePreview(video) {
  video.dataset.playing = "false";
  video.pause();
  video.currentTime = 0;
}

async function extractTakenAt(file) {
  if (!file) return "";
  const exifDate = await readJpegExifDate(file).catch(() => "");
  if (exifDate) return exifDate;
  if (file.lastModified) return new Date(file.lastModified).toISOString().slice(0, 10);
  return "";
}

async function readJpegExifDate(file) {
  const name = file.name.toLowerCase();
  const isJpeg = file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg");
  if (!isJpeg) return "";

  const buffer = await file.slice(0, 256 * 1024).arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return "";

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && readAscii(view, offset + 4, 6) === "Exif\0\0") {
      return readTiffDate(view, offset + 10, length - 8);
    }
    offset += 2 + length;
  }
  return "";
}

function readTiffDate(view, tiffStart, tiffLength) {
  if (tiffStart + tiffLength > view.byteLength || tiffLength < 12) return "";
  const endian = readAscii(view, tiffStart, 2);
  const littleEndian = endian === "II";
  if (!littleEndian && endian !== "MM") return "";
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return "";

  const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
  const ifd0 = readIfd(view, tiffStart, firstIfdOffset, littleEndian);
  const exifIfdOffset = ifd0.pointers.get(0x8769);
  const exifIfd = exifIfdOffset ? readIfd(view, tiffStart, exifIfdOffset, littleEndian) : { values: new Map() };
  return (
    normalizeExifDate(exifIfd.values.get(0x9003)) ||
    normalizeExifDate(exifIfd.values.get(0x9004)) ||
    normalizeExifDate(ifd0.values.get(0x0132))
  );
}

function readIfd(view, tiffStart, ifdOffset, littleEndian) {
  const values = new Map();
  const pointers = new Map();
  const start = tiffStart + ifdOffset;
  if (start + 2 > view.byteLength) return { values, pointers };
  const count = view.getUint16(start, littleEndian);

  for (let index = 0; index < count; index += 1) {
    const entry = start + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const size = view.getUint32(entry + 4, littleEndian);
    const valueOffset = view.getUint32(entry + 8, littleEndian);

    if (type === 2) {
      const textStart = size <= 4 ? entry + 8 : tiffStart + valueOffset;
      values.set(tag, readAscii(view, textStart, size).replace(/\0+$/, ""));
    } else if (tag === 0x8769) {
      pointers.set(tag, valueOffset);
    }
  }

  return { values, pointers };
}

function normalizeExifDate(value) {
  const match = /^(\d{4}):(\d{2}):(\d{2})/.exec(value || "");
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function readAscii(view, start, length) {
  let text = "";
  for (let index = 0; index < length && start + index < view.byteLength; index += 1) {
    text += String.fromCharCode(view.getUint8(start + index));
  }
  return text;
}

function filesOf(form, name) {
  return form.getAll(name).filter((file) => file instanceof File && file.size > 0);
}

function sortFiles(files) {
  return [...files].sort((left, right) =>
    left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" }),
  );
}

function stringField(form, name) {
  return String(form.get(name) || "").trim();
}

function mediaUrl(id, variant, download = false) {
  return `/api/media/${encodeURIComponent(id)}/${encodeURIComponent(variant)}${download ? "?download=1" : ""}`;
}

function typeLabel(type) {
  return { photo: "照片", live: "实况", video: "视频" }[type] || type;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function stripExtension(name) {
  return name.replace(/\.[^.]+$/, "") || "media";
}

function showToast(message) {
  toast.textContent = message;
  toast.dataset.visible = "true";
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.dataset.visible = "false";
  }, 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}
