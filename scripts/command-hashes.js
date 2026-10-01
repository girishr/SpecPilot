#!/usr/bin/env node
// Prints KNOWN_COMMAND_HASHES for src/utils/slashCommandGenerator.ts (BL-058, ARCH-004.38).
// For every release tag that has slashCommandGenerator.ts, and for the working tree, it generates
// every IDE's command files twice into different temp directories and hashes them. Exits 1 if a
// generator's output depends on the directory, or if generate() takes anything but (dir, ide),
// because then a file's bytes would depend on the project and the hash list would not hold.
// Not shipped (package.json "files"). Run from the repo root: node scripts/command-hashes.js
'use strict';
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const ts = require('typescript');

const FILE = 'src/utils/slashCommandGenerator.ts';
const IDES = ['claude-code', 'cursor', 'windsurf', 'antigravity', 'codex', 'vscode'];
const SIGNATURE = 'generate(projectDir: string, ide: string, commands: SlashCommand[] = SLASH_COMMANDS): void {';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

function load(source, label) {
  if (!source.includes(SIGNATURE)) throw new Error(`${label}: generate() signature changed; check its inputs by hand`);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports.SlashCommandGenerator;
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}

function hashes(Generator) {
  const out = {};
  const log = console.log;
  console.log = () => {}; // the Codex manual-copy notice
  try {
    for (const ide of IDES) {
      const dir = mkdtempSync(join(tmpdir(), `command-hashes-${ide}-`));
      try {
        new Generator().generate(dir, ide);
        for (const p of walk(dir)) {
          out[p.slice(dir.length + 1).split('\\').join('/')] = createHash('sha256').update(readFileSync(p)).digest('hex');
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    console.log = log;
  }
  return out;
}

const tags = git('tag', '--list', 'v*', '--sort=v:refname').split('\n').filter(Boolean);
const sources = [];
for (const tag of tags) {
  try {
    sources.push({ label: tag, source: git('show', `${tag}:${FILE}`) });
  } catch {
    // no command files before this generator existed (v2.2.0)
  }
}
sources.push({ label: 'working tree', source: readFileSync(FILE, 'utf-8') });

const known = {};
for (const { label, source } of sources) {
  const Generator = load(source, label);
  const a = hashes(Generator);
  const b = hashes(Generator);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`${label}: command file content depends on the project directory`);
    process.exit(1);
  }
  for (const [path, hash] of Object.entries(a)) {
    known[path] = known[path] || [];
    if (!known[path].includes(hash)) known[path].push(hash);
  }
  console.error(`${label}: ${Object.keys(a).length} files, independent of the project`);
}

const lines = Object.keys(known)
  .sort()
  .map((path) => `  '${path}': [\n${known[path].map((h) => `    '${h}',`).join('\n')}\n  ],`);
console.log(`export const KNOWN_COMMAND_HASHES: Record<string, string[]> = {\n${lines.join('\n')}\n};`);
