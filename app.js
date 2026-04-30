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
const galleryGrid = document.querySelector("#gallery-grid");
const emptyState = document.querySelector("#empty-state");
const typeFilter = document.querySelector("#type-filter");
const searchInput = document.querySelector("#search-input");
const uploadType = document.querySelector("#upload-type");
const uploadForm = document.querySelector("#upload-form");
const uploadButton = document.querySelector("#upload-button");
const toast = document.querySelector("#toast");
const mediaDialog = document.querySelector("#media-dialog");
const dialogClose = document.querySelector("#dialog-close");
const dialogMedia = document.querySelector("#dialog-media");
const dialogType = document.querySelector("#dialog-type");
const dialogTitle = document.querySelector("#dialog-title");
const dialogCaption = document.querySelector("#dialog-caption");
const dialogTags = document.querySelector("#dialog-tags");
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
  uploadButton.textContent = "处理中";
  try {
    const payload = await buildUploadPayload(new FormData(uploadForm), state.uploadType);
    const totalBytes = Array.from(payload.values())
      .filter((value) => value instanceof File)
      .reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_CLIENT_UPLOAD_BYTES) {
      throw new Error("这次上传超过 95MB，请拆成更小的文件或先压缩视频。");
    }
    await api("/api/upload", { method: "POST", body: payload });
    uploadForm.reset();
    setUploadType("photo");
    await refreshMedia();
    showToast("上传完成");
  } catch (error) {
    showToast(error.message || "上传失败");
  } finally {
    uploadButton.disabled = false;
    uploadButton.textContent = "上传";
  }
}

async function buildUploadPayload(form, type) {
  const payload = new FormData();
  payload.set("type", type);
  payload.set("title", stringField(form, "title"));
  payload.set("caption", stringField(form, "caption"));
  payload.set("taken_at", stringField(form, "taken_at"));
  payload.set("people", normalizeList(stringField(form, "people")).join(","));
  payload.set("tags", normalizeList(stringField(form, "tags")).join(","));

  if (type === "photo") {
    const original = requiredFile(form, "photo_original", "请选择原始照片");
    const posterSource = optionalFile(form, "photo_poster") || original;
    const poster = await resizeImage(posterSource, IMAGE_POSTER_EDGE, "poster");
    const large = await resizeImage(original, IMAGE_LARGE_EDGE, "large").catch(() =>
      resizeImage(posterSource, IMAGE_LARGE_EDGE, "large"),
    );
    payload.set("original", original, original.name);
    payload.set("large", large, large.name);
    payload.set("poster", poster, poster.name);
  }

  if (type === "live") {
    const still = requiredFile(form, "live_still", "请选择实况静态原件");
    const motion = requiredFile(form, "live_motion", "请选择实况动态原件");
    const posterSource = optionalFile(form, "live_poster") || still;
    const poster = await resizeImage(posterSource, IMAGE_POSTER_EDGE, "live-poster");
    payload.set("original_still", still, still.name);
    payload.set("original_motion", motion, motion.name);
    payload.set("poster", poster, poster.name);
    payload.set("motion", motion, motion.name);
    const duration = await readVideoDuration(motion).catch(() => 0);
    if (duration) payload.set("duration", String(Math.round(duration)));
  }

  if (type === "video") {
    const original = requiredFile(form, "video_original", "请选择视频原件");
    const playback = optionalFile(form, "video_playback") || original;
    const posterFile = optionalFile(form, "video_poster") || (await captureVideoPoster(playback));
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
  renderCounts();
  galleryGrid.replaceChildren(...items.map(renderMediaCard));
  emptyState.hidden = items.length > 0;
}

function renderCounts() {
  document.querySelector("#count-all").textContent = state.media.length;
  document.querySelector("#count-live").textContent = state.media.filter((item) => item.type === "live").length;
  document.querySelector("#count-video").textContent = state.media.filter((item) => item.type === "video").length;
}

function filteredMedia() {
  return state.media.filter((item) => {
    if (state.filterType !== "all" && item.type !== state.filterType) return false;
    if (!state.search) return true;
    const haystack = [item.title, item.caption, ...(item.people || []), ...(item.tags || [])]
      .join(" ")
      .toLowerCase();
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
  button.setAttribute("aria-label", `打开 ${item.title}`);
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
  copy.innerHTML = `
    <h3>${escapeHtml(item.title || "未命名")}</h3>
    <p>${escapeHtml(item.caption || formatDate(item.taken_at) || "没有说明")}</p>
    <div class="tag-row">
      ${(item.people || []).map((person) => `<span>${escapeHtml(person)}</span>`).join("")}
      ${(item.tags || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;

  card.append(button, copy);
  return card;
}

function openMedia(item) {
  state.activeMedia = item;
  dialogMedia.replaceChildren();
  dialogType.textContent = typeLabel(item.type);
  dialogTitle.textContent = item.title || "未命名";
  dialogCaption.textContent = item.caption || formatDate(item.taken_at) || "";
  dialogTags.replaceChildren(
    ...(item.people || []).map(makeTag),
    ...(item.tags || []).map(makeTag),
  );

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

function requiredFile(form, name, message) {
  const file = optionalFile(form, name);
  if (!file) throw new Error(message);
  return file;
}

function optionalFile(form, name) {
  const file = form.get(name);
  return file instanceof File && file.size > 0 ? file : null;
}

function stringField(form, name) {
  return String(form.get(name) || "").trim();
}

function normalizeList(value) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function makeTag(value) {
  const tag = document.createElement("span");
  tag.textContent = value;
  return tag;
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
