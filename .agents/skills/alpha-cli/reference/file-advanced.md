# 文件与制品高级命令 (file-advanced)

本文档覆盖文件与制品相关的高级 / 写命令。基础查询见 `fileMetadataPage` / `fileMetadataTypes`。

## 命令清单

- `fileMetadataPage`（POST，body）：分页查询文件元数据。
- `fileMetadataTypes`（POST，none）：列出所有文件类型。
- `fileMetadataDownload`（GET，query）：下载文件资源。
- `fileMetadataPreview`（GET，query）：预览文件（通常返回可内嵌 URL）。
- `fileMetadataAdd`（POST，multipart，**写**）：上传新文件。

## 常见使用模式

### 查找并下载

```bash
alpha fileMetadataPage --body '{"page":1,"count":20}'
alpha fileMetadataDownload --query '{"id":1001}'
alpha fileMetadataPreview --query '{"id":1001}'
```

### 上传物料

```bash
alpha fileMetadataAdd --file ./chart.tgz --file ./images.tar --confirm true
```

## 写操作提醒

- `fileMetadataAdd` 是 multipart 上传；上传时除了 `--file` 还可以加 `--body` 携带额外元数据，会被附加为 form 字段。
- 上传后建议用 `deployMaterialAdd` 把 fileId 注册到物料表，再走 `pushPkg` / `deployProjectPush`。
