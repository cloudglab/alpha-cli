# 运维与编排高级命令 (ops-advanced)

本文档覆盖 SSH 推送、自定义运维命令。基础查询见各业务域主链路文档。

## 写命令（必须传 `confirm=true`）

### `opsPush`

通过堡垒机登录目标服务器，下载 URL 列表（镜像包 / chart 包 / 物料），打包并用 rsync 推送到指定城市。

```bash
alpha opsPush \
  --urls http://devops.cloudglab.cn/release/job-glab-pkg_images/319751/pkg-1.0.0-aio-319751.tar \
  --pkgName pkg-1.0.0-319751.tar \
  --city hzcore \
  --confirm true
```

可选：

- `--includeChart true` / `false`：标记是否同时下载 chart 包。
- `--bastionHost` / `--targetServer` / `--systemUserId` / `--downloadDir` / `--rsyncScript`：运行时覆盖 SSH 配置。
- `--sshUser` / `--sshPass`：运行时覆盖 SSH 凭据（也可以走 `ALPHA_SSH_USER` / `ALPHA_SSH_PASS` 环境变量）。
- `--verbose`：把 SSH 推送进度打印到 stderr（默认静默）。

返回：

- `pkgName` / `city` / `targetPath` / `transferred`
- `stages.login` / `download` / `tar` / `rsync`：各阶段耗时（秒）。
- `totalSeconds`：总耗时。

### `pushPkg`

一键推送包：选版本 → 构建 charts → 构建 images → 上传物料 → SSH 推送到城市。

```bash
alpha pushPkg \
  --versions jwsp-office-automation:3.0.0-319751 \
  --city hzcore \
  --confirm true
```

可选：

- `--arch linux/amd64` / `linux/arm64`：镜像架构，默认 `linux/amd64`。
- `--files <path|url>`：可选，本地物料文件路径或远程 URL，可多次传入。
- `--includeChart true`：同时构建 chart 包。
- `--noPush true`：只生成下载链接，不真正推送。
- `--materialDescription "..."`：可选物料描述。
- `--chartsTimeoutSeconds` / `--imagesTimeoutSeconds`：构建等待超时，默认 600 秒。
- `--pollIntervalSeconds`：轮询间隔，默认 5 秒。
- `--verbose`：把进度打印到 stderr。

返回：

- `pushed` / `targetPath` / `transferred`
- `versions` / `city` / `arch` / `pkgName`
- `imagesTarUrl` / `chartsTarUrl?` / `materialUrls` / `materialNames`
- `downloadLinks`：合并 images + materials + 可选 chart 后的完整下载链接。
- `stages.login` / `download` / `tar` / `rsync`：SSH 阶段耗时。
- `totalSeconds`：SSH 总耗时。

## 已知限制

- `pushPkg` 内部依赖 `job-glab-pkg_charts` / `job-glab-pkg_images` 两个仓库；如果用户环境没有这两个 repo，会 fallback 到固定 ID `494` / `210`。
- `pushPkg` 默认走 master 分支；非 master 分支请改用 `ciBuildParamsBuild` + `opsPush` 自行编排。
- SSH 推送阶段是阻塞的；`--verbose` 才能看到实时进度。
- 推送失败时 `transferred=false`，但前面阶段的 `download` / `tar` 仍可能已经发生；重试前请确认 `targetPath` 是否已有同名文件。

## 写操作提醒

- `opsPush` 和 `pushPkg` 都是高危命令，必须传 `confirm=true` 才会真正执行。
- 不传 `confirm` 或传 `false` 时返回 `preview: true` 的预览对象，标明 `action`、`payload`、`reason: 缺少 --confirm true`。
- 可通过 `ALPHA_DISABLE_WRITE=true` 全局禁用写操作（严格判定：仅 `"true"` 触发）。
