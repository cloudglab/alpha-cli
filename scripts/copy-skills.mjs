import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('.agents/skills/alpha-cli');
const target = path.resolve('skills/alpha-cli');

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
process.stdout.write(`Copied skill from ${source} to ${target}\n`);
