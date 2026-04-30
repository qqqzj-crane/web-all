# Album

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

## 多人协作

这个相册面向少数固定成员共同维护，协作时尽量把“代码改动”和“媒体上传”分开处理：页面、接口、样式走 Git 分支和 PR；照片、实况、短视频优先通过登录后的上传页进入 R2 和 D1。

### 推荐流程

1. 开始前先从 `main` 拉最新代码。
2. 每次改动新建一个短分支，例如 `update-upload-copy`、`fix-live-photo-preview`。
3. 只改本次负责的内容，避免顺手重排无关文件。
4. 本地运行 `wrangler pages dev . --local`，至少检查登录、照片墙、上传入口和本次修改到的页面。
5. 提交并 push 分支，在 GitHub 上开 Pull Request。
6. 由另一个成员检查后再合并；合并后再部署到 Cloudflare Pages。

### 分工建议

- 页面文案和样式：主要改 `index.html`、`styles.css`。
- 前端交互和上传逻辑：主要改 `app.js`。
- 后端接口、R2、D1 逻辑：主要改 Pages Functions 相关代码，并同步检查 `schema.sql` 和 `wrangler.toml`。
- 数据表结构：需要先说明迁移目的，再执行 D1 变更；不要直接手改远端数据作为长期方案。
- 媒体内容：每个人可以上传自己负责的照片、实况或视频；批量上传前先小批量测试一次。

### 权限和密钥

- `ALBUM_PASSWORD_HASH`、`SESSION_SECRET` 只放在 Cloudflare Pages Secrets 中，不写进仓库、聊天记录或截图。
- 协作者如果只负责上传媒体，只需要相册登录密码，不需要 Cloudflare 或 GitHub 写权限。
- 需要改代码的协作者使用 GitHub 分支和 PR；需要部署或改 R2/D1 的协作者再单独授予 Cloudflare 权限。
- 改密码时重新生成 `ALBUM_PASSWORD_HASH`，并在 Cloudflare Pages 中更新对应 Secret。

### 冲突处理

- 多人同时改 `styles.css`、`app.js` 或数据库结构前，先在群里说一声，避免重复改同一块。
- 如果 PR 里同时出现代码改动和大量媒体数据改动，优先拆开处理。
- 如果本地预览正常但部署后异常，先检查 Cloudflare Pages 的环境变量、R2 bucket、D1 database 绑定是否和 `wrangler.toml` 一致。

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

- 上传页只保留“说点什么”作为可选说明；不写说明时前台留空。
- 普通照片：可以多选原始照片批量上传，前端会逐张生成网页大图和封面；如果原件是浏览器读不了的 HEIC/HEIF，可以额外上传同等数量的 JPG/PNG/WebP 封面。
- 实况照片：可以多选静态原件和动态原件，系统按文件名排序后一一配对保存；额外封面数量需要和静态原件一致，或者不传封面。
- 短视频：可以多选视频原件批量上传；如果额外上传网页播放版 MP4 或封面，数量需要和视频原件一致。
- 日期会优先从 JPEG EXIF 拍摄日期读取，读不到时使用文件日期；照片墙按日期排序。
- 每个媒体单独请求，单个媒体建议小于 95MB。更大的视频以后应升级为 direct upload 或 Cloudflare Stream。
