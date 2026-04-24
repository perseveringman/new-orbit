import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listProjectTree, createDirectory } from '../src/main/project_fs';
import { assertInsideVault } from '../src/main/pathGuard';

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'orbit-project-fs-test-'));
}

describe('listProjectTree', () => {
  it('returns root node with all files including non-Markdown', async () => {
    const dir = await tmpDir();
    try {
      await fs.mkdir(path.join(dir, 'src'));
      await fs.writeFile(path.join(dir, 'src', 'index.ts'), '');
      await fs.writeFile(path.join(dir, 'package.json'), '{}');
      await fs.writeFile(path.join(dir, 'README.md'), '# hello');

      const tree = await listProjectTree(dir);

      expect(tree.isDir).toBe(true);
      const topNames = tree.children?.map((n) => n.name) ?? [];
      expect(topNames).toContain('src');
      expect(topNames).toContain('package.json');
      expect(topNames).toContain('README.md');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('excludes .git, node_modules, and .orbit directories', async () => {
    const dir = await tmpDir();
    try {
      await fs.mkdir(path.join(dir, '.git'));
      await fs.mkdir(path.join(dir, 'node_modules'));
      await fs.mkdir(path.join(dir, '.orbit'));
      await fs.mkdir(path.join(dir, 'src'));
      await fs.writeFile(path.join(dir, 'src', 'app.ts'), '');

      const tree = await listProjectTree(dir);

      const topNames = tree.children?.map((n) => n.name) ?? [];
      expect(topNames).not.toContain('.git');
      expect(topNames).not.toContain('node_modules');
      expect(topNames).not.toContain('.orbit');
      expect(topNames).toContain('src');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('lists nested files with correct relPath', async () => {
    const dir = await tmpDir();
    try {
      await fs.mkdir(path.join(dir, 'src'));
      await fs.writeFile(path.join(dir, 'src', 'main.ts'), '');

      const tree = await listProjectTree(dir);

      const srcNode = tree.children?.find((n) => n.name === 'src');
      expect(srcNode).toBeDefined();
      expect(srcNode?.isDir).toBe(true);
      const mainNode = srcNode?.children?.find((n) => n.name === 'main.ts');
      expect(mainNode).toBeDefined();
      expect(mainNode?.relPath).toBe('src/main.ts');
      expect(mainNode?.isDir).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('includes binary files in the tree', async () => {
    const dir = await tmpDir();
    try {
      await fs.writeFile(path.join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      const tree = await listProjectTree(dir);

      const names = tree.children?.map((n) => n.name) ?? [];
      expect(names).toContain('logo.png');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('does not descend into directory symlinks (treats them as leaf nodes)', async () => {
    const dir = await tmpDir();
    const outsideDir = await tmpDir();
    try {
      await fs.writeFile(path.join(outsideDir, 'secret.txt'), 'sensitive');
      const symlinkPath = path.join(dir, 'linked');
      await fs.symlink(outsideDir, symlinkPath);

      const tree = await listProjectTree(dir);

      const names = tree.children?.map((n) => n.name) ?? [];
      // The symlink entry should appear as a non-directory leaf, not be recursed into
      const linkedNode = tree.children?.find((n) => n.name === 'linked');
      expect(linkedNode).toBeDefined();
      expect(linkedNode?.isDir).toBe(false);
      expect(linkedNode?.children).toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('does not include file symlinks as directories', async () => {
    const dir = await tmpDir();
    const outsideDir = await tmpDir();
    try {
      const realFile = path.join(outsideDir, 'real.ts');
      await fs.writeFile(realFile, 'export {}');
      await fs.symlink(realFile, path.join(dir, 'linked.ts'));

      const tree = await listProjectTree(dir);

      const linkedNode = tree.children?.find((n) => n.name === 'linked.ts');
      expect(linkedNode).toBeDefined();
      expect(linkedNode?.isDir).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    }
  });
});

describe('createDirectory', () => {
  it('creates a directory inside the parent', async () => {
    const dir = await tmpDir();
    try {
      await createDirectory(dir, 'components');

      const stat = await fs.stat(path.join(dir, 'components'));
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('is idempotent (recursive mkdir)', async () => {
    const dir = await tmpDir();
    try {
      await createDirectory(dir, 'components');
      await expect(createDirectory(dir, 'components')).resolves.toBeUndefined();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects ".." in name', async () => {
    const dir = await tmpDir();
    try {
      await expect(createDirectory(dir, '..')).rejects.toThrow('invalid directory name');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects forward-slash in name', async () => {
    const dir = await tmpDir();
    try {
      await expect(createDirectory(dir, 'foo/bar')).rejects.toThrow('invalid directory name');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects backslash in name', async () => {
    const dir = await tmpDir();
    try {
      await expect(createDirectory(dir, 'foo\\bar')).rejects.toThrow('invalid directory name');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('assertInsideVault boundary (used by IPC handlers)', () => {
  it('passes for paths inside the vault', async () => {
    const vault = await tmpDir();
    try {
      const inside = path.join(vault, 'projects', 'my-app');
      expect(() => assertInsideVault(vault, inside)).not.toThrow();
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });

  it('throws for paths outside the vault', async () => {
    const vault = await tmpDir();
    const outside = await tmpDir();
    try {
      expect(() => assertInsideVault(vault, outside)).toThrow('path escapes vault');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('throws for path traversal attempts (../../etc)', async () => {
    const vault = await tmpDir();
    try {
      const traversal = path.join(vault, '..', '..', 'etc', 'passwd');
      expect(() => assertInsideVault(vault, traversal)).toThrow('path escapes vault');
    } finally {
      await fs.rm(vault, { recursive: true, force: true });
    }
  });
});
