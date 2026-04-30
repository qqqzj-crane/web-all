# 4ever Album

`album.qqqzj.cn` 的四人私密媒体相册。站点使用 Cloudflare Pages + Pages Functions 部署，R2 保存照片/实况/短视频文件，D1 保存媒体元数据。

## 功能

- 共享密码登录
- 普通照片、实况照片、短视频混排照片墙
- 实况照片静态显示，悬停或按住播放
- 短视频保留原件，同时使用网页播放版播放
- R2 私有 bucket 存储，所有媒体通过登录后的 API 读取

## Cloudflare 资源

需要准备：

- Pages project: `qqqzj-album`
- Custom domain: `album.qqqzj.cn`
- R2 bucket: `qqqzj-album-media`
- D1 database: `qqqzj-album-db`
- Secrets:
  - `ALBUM_PASSWORD_HASH`
  - `SESSION_SECRET`

## 初始化

生成密码哈希和会话密钥：

```bash
node scripts/hash-password.mjs "你的相册密码"
```

创建 R2 和 D1：

```bash
wrangler r2 bucket create qqqzj-album-media
wrangler d1 create qqqzj-album-db
```

把 `wrangler d1 create` 返回的 `database_id` 填进 `wrangler.toml`，然后初始化远端数据库表：

```bash
wrangler d1 execute qqqzj-album-db --remote --file=schema.sql
```

设置密钥：

```bash
wrangler pages secret put ALBUM_PASSWORD_HASH --project-name qqqzj-album
wrangler pages secret put SESSION_SECRET --project-name qqqzj-album
```

## 本地预览

需要 Wrangler 才能预览 Functions、R2 和 D1 绑定：

```bash
wrangler pages dev . --local
```

如果只直接打开 `index.html`，只能看到前端外壳，登录和上传接口不会工作。

## 部署

```bash
wrangler pages deploy . --project-name qqqzj-album
```

部署后在 Cloudflare Pages 项目的 Custom domains 中添加：

```text
album.qqqzj.cn
```

如果 `qqqzj.cn` 已托管在 Cloudflare，确认 DNS 中有 `album` 的 CNAME 指向 Pages 项目；如果域名 DNS 不在 Cloudflare，需要在当前 DNS 服务商添加 Cloudflare Pages 提示的 CNAME。

## 上传约定

- 普通照片：可以多选原始照片批量上传，前端会逐张生成网页大图和封面；如果原件是浏览器读不了的 HEIC/HEIF，可以额外上传同等数量的 JPG/PNG/WebP 封面。
- 实况照片：可以多选静态原件和动态原件，系统按文件名排序后一一配对保存；额外封面数量需要和静态原件一致，或者不传封面。
- 短视频：可以多选视频原件批量上传；如果额外上传网页播放版 MP4 或封面，数量需要和视频原件一致。
- 每个媒体单独请求，单个媒体建议小于 95MB。更大的视频以后应升级为 direct upload 或 Cloudflare Stream。
