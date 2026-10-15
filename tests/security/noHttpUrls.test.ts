import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Security: Verificación estricta de protocolos no seguros (HTTP)', () => {
  const allowedExtensions = ['.ts', '.js', '.json', '.env', '.example', 'Caddyfile'];
  const excludedDirs = ['node_modules', 'dist', '.git', 'coverage', '.agents'];

  async function getFilesRecursively(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (excludedDirs.includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await getFilesRecursively(fullPath);
        files.push(...subFiles);
      } else if (allowedExtensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }

    return files;
  }

  it('no debe existir ninguna URL que comience por "http://" en el código fuente de src/ ni en infra/', async () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const infraDir = path.resolve(process.cwd(), 'infra');
    const filesToScan = [
      ...(await getFilesRecursively(srcDir)),
      ...(await getFilesRecursively(infraDir))
    ];

    const violations: { file: string; line: number; content: string }[] = [];

    // Expresión regular que detecta http:// pero ignora schemas xml o namespaces estándares si los hubiera
    const httpRegex = /http:\/\/(?!www\.w3\.org)/i;

    for (const file of filesToScan) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (httpRegex.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: index + 1,
            content: line.trim()
          });
        }
      });
    }

    if (violations.length > 0) {
      const errorMsg = violations
        .map((v) => `❌ ${v.file}:${v.line} -> "${v.content}"`)
        .join('\n');
      expect.fail(`Se encontraron URLs inseguras con http:// en el código:\n${errorMsg}`);
    }

    expect(violations).toHaveLength(0);
  });
});
