import { z } from 'zod';
import type { CliRegistry } from '../core/cli-registry.js';
import { loadConfig, maskConfig, saveConfig } from '../core/config.js';
import { jsonResult, optionalTrimmedText } from './shared.js';

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
    },
    async (input) => {
      const config = {
        url: input.url,
        token: input.token,
        username: input.username,
        password: input.password,
        timeoutMs: input.timeoutMs ?? 30_000,
      };
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
    },
  );
}
