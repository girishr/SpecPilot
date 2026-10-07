#!/usr/bin/env node
// Prints KNOWN_COMMAND_HASHES for src/utils/slashCommandGenerator.ts (BL-058, ARCH-004.38).
// For every release tag and for the working tree, it renders every IDE's command files and hashes
// them. Since BL-032 the content lives in src/core/slashCommands.ts, a pure module whose
// commandFiles(ide) returns { path, content } with no disk; tags before it carry the old
// src/utils/slashCommandGenerator.ts, whose generate(dir, ide) wrote to disk, so those are run twice
// into different temp directories and the run fails if the bytes depend on the directory (BL-084:
// that loader also shims the `./ideConfigGenerator` import BL-073 added). Not shipped (package.json
// "files"). Run from the repo root: node scripts/command-hashes.js
'use strict';
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');
const ts = require('typescript');

const CORE = 'src/core/slashCommands.ts';
const OLD = 'src/utils/slashCommandGenerator.ts';
const IDES = ['claude-code', 'cursor', 'windsurf', 'antigravity', 'codex', 'vscode'];
const OLD_SIGNATURES = [
  'generate(projectDir: string, ide: string, commands: SlashCommand[] = SLASH_COMMANDS): void {',
  'generate(projectDir: string, ide: string, commands: SlashCommand[] = SLASH_COMMANDS): string[] {',
];

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function compile(source, requireFn) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, requireFn);
  return mod.exports;
}

/** The pure module (BL-032 and later): hashes straight from commandFiles(ide). */
function hashesFromCore(source, label) {
  const { commandFiles } = compile(source, () => {
    throw new Error(`${label}: ${CORE} must import nothing`);
  });
  const out = {};
  for (const ide of IDES) for (const f of commandFiles(ide)) out[f.path] = sha(Buffer.from(f.content, 'utf-8'));
  return out;
}

/** The old generator (v2.2.0 to v2.9.0): wrote to disk through generate(dir, ide). */
function hashesFromOld(source, label) {
  if (!OLD_SIGNATURES.some((s) => source.includes(s))) throw new Error(`${label}: generate() signature changed; check its inputs by hand`);
  const shim = (name) => {
    if (name === './ideConfigGenerator') {
      return { writeNew: (path, content) => { writeFileSync(path, content, { flag: 'wx' }); return true; } };
    }
    return require(name);
  };
  const { SlashCommandGenerator } = compile(source, shim);
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const run = () => {
    const out = {};
    const log = console.log;
    console.log = () => {}; // the Codex manual-copy notice of early versions
    try {
      for (const ide of IDES) {
        const dir = mkdtempSync(join(tmpdir(), `command-hashes-${ide}-`));
        try {
          new SlashCommandGenerator().generate(dir, ide);
          for (const p of walk(dir)) out[p.slice(dir.length + 1).split('\\').join('/')] = sha(readFileSync(p));
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
    } finally {
      console.log = log;
    }
    return out;
  };
  const a = run();
  if (JSON.stringify(a) !== JSON.stringify(run())) throw new Error(`${label}: command file content depends on the project directory`);
  return a;
}

function at(tag, file) {
  try {
    return git('show', `${tag}:${file}`);
  } catch {
    return null;
  }
}

const sources = [];
for (const tag of git('tag', '--list', 'v*', '--sort=v:refname').split('\n').filter(Boolean)) {
  const core = at(tag, CORE);
  if (core !== null) sources.push({ label: tag, hashes: () => hashesFromCore(core, tag) });
  else {
    const old = at(tag, OLD);
    if (old !== null) sources.push({ label: tag, hashes: () => hashesFromOld(old, tag) }); // else: before v2.2.0, no command files
  }
}
sources.push({ label: 'working tree', hashes: () => hashesFromCore(readFileSync(CORE, 'utf-8'), 'working tree') });

const known = {};
for (const { label, hashes } of sources) {
  const h = hashes();
  for (const [path, hash] of Object.entries(h)) {
    known[path] = known[path] || [];
    if (!known[path].includes(hash)) known[path].push(hash);
  }
  console.error(`${label}: ${Object.keys(h).length} files`);
}

const lines = Object.keys(known)
  .sort()
  .map((path) => `  '${path}': [\n${known[path].map((h) => `    '${h}',`).join('\n')}\n  ],`);
console.log(`export const KNOWN_COMMAND_HASHES: Record<string, string[]> = {\n${lines.join('\n')}\n};`);
