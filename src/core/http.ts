import { createReadStream } from 'node:fs';
import path from 'node:path';
import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import FormData from 'form-data';
import type { AlphaConfig } from '../types/common.js';
import { sanitizeJsonLikeResponse } from '../utils/json.js';

export interface AlphaRequestOptions {
  body?: unknown;
  query?: Record<string, unknown>;
  files?: string[];
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

export interface AlphaHttpError extends Error {
  code: AlphaHttpErrorCode;
  status?: number;
  response?: string;
  url: string;
  hint?: string;
}

const RESPONSE_PREVIEW_LIMIT = 1000;

export class AlphaHttpClient {
  private readonly client: AxiosInstance;
  private cookieHeader?: string;

  constructor(private readonly config: AlphaConfig) {
    this.client = axios.create({
      baseURL: config.url,
      timeout: config.timeoutMs,
    });
  }

  async request<T = unknown>(method: string, url: string, options: AlphaRequestOptions = {}): Promise<T> {
    await this.ensureLogin(url);
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
      const response = await this.client.request(requestConfig);
      this.captureCookie(response.headers['set-cookie']);
      return sanitizeJsonLikeResponse(response.data) as T;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw buildAlphaHttpError(error, this.config);
      }
      throw error;
    }
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.token) {
      headers.Authorization = `Bearer ${this.config.token}`;
      headers.Token = this.config.token;
    }
    if (this.cookieHeader) headers.Cookie = this.cookieHeader;
    return headers;
  }

  private async ensureLogin(url: string): Promise<void> {
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
      if (axios.isAxiosError(error)) {
        throw buildAlphaLoginError(error, this.config);
      }
      throw error;
    }
  }

  private captureCookie(setCookie: string[] | string | undefined): void {
    if (!setCookie) return;
    const values = Array.isArray(setCookie) ? setCookie : [setCookie];
    this.cookieHeader = values.map((item) => item.split(';')[0]).join('; ');
  }
}

export function buildAlphaHttpError(error: AxiosError, config: AlphaConfig): AlphaHttpError {
  const status = error.response?.status;
  const data = error.response?.data;
  const responseText = describeResponseData(data, error.message);
  const url = `${config.url}${error.config?.url ?? ''}`;

  const classification = classifyError(status, error.code);
  const hint = buildErrorHint(classification, status, config);
  const baseMessage = `请求失败：HTTP ${status ?? 'NO_STATUS'} ${error.message}`;

  const composed = new Error(`${baseMessage}。返回=${responseText}`) as AlphaHttpError;
  composed.code = classification;
  composed.status = status;
  composed.response = responseText;
  composed.url = url;
  composed.hint = hint;

  if (hint) {
    composed.message = `${composed.message}\n提示：${hint}`;
  }

  return composed;
}

function buildAlphaLoginError(error: AxiosError, config: AlphaConfig): AlphaHttpError {
  const status = error.response?.status;
  const responseText = describeResponseData(error.response?.data, error.message);

  if (status === 401 || status === 403) {
    const message = `登录失败：账号或密码错误，HTTP ${status}。`;
    const composed = new Error(message) as AlphaHttpError;
    composed.code = 'invalid-credentials';
    composed.status = status;
    composed.response = responseText;
    composed.url = `${config.url}/alpha/login`;
    composed.hint = `请确认 ALPHA_USERNAME/ALPHA_PASSWORD，或使用 alpha initAlpha --token <token> --save true 配置 token 后重试。`;
    return composed;
  }

  if (status === 404) {
    const composed = new Error(
      `登录失败：/alpha/login 接口不存在，当前地址可能不对。请检查 ALPHA_URL 或 alpha initAlpha 配置。HTTP 404，返回=${responseText}`,
    ) as AlphaHttpError;
    composed.code = 'endpoint-not-found';
    composed.status = status;
    composed.response = responseText;
    composed.url = `${config.url}/alpha/login`;
    return composed;
  }

  if (typeof status === 'number' && status >= 500) {
    const composed = new Error(`登录失败：Alpha 服务端异常，HTTP ${status}，返回=${responseText}`) as AlphaHttpError;
    composed.code = 'server-error';
    composed.status = status;
    composed.response = responseText;
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
      return 'Token 无效或已过期。请运行 alpha initAlpha --token <new-token> --save true 重新配置。';
    case 'forbidden':
      return '当前账号没有访问权限。请确认 ALPHA_USERNAME 角色，或切换 alpha --role full/iter/ci 后重试。';
    case 'endpoint-not-found':
      return `当前 ALPHA_URL=${config.url} 没有该接口。请确认服务版本和路径，或重新运行 alpha initAlpha --url https://host --token <token>。`;
    case 'server-error':
      return `Alpha 服务端 HTTP ${status ?? '?'}。请稍后重试，或检查服务端日志。`;
    case 'network-error':
      return `无法连接 ${config.url}。请检查网络、代理或 ALPHA_URL 配置。`;
    case 'timeout':
      return `请求超时（${config.timeoutMs ?? 30_000}ms）。可使用 alpha initAlpha --timeoutMs <ms> --save true 调高超时。`;
    case 'bad-response':
      return `服务端返回了未预期内容。返回内容前 ${RESPONSE_PREVIEW_LIMIT} 字已附在错误信息中，便于排查。`;
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

export function extractAxiosResponse(error: AxiosError): AxiosResponse | undefined {
  return error.response;
}