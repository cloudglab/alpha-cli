export type Role = 'full' | 'ci' | 'deploy' | 'iter' | 'rbac' | 'file';

export interface AlphaConfig {
  url: string;
  token?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
}

export interface JsonContentResult {
  [key: string]: unknown;
  content: Array<{
    type: 'text';
    text: string;
  }>;
}
