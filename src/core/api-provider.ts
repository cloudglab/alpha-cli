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

/**
 * 销毁当前缓存的 AlphaApi 实例（关闭 HTTP Agent、清空缓存）并清空缓存。
 * 适用于配置切换、长进程退出前的资源回收等通用场景。
 */
export function resetApi(): void {
  if (cachedApi) {
    try {
      cachedApi.close();
    } catch {
      // 忽略销毁过程中的错误，避免影响主流程
    }
    cachedApi = null;
  }
}

/**
 * 测试专用别名：语义与 resetApi 一致，保留旧名避免破坏现有测试。
 */
export function resetApiForTests(): void {
  resetApi();
}
