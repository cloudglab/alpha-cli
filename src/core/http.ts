import { createReadStream } from 'node:fs';
import path from 'node:path';
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import type { AlphaConfig } from '../types/common.js';
import { sanitizeJsonLikeResponse } from '../utils/json.js';

export interface AlphaRequestOptions {
  body?: unknown;
  query?: Record<string, unknown>;
  files?: string[];
}

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
        const data = error.response?.data;
        const message = typeof data === 'string' ? data.slice(0, 1000) : JSON.stringify(data ?? error.message);
        throw new Error(`请求失败: ${error.response?.status ?? 'NO_STATUS'} - ${message}`);
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
  }

  private captureCookie(setCookie: string[] | string | undefined): void {
    if (!setCookie) return;
    const values = Array.isArray(setCookie) ? setCookie : [setCookie];
    this.cookieHeader = values.map((item) => item.split(';')[0]).join('; ');
  }
}
