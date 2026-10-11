import { ProjectDetector } from '../utils/projectDetector';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'fs';
import * as childProcess from 'child_process';

// BL-095: detection must start no process; every way to start one is a mock here (Node's own exports cannot be spied on).
jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn(), spawnSync: jest.fn(), exec: jest.fn(), execSync: jest.fn(), execFile: jest.fn(), execFileSync: jest.fn(), fork: jest.fn() }));
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

  // ─── Kotlin detection ─────────────────────────────────────────────────────

  describe('Kotlin projects', () => {
    it('detects Kotlin from build.gradle.kts', async () => {
      writeFileSync(join(testDir, 'build.gradle.kts'), `
plugins { kotlin("jvm") version "1.9.0" }
version = "2.0.0"
`);
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('kotlin');
      expect(info!.version).toBe('2.0.0');
    });

    it('detects Kotlin from build.gradle (Groovy)', async () => {
      writeFileSync(join(testDir, 'build.gradle'), `
apply plugin: 'kotlin'
version = '1.3.0'
`);
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('kotlin');
    });

    it('reads project name from settings.gradle.kts', async () => {
      writeFileSync(join(testDir, 'settings.gradle.kts'), `rootProject.name = "my-kotlin-app"`);
      writeFileSync(join(testDir, 'build.gradle.kts'), `plugins { kotlin("jvm") }`);
      const info = await detector.detectProject(testDir);
      expect(info!.name).toBe('my-kotlin-app');
    });

    it('detects Spring Boot framework', async () => {
      writeFileSync(join(testDir, 'build.gradle.kts'), `
plugins { id("org.springframework.boot") version "3.0.0" }
dependencies { implementation("org.springframework.boot:spring-boot-starter-web") }
`);
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('spring');
    });

    it('detects Ktor framework', async () => {
      writeFileSync(join(testDir, 'build.gradle.kts'), `
dependencies { implementation("io.ktor:ktor-server-core:2.3.0") }
`);
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('ktor');
    });

    it('detects Android framework', async () => {
      writeFileSync(join(testDir, 'build.gradle'), `
apply plugin: 'com.android.application'
android { compileSdkVersion 33 }
`);
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('android');
    });

    it('detects Compose framework', async () => {
      writeFileSync(join(testDir, 'build.gradle.kts'), `
dependencies { implementation("androidx.compose.ui:ui:1.5.0") }
`);
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('compose');
    });

    it('returns undefined framework for generic Kotlin project', async () => {
      writeFileSync(join(testDir, 'build.gradle.kts'), `plugins { kotlin("jvm") }`);
      const info = await detector.detectProject(testDir);
      expect(info!.language).toBe('kotlin');
      expect(info!.framework).toBeUndefined();
    });
  });

  // ─── Swift detection ──────────────────────────────────────────────────────

  describe('Swift projects', () => {
    it('detects Swift from Package.swift', async () => {
      writeFileSync(join(testDir, 'Package.swift'), `
// swift-tools-version: 5.8
import PackageDescription
let package = Package(name: "my-swift-app", dependencies: [])
`);
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('swift');
      expect(info!.name).toBe('my-swift-app');
    });

    it('detects Vapor framework from Package.swift', async () => {
      writeFileSync(join(testDir, 'Package.swift'), `
import PackageDescription
let package = Package(name: "vapor-api", dependencies: [
  .package(url: "https://github.com/vapor/vapor.git", .upToNextMajor(from: "4.0.0"))
])
`);
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('vapor');
    });

    it('detects SwiftUI from Package.swift', async () => {
      writeFileSync(join(testDir, 'Package.swift'), `
import PackageDescription
let package = Package(name: "swiftui-app", targets: [
  .target(name: "MyApp", dependencies: ["swiftui"])
])
`);
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('swiftui');
    });

    it('defaults to ios framework for plain Swift Package.swift', async () => {
      writeFileSync(join(testDir, 'Package.swift'), `
import PackageDescription
let package = Package(name: "bare-swift")
`);
      const info = await detector.detectProject(testDir);
      expect(info!.framework).toBe('ios');
    });

    it('detects Swift from .xcodeproj directory entry', async () => {
      mkdirSync(join(testDir, 'MyApp.xcodeproj'), { recursive: true });
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('swift');
      expect(info!.name).toBe('MyApp');
    });

    it('detects Swift from .xcworkspace directory entry', async () => {
      mkdirSync(join(testDir, 'WorkspaceApp.xcworkspace'), { recursive: true });
      const info = await detector.detectProject(testDir);
      expect(info).not.toBeNull();
      expect(info!.language).toBe('swift');
      expect(info!.name).toBe('WorkspaceApp');
    });
  });

  // ─── Platform from direct evidence (BL-PM-016, REQ-002.H.35) ───────────────

  describe('platform from direct evidence (BL-PM-016)', () => {
    const node = async (deps: Record<string, string>, dev: Record<string, string> = {}) => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'app', dependencies: deps, devDependencies: dev }));
      return detector.detectProject(testDir);
    };

    it.each([
      [{ 'react-native': '0.74.0', react: '18.0.0' }, {}, 'rn'],
      [{ expo: '51.0.0', react: '18.0.0' }, {}, 'rn'],
      [{ expo: '51.0.0' }, {}, 'rn'],
      [{ next: '14.0.0', react: '18.0.0' }, {}, 'nextjs'],
      [{ react: '18.0.0' }, { vite: '5.0.0' }, 'react'],
      [{ react: '18.0.0', 'react-scripts': '5.0.0' }, {}, 'react'],
      [{ vue: '3.0.0' }, { vite: '5.0.0' }, 'vue'],
    ])('%j with dev %j → %s', async (deps, dev, platform) => {
      expect((await node(deps, dev))!.platform).toBe(platform);
    });

    it('react alone, vite alone and express show no platform, and language and framework are as before', async () => {
      const react = (await node({ react: '18.0.0' }, { typescript: '5.0.0' }))!;
      expect(react.platform).toBeUndefined();
      expect([react.language, react.framework]).toEqual(['typescript', 'react']);
      expect((await node({}, { vite: '5.0.0' }))!.platform).toBeUndefined();
      expect((await node({ express: '4.0.0' }))!.platform).toBeUndefined();
      const next = (await node({ next: '14.0.0', react: '18.0.0' }))!;
      expect(next.framework).toBe('react'); // unchanged: the CLI still reads react first
    });

    it.each(['Demo.xcodeproj', 'Demo.xcworkspace'])('an %s gives ios, with language and framework as before', async entry => {
      mkdirSync(join(testDir, entry));
      const info = (await detector.detectProject(testDir))!;
      expect([info.language, info.framework, info.platform, info.name]).toEqual(['swift', 'ios', 'ios', 'Demo']);
    });

    it('an Xcode project beside a Package.swift gives ios too; a bare Swift package gives nothing', async () => {
      writeFileSync(join(testDir, 'Package.swift'), 'let package = Package(name: "Kit")');
      const bare = (await detector.detectProject(testDir))!;
      expect([bare.language, bare.framework, bare.platform]).toEqual(['swift', 'ios', undefined]);
      mkdirSync(join(testDir, 'Kit.xcodeproj'));
      const both = (await detector.detectProject(testDir))!;
      expect([both.name, both.platform]).toEqual(['Kit', 'ios']);
    });
  });

  // ─── More detection (BL-095, REQ-002.H.39) ────────────────────────────────

  describe('package manager, test framework, repository URL and license (BL-095)', () => {
    const pkg = (o: Record<string, unknown> = {}) => writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: 'app', ...o }));
    const gitConfig = (text: string) => {
      mkdirSync(join(testDir, '.git'), { recursive: true });
      writeFileSync(join(testDir, '.git', 'config'), text);
    };
    const origin = (url: string) => gitConfig(`[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://example.com/other/up.git\n[remote "origin"]\n\tpushurl = https://example.com/push/x.git\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
    const more = async () => {
      const info = await detector.detectProject(testDir);
      return info && { packageManager: info.packageManager, testFramework: info.testFramework, repository: info.repository, license: info.license };
    };

    it.each([
      [['pnpm-lock.yaml', 'yarn.lock', 'package-lock.json'], 'pnpm'],
      [['yarn.lock', 'package-lock.json'], 'yarn'],
      [['bun.lock'], 'bun'],
      [['bun.lockb', 'package-lock.json'], 'bun'],
      [['package-lock.json'], 'npm'],
    ])('a Node project with %j uses %s', async (locks, expected) => {
      pkg();
      for (const f of locks) writeFileSync(join(testDir, f), '');
      expect((await more())!.packageManager).toBe(expected);
    });

    it.each([
      [['uv.lock', 'poetry.lock'], 'uv'],
      [['poetry.lock', 'Pipfile.lock'], 'poetry'],
      [['Pipfile.lock'], 'pipenv'],
    ])('a Python project with %j uses %s', async (locks, expected) => {
      writeFileSync(join(testDir, 'requirements.txt'), 'flask\n');
      for (const f of locks) writeFileSync(join(testDir, f), '');
      expect((await more())!.packageManager).toBe(expected);
    });

    it('a lock file of another language says nothing', async () => {
      writeFileSync(join(testDir, 'requirements.txt'), 'flask\n');
      writeFileSync(join(testDir, 'yarn.lock'), '');
      expect(await more()).toEqual({});
    });

    it.each([
      [{ devDependencies: { jest: '1', vitest: '1' } }, 'vitest'],
      [{ devDependencies: { mocha: '1', jest: '1' } }, 'jest'],
      [{ dependencies: { mocha: '1' } }, 'mocha'],
      [{ devDependencies: { '@playwright/test': '1', cypress: '1' } }, 'playwright'],
      [{ devDependencies: { cypress: '1' } }, 'cypress'],
    ])('a Node project with %j tests with %s', async (deps, expected) => {
      pkg(deps);
      expect((await more())!.testFramework).toBe(expected);
    });

    it.each([
      ['pytest>=7\nflask\n', 'pytest'],
      ['flask\npytest\n', 'pytest'],
      ['pytest-cov\nflask\n', undefined],
      ['flask\n', undefined],
    ])('requirements.txt %j gives %s', async (text, expected) => {
      writeFileSync(join(testDir, 'requirements.txt'), text);
      expect((await more())!.testFramework).toBe(expected);
    });

    it('a Gradle build with junit gives junit; a Swift package gives no test framework (BL-100)', async () => {
      writeFileSync(join(testDir, 'build.gradle.kts'), 'dependencies { testImplementation("org.junit.jupiter:junit-jupiter:5.10.0") }\n');
      expect((await more())!.testFramework).toBe('junit');
      rmSync(join(testDir, 'build.gradle.kts'));
      writeFileSync(join(testDir, 'Package.swift'), 'let package = Package(name: "Kit", targets: [.target(name: "Kit"), .testTarget(name: "KitTests")])\n');
      expect((await more())!.testFramework).toBeUndefined();
    });

    it.each(['https://github.com/acme/app.git', 'git@github.com:acme/app.git', 'ssh://git@github.com/acme/app.git'])('keeps the origin url %s, the first url of [remote "origin"] only', async url => {
      pkg();
      origin(url);
      expect((await more())!.repository).toBe(url);
    });

    it.each(['https://user:tok@github.com/acme/app.git', 'https://tok@github.com/acme/app.git', 'ssh://user:pw@github.com/acme/app.git', '"https://github.com/acme/app.git"', 'http://github.com/acme/app.git'])('drops the origin url %s, never stripping it', async url => {
      pkg();
      origin(url);
      expect((await more())!.repository).toBeUndefined();
    });

    it('needs an origin remote and a real .git folder', async () => {
      pkg();
      gitConfig('[remote "upstream"]\n\turl = https://github.com/acme/app.git\n');
      expect((await more())!.repository).toBeUndefined();
      rmSync(join(testDir, '.git'), { recursive: true });
      writeFileSync(join(testDir, '.git'), 'gitdir: /elsewhere/.git/worktrees/app\n'); // a worktree: not followed
      expect((await more())!.repository).toBeUndefined();
    });

    it('reads .git/config and LICENSE only as regular files of at most 64 KB', async () => {
      pkg();
      const outside = join(testDir, 'outside');
      mkdirSync(outside);
      writeFileSync(join(outside, 'config'), '[remote "origin"]\n\turl = https://github.com/acme/app.git\n');
      writeFileSync(join(outside, 'LICENSE'), 'MIT License\n');
      mkdirSync(join(testDir, '.git'));
      symlinkSync(join(outside, 'config'), join(testDir, '.git', 'config'));
      symlinkSync(join(outside, 'LICENSE'), join(testDir, 'LICENSE'));
      expect(await more()).toEqual({});
      rmSync(join(testDir, '.git', 'config'));
      rmSync(join(testDir, 'LICENSE'));
      writeFileSync(join(testDir, '.git', 'config'), '[remote "origin"]\n\turl = https://github.com/acme/app.git\n' + '#'.repeat(64 * 1024));
      writeFileSync(join(testDir, 'LICENSE'), 'MIT License\n' + 'x'.repeat(64 * 1024));
      expect(await more()).toEqual({});
    });

    it.each([
      ['MIT License\n\nCopyright (c) 2026', 'MIT'],
      ['﻿\n  Apache License  \n  Version 2.0', 'Apache-2.0'],
      ['GNU GENERAL PUBLIC LICENSE\nVersion 3', 'GPL'],
      ['GNU LESSER GENERAL PUBLIC LICENSE\n', undefined],
      ['GNU AFFERO GENERAL PUBLIC LICENSE\n', undefined],
      ['ISC License\n', 'ISC'],
      ['BSD 3-Clause License\n', 'BSD'],
      ['The MIT License (MIT)\n', undefined],
    ])('a LICENSE starting %j gives %s', async (text, expected) => {
      writeFileSync(join(testDir, 'requirements.txt'), 'flask\n');
      writeFileSync(join(testDir, 'LICENSE'), text);
      expect((await more())!.license).toBe(expected);
    });

    it("package.json's license wins and is kept verbatim when it fits the shape", async () => {
      writeFileSync(join(testDir, 'LICENSE'), 'MIT License\n');
      pkg({ license: '(MIT OR Apache-2.0)' });
      expect((await more())!.license).toBe('(MIT OR Apache-2.0)');
      pkg({ license: 'SEE LICENSE IN LICENSE.txt' });
      expect((await more())!.license).toBe('SEE LICENSE IN LICENSE.txt');
      pkg({ license: 'MIT; rm -rf /' });
      expect((await more())!.license).toBeUndefined();
      pkg({ license: { type: 'MIT' } });
      expect((await more())!.license).toBe('MIT'); // not a string: the LICENSE file is read instead
    });

    it('detects nothing in a folder with no language, and starts no process', async () => {
      origin('https://github.com/acme/app.git');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT License\n');
      expect(await detector.detectProject(testDir)).toBeNull();
      pkg({ devDependencies: { vitest: '1' } });
      writeFileSync(join(testDir, 'pnpm-lock.yaml'), '');
      expect(await more()).toEqual({ packageManager: 'pnpm', testFramework: 'vitest', repository: 'https://github.com/acme/app.git', license: 'MIT' });
      for (const fn of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const) expect(childProcess[fn]).not.toHaveBeenCalled();
    });
  });
});
