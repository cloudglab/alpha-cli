import { chmod } from 'node:fs/promises';
import path from 'node:path';

const binFiles = [
  'alpha.js',
  'alpha-ci.js',
  'alpha-deploy.js',
  'alpha-iter.js',
  'alpha-rbac.js',
  'alpha-file.js',
  'alpha-ops.js',
];

await Promise.all(
  binFiles.map((file) => chmod(path.join('dist', 'bin', file), 0o755)),
);
