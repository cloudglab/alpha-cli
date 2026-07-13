declare module 'ssh2' {
  export interface ShellStream {
    write(data: string): void;
    close(): void;
    stderr: {
      on(event: 'data', listener: (data: Buffer) => void): ShellStream;
    };
    on(event: 'data', listener: (data: Buffer) => void): ShellStream;
    on(event: 'close', listener: () => void): ShellStream;
  }

  export interface ConnectConfig {
    host: string;
    port?: number;
    username: string;
    password: string;
    readyTimeout?: number;
    keepaliveInterval?: number;
    tryKeyboard?: boolean;
    algorithms?: Record<string, string[]>;
  }

  export class Client {
    on(event: 'ready', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'timeout', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    removeListener(event: 'ready' | 'error' | 'timeout' | 'close', listener: (...args: unknown[]) => void): this;
    shell(options: { term: string }, callback: (err: Error | null, stream: ShellStream) => void): void;
    connect(config: ConnectConfig): void;
    end(): void;
  }
}
