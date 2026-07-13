import http from 'node:http';
import https from 'node:https';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import type { AlphaConfig } from '../types/common.js';
import { sanitizeJsonLikeResponse } from '../utils/json.js';
import { recordRequestStarted, recordRequestFinished } from './http-metrics.js';

export interface AlphaRequestOptions {
  body?: unknown;
  query?: Record<string, unknown>;
  files?: string[];
}

export interface AlphaHttpError extends Error {
  code: AlphaHttpErrorCode;
  statusCode?: number;
  responseBody?: unknown;
  url: string;
  hint?: string;
}

export type AlphaHttpErrorCode =
  | 'invalid-credentials'
  | 'unauthorized'
  | 'forbidden'
  | 'endpoint-not-found'
  | 'server-error'
  | 'bad-response'
  | 'network-error'
  | 'timeout'
  | 'unknown';

const RESPONSE_PREVIEW_LIMIT = 1000;
const GET_CACHE_TTL_MS = 15_000;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

export class AlphaHttpClient {
  private readonly client: AxiosInstance;
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;
  private cookieHeader?: string;
  private tokenBlacklist = new Set<string>();
  private static readonly MAX_CACHE_ENTRIES = 50;
  private readonly responseCache = new Map<string, CacheEntry>();

  constructor(private readonly config: AlphaConfig) {
    this.httpAgent = new http.Agent({ keepAlive: true });
    this.httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: !config.insecure });
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeoutMs,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    });
  }

  /**
   * 销毁底层 HTTP Agent，释放 keep-alive 连接。
   * 长生命周期进程（如常驻脚本）应在不再使用时调用，避免连接泄漏。
   */
  close(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    this.responseCache.clear();
  }

  async request<T = unknown>(method: string, url: string, options: AlphaRequestOptions = {}): Promise<T> {
    return this.requestWithRetry<T>(method, url, options, false);
  }

  private async requestWithRetry<T>(
    method: string,
    url: string,
    options: AlphaRequestOptions,
    retried: boolean,
  ): Promise<T> {
    const cacheKey = this.getCacheKey(method, url, options);
    const cached = this.readCache<T>(cacheKey);
    if (cached !== undefined) return cached;

    await this.ensureLogin(url, retried);

    const requestConfig: AxiosRequestConfig = {
      method,
      url,
      params: options.query,
      headers: this.authHeaders(),
    };

    if (options.files?.length) {
      const form = new FormData();
      for (const filePath of options.files) {
        form.append('file', createReadStream(filePath), path.basename(filePath));
      }
      if (options.body && typeof options.body === 'object' && !Array.isArray(options.body)) {
        for (const [key, value] of Object.entries(options.body as Record<string, unknown>)) {
          if (value !== undefined) form.append(key, String(value));
        }
      }
      requestConfig.data = form;
      requestConfig.headers = { ...requestConfig.headers, ...form.getHeaders() };
    } else if (options.body !== undefined) {
      requestConfig.data = options.body;
    }

    try {
      recordRequestStarted();
      const requestStartTime = Date.now();
      const response = await this.client.request(requestConfig);
      recordRequestFinished(Date.now() - requestStartTime);
      this.captureCookie(response.headers['set-cookie']);
      const normalized = sanitizeJsonLikeResponse(response.data) as T;
      this.writeCache(cacheKey, method, normalized);
      return normalized;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (!retried && error.response?.status === 401) {
          // 401 重试前必须清空缓存与登录态，否则重试会命中过期缓存/旧 cookie 而绕过重新鉴权。
          this.invalidateToken();
          this.clearAuthAndCache();
          return this.requestWithRetry<T>(method, url, options, true);
        }
        if (retried && error.response?.status === 401) {
          throw buildAlphaHttpError(error, this.config, {
            hint: 'Token 已过期或凭据无效。请运行 `alpha initAlpha --token <new-token> --save true` 重置后重试。',
          });
        }
        if (!retried && isRetryableNetworkError(error)) {
          return this.requestWithRetry<T>(method, url, options, true);
        }
        throw buildAlphaHttpError(error, this.config);
      }
      const message = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(`请求 ${method} ${url} 发生非 HTTP 异常：${message}`) as AlphaHttpError;
      wrapped.statusCode = undefined;
      wrapped.responseBody = undefined;
      wrapped.url = url;
      wrapped.code = 'unknown';
      throw wrapped;
    }
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.token && !this.tokenBlacklist.has(this.config.token)) {
      headers.Authorization = `Bearer ${this.config.token}`;
      headers.Token = this.config.token;
    }
    if (this.cookieHeader) headers.Cookie = this.cookieHeader;
    return headers;
  }

  private async ensureLogin(url: string, retried = false): Promise<void> {
    if (this.cookieHeader || !this.config.username || !this.config.password || url === '/alpha/login') return;

    try {
      const response = await this.client.request({
        method: 'POST',
        url: '/alpha/login',
        data: {
          username: this.config.username,
          password: this.config.password,
        },
        headers: this.config.token ? { Authorization: `Bearer ${this.config.token}`, Token: this.config.token } : undefined,
      });

      this.captureCookie(response.headers['set-cookie']);
    } catch (error) {
      // 登录失败时清空可能残留的 cookie，避免后续请求带半截失效 cookie 继续失败。
      this.cookieHeader = undefined;
      if (axios.isAxiosError(error)) {
        if (!retried && isRetryableNetworkError(error)) {
          return this.ensureLogin(url, true);
        }
        throw buildAlphaLoginError(error, this.config);
      }
      const message = error instanceof Error ? error.message : String(error);
      const wrapped = new Error(`请求 POST /alpha/login 发生非 HTTP 异常：${message}`) as AlphaHttpError;
      wrapped.statusCode = undefined;
      wrapped.responseBody = undefined;
      wrapped.url = '/alpha/login';
      wrapped.code = 'unknown';
      throw wrapped;
    }
  }

  private captureCookie(setCookie: string[] | string | undefined): void {
    if (!setCookie) return;
    const values = Array.isArray(setCookie) ? setCookie : [setCookie];
    this.cookieHeader = values.map((item) => item.split(';')[0]).join('; ');
  }

  private invalidateToken(): void {
    if (this.config.token) this.tokenBlacklist.add(this.config.token);
  }

  /**
   * 清空登录态（cookie）与 GET 响应缓存。
   * 用于 401 重试路径，确保重试一定走真实网络与重新登录。
   */
  private clearAuthAndCache(): void {
    this.cookieHeader = undefined;
    this.responseCache.clear();
  }

  private getCacheKey(method: string, url: string, options: AlphaRequestOptions): string | undefined {
    if (method.toUpperCase() !== 'GET') return undefined;
    return JSON.stringify({
      method: method.toUpperCase(),
      url,
      params: options.query ?? null,
      data: null,
    });
  }

  private readCache<T>(key: string | undefined): T | undefined {
    if (!key) return undefined;
    const cached = this.responseCache.get(key);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.responseCache.delete(key);
      return undefined;
    }
    return attachCacheMeta(cached.value) as T;
  }

  private writeCache(key: string | undefined, method: string, value: unknown): void {
    if (!key || method.toUpperCase() !== 'GET') return;
    if (this.responseCache.size >= AlphaHttpClient.MAX_CACHE_ENTRIES) {
      const firstKey = this.responseCache.keys().next().value;
      if (firstKey) this.responseCache.delete(firstKey);
    }
    this.responseCache.set(key, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value });
  }
}
export function buildAlphaHttpError(
  error: AxiosError,
  config: AlphaConfig,
  override?: { hint?: string },
): AlphaHttpError {
  const status = error.response?.status;
  const data = error.response?.data;
  const url = `${config.url}${error.config?.url ?? ''}`;

  const classification = classifyError(status, error.code);
  // 错误消息只保留 status + 简短分类，responseBody 放在 error 对象上供程序消费，
  // 避免把可能含敏感信息的响应体拼进 message 默认打印出来。
  const baseMessage = `请求失败：HTTP ${status ?? 'NO_STATUS'} ${error.message}（${classification}）`;

  const composed = new Error(baseMessage) as AlphaHttpError;
  composed.name = 'AlphaHttpError';
  composed.code = classification;
  composed.statusCode = status;
  composed.responseBody = data;
  composed.url = url;

  const hint = override?.hint ?? buildErrorHint(classification, status, config);
  composed.hint = hint;

  if (hint) {
    composed.message = `${composed.message}\n提示：${hint}`;
  }

  return composed;
}

function buildAlphaLoginError(error: AxiosError, config: AlphaConfig): AlphaHttpError {
  const status = error.response?.status;

  if (status === 401 || status === 403) {
    const message = `登录失败：账号或密码错误，HTTP ${status}。`;
    const composed = new Error(message) as AlphaHttpError;
    composed.name = 'AlphaHttpError';
    composed.code = 'invalid-credentials';
    composed.statusCode = status;
    composed.responseBody = error.response?.data;
    composed.url = `${config.url}/alpha/login`;
    composed.hint = `请确认 ALPHA_USERNAME/ALPHA_PASSWORD，或使用 alpha initAlpha --token <token> --save true 配置 token 后重试。`;
    return composed;
  }

  if (status === 404) {
    const composed = new Error(
      '登录失败：/alpha/login 接口不存在，当前地址可能不对。请检查 ALPHA_URL 或 alpha initAlpha 配置。HTTP 404。',
    ) as AlphaHttpError;
    composed.name = 'AlphaHttpError';
    composed.code = 'endpoint-not-found';
    composed.statusCode = status;
    composed.responseBody = error.response?.data;
    composed.url = `${config.url}/alpha/login`;
    return composed;
  }

  if (typeof status === 'number' && status >= 500) {
    const composed = new Error(`登录失败：Alpha 服务端异常，HTTP ${status}。`) as AlphaHttpError;
    composed.name = 'AlphaHttpError';
    composed.code = 'server-error';
    composed.statusCode = status;
    composed.responseBody = error.response?.data;
    composed.url = `${config.url}/alpha/login`;
    return composed;
  }

  return buildAlphaHttpError(error, config);
}

function classifyError(status: number | undefined, axiosCode: string | undefined): AlphaHttpErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'endpoint-not-found';
  if (typeof status === 'number' && status >= 500) return 'server-error';
  if (status === undefined) {
    if (axiosCode === 'ECONNABORTED') return 'timeout';
    if (axiosCode === 'ERR_NETWORK' || axiosCode === 'ECONNREFUSED' || axiosCode === 'ENOTFOUND') return 'network-error';
  }
  if (typeof status === 'number' && status >= 400) return 'bad-response';
  return 'unknown';
}

function buildErrorHint(code: AlphaHttpErrorCode, status: number | undefined, config: AlphaConfig): string | undefined {
  switch (code) {
    case 'unauthorized':
      return 'Token 无效或已过期。HTTP 层会自动清空当前 token 并重试一次；如重试仍失败，请运行 alpha initAlpha --token <new-token> --save true 重新配置。';
    case 'forbidden':
      return '当前账号没有访问权限。请确认 ALPHA_USERNAME 角色，或切换 alpha --role full/iter/ci 后重试。';
    case 'endpoint-not-found':
      return `当前 ALPHA_URL=${config.url} 没有该接口。请确认服务版本和路径，或重新运行 alpha initAlpha --url https://host --token <token>。`;
    case 'server-error':
      return `Alpha 服务端 HTTP ${status ?? '?'}。请稍后重试，或检查服务端日志。`;
    case 'network-error':
      return `无法连接 ${config.url}。HTTP 层会针对 ECONNRESET/ETIMEDOUT/EAI_AGAIN 自动重试一次；如再次失败，请检查网络、代理或 ALPHA_URL 配置。`;
    case 'timeout':
      return `请求超时（${config.timeoutMs ?? 30_000}ms）。HTTP 层会针对 ECONNABORTED 自动重试一次；如再次失败，可使用 alpha initAlpha --timeoutMs <ms> --save true 调高超时。`;
    case 'bad-response':
      return `服务端返回了未预期内容。响应体已挂在 error.responseBody 上，可用 --output verbose 查看。`;
    default:
      return undefined;
  }
}

export function describeResponseData(data: unknown, fallback: string): string {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed)).slice(0, RESPONSE_PREVIEW_LIMIT);
      } catch {
        return trimmed.slice(0, RESPONSE_PREVIEW_LIMIT);
      }
    }
    return data.slice(0, RESPONSE_PREVIEW_LIMIT);
  }

  if (data === undefined || data === null) return fallback;
  try {
    return JSON.stringify(data).slice(0, RESPONSE_PREVIEW_LIMIT);
  } catch {
    return String(data).slice(0, RESPONSE_PREVIEW_LIMIT);
  }
}

/**
 * 给缓存命中的响应附加 meta.cacheHit 标记。
 * 返回浅拷贝，不修改缓存里存储的原始对象，避免污染只读语义。
 * 对象响应会把 cacheHit 放进 meta；数组响应无法原地加 meta，保持原样（不标记 cacheHit），
 * 由调用方在 withToolMeta 层统一处理。
 */
export function attachCacheMeta(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const existingMeta = isPlainObject(record.meta) ? record.meta : {};
  return {
    ...record,
    meta: { ...existingMeta, cacheHit: true },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetryableNetworkError(error: { code?: string; message?: string }): boolean {
  if (['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED', 'ERR_NETWORK', 'EPIPE'].includes(error.code ?? '')) {
    return true;
  }
  const message = error.message ?? '';
  return /timeout|socket hang up|network|econnreset/i.test(message);
}
