#!/usr/bin/env node
import { runCli } from '../cli.js';

await runCli(['--role', 'ops', ...process.argv.slice(2)]).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
