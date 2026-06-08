import { AlphaApi } from '../api/index.js';
import { loadConfig } from './config.js';

let cachedApi: AlphaApi | null = null;

export function getApi(): AlphaApi {
  if (cachedApi) return cachedApi;
  const config = loadConfig();
  if (!config) throw new Error('缺少 Alpha 配置。请设置 ALPHA_URL，或运行 alpha initAlpha --url https://host --token xxx');
  cachedApi = new AlphaApi(config);
  return cachedApi;
}

export function resetApiForTests(): void {
  cachedApi = null;
}
