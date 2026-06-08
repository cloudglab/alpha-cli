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
}
