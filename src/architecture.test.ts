import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url));

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);

    if (statSync(fullPath).isDirectory()) {
      return listSourceFiles(fullPath);
    }

    return entry.endsWith('.ts') && !entry.endsWith('.d.ts')
      ? [fullPath]
      : [];
  });
}

function toPosixPath(filePath: string): string {
  return filePath.split(/[\\/]+/).join('/');
}

function relativeToSrc(filePath: string): string {
  const posixPath = toPosixPath(filePath);
  const posixRoot = toPosixPath(SRC_ROOT);

  return posixPath.startsWith(`${posixRoot}/`)
    ? posixPath.slice(posixRoot.length + 1)
    : posixPath;
}

function importedModules(filePath: string): string[] {
  const source = readFileSync(filePath, 'utf8');

  return [
    ...source.matchAll(
      /(?:\bfrom|\bimport)\s*['"]([^'"]+)['"]/g,
    ),
  ].map((match) => match[1] as string);
}

interface Rule {
  readonly label: string;
  readonly matches: (relativePath: string) => boolean;
  readonly violation: (
    relativePath: string,
    imported: string,
  ) => boolean;
}

const rules: readonly Rule[] = [
  {
    label: 'src/world must stay presentation-free',
    matches: (path) => path.startsWith('world/'),
    violation: (_path, imported) =>
      imported === 'pixi.js' ||
      imported.startsWith('@/rendering') ||
      imported.startsWith('../rendering'),
  },
  {
    label: 'src/rendering must not depend on gameplay state',
    matches: (path) => path.startsWith('rendering/'),
    violation: (_path, imported) =>
      imported.startsWith('@/world'),
  },
  {
    label: 'no universal event bus anywhere in src (AGENTS.md)',
    matches: () => true,
    violation: (_path, imported) => imported.includes('event-bus'),
  },
];

describe('architecture boundaries', () => {
  const files = listSourceFiles(SRC_ROOT);

  it('finds the source tree to guard', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const rule of rules) {
    it(rule.label, () => {
      const violations: string[] = [];

      for (const file of files) {
        const relative = relativeToSrc(file);

        if (!rule.matches(relative)) {
          continue;
        }

        for (const imported of importedModules(file)) {
          if (rule.violation(relative, imported)) {
            violations.push(`${posix.join('src', relative)} -> ${imported}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
