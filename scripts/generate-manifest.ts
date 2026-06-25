import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryCliRegistry } from '../src/core/cli-registry.js';
import { registerTools } from '../src/core/tool-registry.js';
import { CLI_VERSION } from '../src/version.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface Manifest {
  version: string;
  commands: string[];
  groups: Record<string, string[]>;
  commandToGroup: Record<string, string>;
}

async function main(): Promise<void> {
  const commandToGroup: Record<string, string> = {};
  const groupCommands: Record<string, string[]> = {};

  const registry = new InMemoryCliRegistry();
  await registerTools(registry, 'full', {
    onGroupRegister: (group, commands) => {
      groupCommands[group] = commands;
      for (const command of commands) {
        commandToGroup[command] = group;
      }
    },
  });

  const allCommands = registry.listCommands().map((command) => command.name);

  const manifest: Manifest = {
    version: CLI_VERSION,
    commands: allCommands,
    groups: groupCommands,
    commandToGroup,
  };

  const generatedTs = [
    '// 由 scripts/generate-manifest.ts 在 build 时自动生成，请勿手动编辑。',
    '',
    `export const commandToGroup: Record<string, string> = ${JSON.stringify(commandToGroup, null, 2)};`,
    '',
    `export const groupCommands: Record<string, string[]> = ${JSON.stringify(groupCommands, null, 2)};`,
    '',
  ].join('\n');

  await mkdir(path.join(ROOT, 'src', 'core'), { recursive: true });
  await writeFile(path.join(ROOT, 'src', 'core', 'command-groups.generated.ts'), generatedTs);

  await mkdir(path.join(ROOT, 'dist'), { recursive: true });
  await writeFile(path.join(ROOT, 'dist', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`Generated manifest: ${allCommands.length} commands in ${Object.keys(groupCommands).length} groups\n`);
}

main().catch((error) => {
  process.stderr.write(`generate-manifest failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
