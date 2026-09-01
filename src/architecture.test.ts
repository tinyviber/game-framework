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

function resolveSourceImport(
  relativePath: string,
  imported: string,
): string {
  if (imported.startsWith('@/')) {
    return imported.slice(2);
  }

  if (imported.startsWith('.')) {
    return posix.normalize(
      posix.join(posix.dirname(relativePath), imported),
    );
  }

  return imported;
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
    label: 'src/world must stay semantic and presentation-free',
    matches: (path) => path.startsWith('world/'),
    violation: (path, imported) => {
      const target = resolveSourceImport(path, imported);
      return (
        imported === 'pixi.js' ||
        target.startsWith('assets/') ||
        target.startsWith('rendering/') ||
        target.startsWith('gameplay/')
      );
    },
  },
  {
    label: 'src/gameplay must stay presentation-free',
    matches: (path) => path.startsWith('gameplay/'),
    violation: (path, imported) => {
      const target = resolveSourceImport(path, imported);
      return (
        imported === 'pixi.js' ||
        target.startsWith('rendering/')
      );
    },
  },
  {
    label: 'src/content must stay semantic and presentation-free',
    matches: (path) => path.startsWith('content/'),
    violation: (path, imported) => {
      const target = resolveSourceImport(path, imported);
      return (
        imported === 'pixi.js' ||
        target.startsWith('assets/') ||
        target.startsWith('rendering/') ||
        target.startsWith('gameplay/')
      );
    },
  },
  {
    label: 'src/rendering must not depend on world or gameplay state',
    matches: (path) => path.startsWith('rendering/'),
    violation: (path, imported) => {
      const target = resolveSourceImport(path, imported);
      return (
        target.startsWith('world/') ||
        target.startsWith('gameplay/')
      );
    },
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
