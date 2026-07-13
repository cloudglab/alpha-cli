import { z } from 'zod';
import type { CliRegistry } from '../core/cli-registry.js';
import { loadConfig, maskConfig, normalizeConfig, saveConfig } from '../core/config.js';
import { jsonResult, optionalTrimmedText } from './shared.js';

function ensureValidUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    // 仅做 URL 合法性校验，不发起网络请求，避免引入网络依赖。
    new URL(withProtocol);
  } catch {
    throw new Error(`url 不是合法地址: ${rawUrl}。请传入形如 https://alpha.example.com 的地址。`);
  }
  return trimmed;
}

export function registerInitTools(server: CliRegistry): void {
  server.tool(
    'initAlpha',
    {
      url: z.string().trim().min(1).describe('Alpha 服务地址，支持省略 https://'),
      token: optionalTrimmedText.describe('Bearer Token，可选。'),
      username: optionalTrimmedText.describe('用户名，可选。'),
      password: optionalTrimmedText.describe('密码，可选。'),
      timeoutMs: z.number().int().positive().optional().describe('请求超时时间，单位毫秒。'),
      save: z.boolean().default(false).describe('是否写入本机配置文件。'),
      insecure: z.boolean().optional().default(false).describe('是否跳过 TLS 证书校验（内网自签证书）。'),
    },
    async (input) => {
      // save=true 时至少校验 url 合法性再落盘，避免把畸形地址写进 config.json。
      const url = input.save ? ensureValidUrl(input.url) : input.url;
      const config = normalizeConfig({
        url,
        token: input.token,
        username: input.username,
        password: input.password,
        timeoutMs: input.timeoutMs ?? 30_000,
        insecure: input.insecure,
      });
      if (input.save) saveConfig(config);
      return jsonResult({ ok: true, saved: input.save, config: maskConfig(config) });
    },
    {
      group: 'init',
      description: '初始化 Alpha CLI 连接配置。',
      examples: [
        'alpha initAlpha --url https://alpha.example.com --token your-token --save true',
        'alpha initAlpha --url alpha.example.com --username your-name --password your-password --save true',
      ],
      costHint: 'low',
      nextBestTools: ['getAlphaConfig'],
      recommendations: [
        {
          tool: 'getAlphaConfig',
          reason: '查看当前生效配置并确认脱敏结果',
          priority: 1,
        },
        {
          tool: 'healthHealthPing',
          reason: '继续检查 Alpha 服务连通性',
          priority: 0,
        },
      ],
    },
  );

  server.tool(
    'getAlphaConfig',
    {},
    async () => {
      const config = loadConfig();
      return jsonResult(config ? maskConfig(config) : null);
    },
    {
      group: 'init',
      description: '查看当前 Alpha CLI 配置。',
      examples: ['alpha getAlphaConfig', 'alpha --output verbose getAlphaConfig'],
      costHint: 'low',
      recommendations: [
        {
          tool: 'healthHealthPing',
          reason: '确认当前配置对应的 Alpha 服务可连通',
          priority: 1,
        },
        {
          tool: 'userinfo',
          reason: '确认当前 token 或登录态对应的用户信息',
          priority: 0,
        },
      ],
    },
  );
}
