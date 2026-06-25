import { AlphaHttpClient, type AlphaRequestOptions } from '../core/http.js';
import type { AlphaConfig } from '../types/common.js';

export class AlphaApi {
  readonly http: AlphaHttpClient;

  constructor(config: AlphaConfig) {
    this.http = new AlphaHttpClient(config);
  }

  request(method: string, path: string, options: AlphaRequestOptions = {}): Promise<unknown> {
    return this.http.request(method, path, options);
  }

  /**
   * 销毁底层 HTTP Agent 与缓存，释放 keep-alive 连接。
   * 长生命周期进程不再使用本实例时应调用。
   */
  close(): void {
    this.http.close();
  }
}
