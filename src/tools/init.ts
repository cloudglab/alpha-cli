import { z } from 'zod';
import type { CliRegistry } from '../core/cli-registry.js';
import { loadConfig, maskConfig, saveConfig } from '../core/config.js';
import { jsonResult } from './shared.js';

export function registerInitTools(server: CliRegistry): void {
  server.tool(
    'initAlpha',
    {
      url: z.string().url(),
      token: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      timeoutMs: z.number().int().positive().optional(),
      save: z.boolean().default(false),
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
  );

  server.tool('getAlphaConfig', {}, async () => jsonResult(loadConfig() ? maskConfig(loadConfig()!) : null));
}
