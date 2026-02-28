import { ProjectDetector } from '../utils/projectDetector';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import * as os from 'os';

describe('ProjectDetector', () => {
  let detector: ProjectDetector;
  let testDir: string;

  beforeEach(() => {
    detector = new ProjectDetector();
    testDir = join(os.tmpdir(), `specpilot-detector-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── No project files ──────────────────────────────────────────────────────

  it('returns null when no known project file exists', async () => {
    const info = await detector.detectProject(testDir);
    expect(info).toBeNull();
  });

  // ─── Node.js detection ────────────────────────────────────────────────────

  describe('Node.js / TypeScript projects', () => {
    it('detects TypeScript from devDependencies', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'my-ts-app',
        version: '2.1.0',
        description: 'A TypeScript app',
        devDependencies: { typescript: '^5.0.0' },
        dependencies: { express: '^4.0.0' },
        author: 'Alice'
      }));

      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.name).toBe('my-ts-app');
      expect(info!.version).toBe('2.1.0');
      expect(info!.language).toBe('typescript');
      expect(info!.framework).toBe('express');
      expect(info!.author).toBe('Alice');
      expect(info!.description).toBe('A TypeScript app');
      expect(info!.dependencies).toContain('express');
    });

    it('detects TypeScript from types/typings field', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'typed-pkg', version: '1.0.0', types: './dist/index.d.ts'
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.language).toBe('typescript');
    });

    it('defaults to javascript when no typescript indicator present', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'plain-js', version: '1.0.0', dependencies: {}
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.language).toBe('javascript');
    });

    it('detects react framework', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'react-app', version: '1.0.0',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' }
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('react');
    });

    it('detects next framework when react is not present', async () => {
      // The detector checks react before next, so projects with both get 'react'.
      // A pure Next.js package (without react listed directly) resolves to 'next'.
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'next-app', version: '1.0.0',
        dependencies: { next: '^13.0.0' }
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('next');
    });

    it('detects express framework', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'api', version: '1.0.0', dependencies: { express: '^4.18.0' }
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('express');
    });

    it('returns undefined framework when no known framework present', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'bare-project', version: '1.0.0', dependencies: { lodash: '^4.0.0' }
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBeUndefined();
    });

    it('handles author as an object', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'obj-author', version: '1.0.0',
        author: { name: 'Bob', email: 'bob@example.com' }
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.author).toBe('Bob');
    });

    it('lists all direct dependencies', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({
        name: 'multi-dep', version: '1.0.0',
        dependencies: { axios: '^1.0.0', lodash: '^4.0.0', express: '^4.0.0' }
      }));
      const info = await detector.detectProject(testDir);
      expect(info!.dependencies).toEqual(expect.arrayContaining(['axios', 'lodash', 'express']));
    });

    it('handles missing name/version gracefully', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ description: 'no name' }));
      const info = await detector.detectProject(testDir);
      expect(info!.name).toBe('unknown-project');
      expect(info!.version).toBe('1.0.0');
    });
  });

  // ─── Python detection ─────────────────────────────────────────────────────

  describe('Python projects', () => {
    it('detects Python from requirements.txt with FastAPI', async () => {
      // requirements.txt dependencies are returned as raw lines (version qualifiers
      // and extras are kept); only comment lines are filtered out.
      writeFileSync(join(testDir, 'requirements.txt'),
        'fastapi>=0.100.0\nuvicorn[standard]\n# a comment\npydantic>=2.0'
      );
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('python');
      expect(info!.framework).toBe('fastapi');
      expect(info!.dependencies.some(d => d.startsWith('fastapi'))).toBe(true);
      expect(info!.dependencies.some(d => d.startsWith('pydantic'))).toBe(true);
      expect(info!.dependencies).not.toContain('# a comment');
    });

    it('detects Python from requirements.txt with Django', async () => {
      writeFileSync(join(testDir, 'requirements.txt'), 'Django>=4.2\npsycopg2-binary');
      const info = await detector.detectProject(testDir);
      expect(info!.language).toBe('python');
      expect(info!.framework).toBe('django');
    });

    it('detects Python from pyproject.toml with metadata', async () => {
      writeFileSync(join(testDir, 'pyproject.toml'), `
[tool.poetry]
name = "my-api"
version = "0.5.0"
description = "A great API"

[tool.poetry.dependencies]
django = "^4.2"
`);
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('python');
      expect(info!.name).toBe('my-api');
      expect(info!.version).toBe('0.5.0');
      expect(info!.framework).toBe('django');
    });

    it('detects Python from setup.py with Flask', async () => {
      writeFileSync(join(testDir, 'setup.py'), `
from setuptools import setup
setup(
  name='my-flask-app',
  version='1.2.0',
  install_requires=['flask', 'sqlalchemy']
)
`);
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('python');
      expect(info!.name).toBe('my-flask-app');
      expect(info!.version).toBe('1.2.0');
      expect(info!.framework).toBe('flask');
    });

    it('returns no framework for generic Python project', async () => {
      writeFileSync(join(testDir, 'requirements.txt'), 'requests\nnumpy\npandas');
      const info = await detector.detectProject(testDir);
      expect(info!.language).toBe('python');
      expect(info!.framework).toBeUndefined();
    });

    it('prefers pyproject.toml over setup.py and requirements.txt', async () => {
      writeFileSync(join(testDir, 'pyproject.toml'), `
[project]
name = "pyproject-name"
version = "3.0.0"
`);
      writeFileSync(join(testDir, 'setup.py'), `setup(name='setup-name', version='1.0.0')`);
      writeFileSync(join(testDir, 'requirements.txt'), 'flask');
      const info = await detector.detectProject(testDir);
      expect(info!.name).toBe('pyproject-name');
    });
  });
});
