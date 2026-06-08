# alpha-cli

基于 `../zentao-cli` 的 TypeScript CLI 架构，把 `javams-glab-alpha` 中 Spring Controller 暴露的接口转换成命令行入口。

本项目只转换接口调用层，不迁移 Java 项目的业务逻辑。

## 安装依赖

```bash
pnpm install
```

## 配置

临时使用环境变量：

```bash
export ALPHA_URL="https://alpha.example.com"
export ALPHA_TOKEN="your-token"
```

或写入本机配置：

```bash
pnpm dev initAlpha --url https://alpha.example.com --token your-token --save true
```

配置文件位置：`~/.alpha-cli/config.json`。

## 使用

```bash
pnpm dev list
pnpm dev ciBuildList --body '{"page":1,"size":20}'
pnpm dev fileMetadataDownload --query '{"id":1}'
pnpm dev deployMaterialUpload --file ./a.zip --file ./b.zip
```

也可以按模块过滤命令：

```bash
pnpm dev --role ci list
pnpm dev --role deploy list
pnpm dev --role iter list
pnpm dev --role rbac list
pnpm dev --role file list
```

## 架构

- `src/cli.ts`：CLI 入口与参数解析，沿用 `zentao-cli` 的 registry 模式。
- `src/core`：配置、HTTP 客户端、命令注册、角色过滤。
- `src/api`：统一 API 调用出口。
- `src/tools/endpoints.ts`：从 `javams-glab-alpha` Controller 抽取的 132 个 endpoint 清单和命令注册。

## 命令参数

- `--body JSON`：POST JSON 请求体。
- `--query JSON`：GET query 或附加 query 参数。
- `--file path`：multipart 文件上传，可重复传入。

认证头会同时发送 `Authorization: Bearer <token>` 和 `Token: <token>`，以兼容不同后端写法。
