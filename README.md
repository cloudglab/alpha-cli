# alpha-cli

基于 `../zentao-cli` 的 TypeScript CLI 公共框架，把 `javams-glab-alpha` 中 Spring Controller 暴露的接口转换成命令行入口。

本项目只转换接口调用层，不迁移 Java 项目的业务逻辑；同时保留一套可复用的 CLI 公共骨架，方便后续其他项目继续沿用。

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

配置文件位置：`~/.alpha/config.json`（旧路径 `~/.alpha-cli/config.json` 仍可读，向后兼容）。

## 使用

```bash
pnpm dev list
pnpm dev list --raw
pnpm dev help ciBuildList
pnpm dev install
pnpm dev update
pnpm dev ciBuildList --body '{"page":1,"size":20}'
pnpm dev fileMetadataDownload --query '{"id":1}'
pnpm dev deployMaterialUpload --file ./a.zip --file ./b.zip
pnpm dev --output verbose getAlphaConfig
```

scene 识别入口：

```bash
pnpm dev devopsScene --input https://host/main/devops/integration/build/list/42 手动构建
```

## 安装与更新

```bash
alpha install
alpha update
```

安装或更新成功后会打印 ASCII Banner，并附带快速开始提示；行为对齐 `zentao-cli` 的 install/update 体验。

也可以按模块过滤命令：

```bash
pnpm dev --role ci list
pnpm dev --role deploy list
pnpm dev --role iter list
pnpm dev --role rbac list
pnpm dev --role file list
```

## 架构

- `src/cli.ts`：CLI 入口，沿用 `zentao-cli` 的按需注册、帮助/列表、输出模式解析。
- `src/core/cli-registry.ts`：公共命令注册表、参数解析、命令元信息。
- `src/core/cli-output.ts`：统一帮助、命令列表、命令参数展示。
- `src/core/tool-registry.ts`：按 group 延迟注册命令，保留与 `zentao-cli` 一致的框架边界。
- `src/core/config.ts`：公共配置加载/归一化逻辑，支持环境变量覆盖本地配置。
- `src/core`：HTTP 客户端、命令注册、角色过滤等公共框架层。
- `src/api`：统一 API 调用出口。
- `src/tools/endpoints.ts`：从 `javams-glab-alpha` Controller 抽取的 132 个 endpoint 清单和命令注册。
- `src/tools/shared.ts`：公共输出模式、JSON 结果包装、可复用字段预处理。

## 公共框架导出

`src/index.ts` 已导出当前项目可复用的公共 CLI 能力，例如：

- `runCli`
- `runInstallCommand` / `runUpdateCommand` / `renderBanner`
- `InMemoryCliRegistry` / `parseCommandInput`
- `registerTools`
- `loadConfig` / `saveConfig` / `normalizeConfig`
- `jsonResult` / `setGlobalOutputMode`

## 命令参数

- `--body JSON`：POST JSON 请求体。
- `--query JSON`：GET query 或附加 query 参数。
- `--file path`：multipart 文件上传，可重复传入。
- `--output compact|normal|verbose`：切换输出模式。

认证头会同时发送 `Authorization: Bearer <token>` 和 `Token: <token>`，以兼容不同后端写法。
