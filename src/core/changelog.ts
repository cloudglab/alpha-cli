import { readFile } from 'node:fs/promises';

export interface ChangelogSection {
  version: string;
  date: string;
  content: string;
}

export interface ChangelogOptions {
  limit: number | 'all';
  raw?: boolean;
  version?: string;
  since?: string;
}

const VERSION_HEADING_REGEX = /^##\s+\[?(\d+\.\d+\.\d+(?:-[\w.]+)?)\]?\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/;

export async function loadChangelogRaw(): Promise<string> {
  const changelogUrl = new URL('../../CHANGELOG.md', import.meta.url);
  try {
    return await readFile(changelogUrl, 'utf8');
  } catch {
    throw new Error('未找到 CHANGELOG.md');
  }
}

export async function loadChangelogSections(): Promise<ChangelogSection[]> {
  const text = await loadChangelogRaw();
  const sections: ChangelogSection[] = [];
  const lines = text.split('\n');
  let current: { version: string; date: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(VERSION_HEADING_REGEX);
    if (match) {
      if (current) {
        sections.push({
          version: current.version,
          date: current.date,
          content: current.lines.join('\n').trimEnd(),
        });
      }
      current = { version: match[1], date: match[2], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push({
      version: current.version,
      date: current.date,
      content: current.lines.join('\n').trimEnd(),
    });
  }

  return sections;
}

export async function renderChangelog(options: ChangelogOptions = { limit: 5, raw: false }): Promise<string> {
  if (options.raw) {
    return loadChangelogRaw();
  }

  const sections = await loadChangelogSections();
  let filtered = sections;
  if (options.version) {
    filtered = sections.filter((section) => section.version === options.version);
  } else if (options.since) {
    filtered = sections.filter((section) => section.date >= (options.since as string));
  }

  const limit = options.limit === 'all' ? filtered.length : Math.max(0, options.limit);
  const limited = filtered.slice(0, limit);

  if (limited.length === 0) {
    return '未找到匹配的 changelog 段落。';
  }

  const blocks = limited.map((section) => section.content);
  return blocks.join('\n\n');
}
