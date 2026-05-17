import { SpecBackfiller } from '../utils/specBackfiller';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(
    os.tmpdir(),
    `specpilot-backfiller-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Create a minimal .specs folder with project/, planning/, and .github/ */
function scaffoldSpecs(
  testDir: string,
  opts: {
    projectYaml?: string;
    copilotMd?: string;
    tasksMd?: string;
  } = {}
): string {
  const specsDir = join(testDir, '.specs');
  mkdirSync(join(specsDir, 'project'), { recursive: true });
  mkdirSync(join(specsDir, 'planning'), { recursive: true });
  mkdirSync(join(testDir, '.github'), { recursive: true });

  if (opts.projectYaml !== undefined) {
    writeFileSync(join(specsDir, 'project', 'project.yaml'), opts.projectYaml, 'utf-8');
  }
  if (opts.copilotMd !== undefined) {
    writeFileSync(join(testDir, '.github', 'copilot-instructions.md'), opts.copilotMd, 'utf-8');
  }
  if (opts.tasksMd !== undefined) {
    writeFileSync(join(specsDir, 'planning', 'tasks.md'), opts.tasksMd, 'utf-8');
  }
  return specsDir;
}

/** Minimal project.yaml with all 8 YAML mandates already present */
const FULL_YAML = `name: "TestProject"
license: MIT
language: typescript
contributors: ["girishr"]
team:
  devPrefix: "girishr"
rules:
  critical:
    - "MANDATE: Never commit code to git unless prompted by the developer. Always ask first."
    - "MANDATE: Never push to git unless prompted by the developer. Always ask first."
    - "MANDATE: Never deploy, publish, or release the project unless prompted by the developer. Always ask first."
    - "MANDATE: Never modify the .specs/ folder structure, subfolder names, or file names. Only update file contents."
    - "MANDATE: After every code change, addition, or removal — proactively update all affected .specs/ files without being asked: architecture.md for structural changes, requirements.md for feature changes, tests.md for test changes, tasks.md for task status, and CHANGELOG.md for completed work."
    - "MANDATE: Never describe, quote, or reference file contents without first reading the file via a tool call in this session. If the file has not been read, say so explicitly before answering."
    - "MANDATE: Never implement, write code, or make file changes unless the developer explicitly asks. If the next step seems obvious, ask first — do not assume."
    - "MANDATE: Spec-First review gate — before touching any code or non-spec files, read all relevant .specs/ files, update all affected spec files first (requirements.md, architecture.md, tasks.md, CHANGELOG.md), present a Spec Report summarizing what changed, which files were affected, and what the specs now say, then wait for the developer's explicit 'yes, proceed' before writing code. If the developer declines, revert the spec changes and stop."
`;

/** Minimal project.yaml with zero mandates */
const BARE_YAML = `name: "TestProject"
license: MIT
language: typescript
contributors: ["girishr"]
team:
  devPrefix: "girishr"
`;

/** Minimal copilot-instructions.md with all 8 MD mandates present */
const FULL_MD = `# AI Coding Instructions

## 🔴 Critical Mandates — Never violate, no exceptions

1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.
2. **NEVER push** to git unless the developer explicitly asks. Always ask first.
3. **NEVER deploy, publish, or release** the project unless the developer explicitly asks. Always ask first.
4. **NEVER modify** the \`.specs/\` folder structure, subfolder names, or file names. Only update file contents.
5. **ALWAYS update** affected \`.specs/\` files after every code change — without being asked:
   - Structural changes → \`architecture/architecture.md\`
   - Feature changes → \`project/requirements.md\`
   - Test changes → \`quality/tests.md\`
   - Task status → \`planning/tasks.md\`
   - Completed work → \`CHANGELOG.md\`
6. **NEVER describe, quote, or reference file contents** without first reading the file via a tool call in this session. If you have not read the file yet, say so explicitly before answering.
7. **NEVER implement, write code, or make file changes** unless the developer explicitly asks. If the next step seems obvious, ask first — do not assume.
8. **SPEC-FIRST review gate**: Before touching any code or non-spec files, read all relevant \`.specs/\` files, update all affected spec files first, present a **Spec Report** summarizing what changed, which files were affected, and what the specs now say, then wait for the developer's explicit \`yes, proceed\` before writing code. If the developer declines, revert the spec changes and stop.
`;

/** tasks.md already containing both the convention line and Multi-Dev Notes */
function makeFullTasksMd(devPrefix: string): string {
  return `# Task Tracking

Task ID conventions

- BL-###: Backlog items
- CS-###: Current Sprint items
- CD-${devPrefix}-###: Completed items (e.g. CD-${devPrefix}-001)
- CD-###: Completed items

Notes

## Multi-Dev Notes

> Always pull before appending to Completed.

## Backlog
`;
}

/** tasks.md with CS-### line but no devPrefix line and no Multi-Dev Notes */
function makeBareTasks(): string {
  return `# Task Tracking

Task ID conventions

- BL-###: Backlog items
- CS-###: Current Sprint items
- CD-###: Completed items

Notes

## Backlog
`;
}

function makeFullSkillMd(): string {
  return `---
name: specpilot-project
description: SpecPilot project context.
---

# SpecPilot Project Context

## Quick Start

## Key Files to Reference

1. **.specs/project/project.yaml** - Project configuration

## Project Rules

## Development Process
`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SpecBackfiller', () => {
  let backfiller: SpecBackfiller;
  let testDir: string;

  beforeEach(() => {
    backfiller = new SpecBackfiller();
    testDir = makeTmpDir();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── Guard: no .specs dir ──────────────────────────────────────────────────

  it('throws when .specs directory does not exist', async () => {
    await expect(backfiller.backfill(testDir, '.specs', false, true)).rejects.toThrow('.specs/');
  });

  // ===========================================================================
  // backfillProjectYaml
  // ===========================================================================

  describe('backfillProjectYaml — project.yaml missing', () => {
    it('returns action=missing when project.yaml absent (dry-run)', async () => {
      scaffoldSpecs(testDir, {
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      // dryRun=true so ensureDevPrefix skips writeDevPrefix (no file to write to)
      const result = await backfiller.backfill(testDir, '.specs', true /* dryRun */, true);
      expect(result.projectYaml.action).toBe('missing');
    });
  });

  describe('backfillProjectYaml — all mandates present', () => {
    it('returns action=skipped when all 8 YAML mandates found', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('skipped');
      expect(result.projectYaml.found).toBe(8);
      expect(result.projectYaml.total).toBe(8);
      expect(result.projectYaml.added).toHaveLength(0);
    });
  });

  describe('backfillProjectYaml — mandates missing', () => {
    it('inserts missing mandates after last MANDATE line (strategy 1)', async () => {
      const yamlWithSomeMandates = `name: "TestProject"
license: MIT
contributors: ["girishr"]
team:
  devPrefix: "girishr"
rules:
  critical:
    - "MANDATE: Never commit code to git unless prompted by the developer. Always ask first."
`;
      scaffoldSpecs(testDir, {
        projectYaml: yamlWithSomeMandates,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('updated');
      expect(result.projectYaml.added.length).toBeGreaterThan(0);
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(written).toContain('Never push to git');
      expect(written).toContain('Spec-First review gate');
    });

    it('inserts under critical: key when no MANDATE lines exist (strategy 2)', async () => {
      const yamlWithCriticalBlock = `name: "TestProject"
license: MIT
contributors: ["girishr"]
team:
  devPrefix: "girishr"
rules:
  critical:
`;
      scaffoldSpecs(testDir, {
        projectYaml: yamlWithCriticalBlock,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('updated');
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(written).toContain('Never commit code to git');
    });

    it('appends complete critical: block when no critical key exists (strategy 3)', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: BARE_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('updated');
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(written).toContain('critical:');
      expect(written).toContain('Never commit code to git');
    });

    it('dry-run: does NOT write project.yaml', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: BARE_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const before = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      const result = await backfiller.backfill(testDir, '.specs', true /* dryRun */, true);
      const after = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(after).toBe(before);
      expect(result.projectYaml.action).toBe('updated');
    });
  });

  // ===========================================================================
  // backfillCopilotInstructions
  // ===========================================================================

  describe('backfillCopilotInstructions — file absent', () => {
    it('creates copilot-instructions.md when missing', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        tasksMd: makeFullTasksMd('girishr'),
        // no copilotMd
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions.action).toBe('created');
      expect(existsSync(join(testDir, '.github', 'copilot-instructions.md'))).toBe(true);
    });
  });

  describe('backfillCopilotInstructions — all mandates present', () => {
    it('returns action=skipped when all 8 MD mandates found', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions.action).toBe('skipped');
      expect(result.copilotInstructions.found).toBe(8);
      expect(result.copilotInstructions.total).toBe(8);
      expect(result.copilotInstructions.added).toHaveLength(0);
    });
  });

  describe('backfillCopilotInstructions — mandates missing', () => {
    it('appends backfill block with missing mandates', async () => {
      const partialMd = `# AI Coding Instructions\n\n1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.\n`;
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: partialMd,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions.action).toBe('updated');
      expect(result.copilotInstructions.added.length).toBeGreaterThan(0);
      const written = readFileSync(join(testDir, '.github', 'copilot-instructions.md'), 'utf-8');
      expect(written).toContain('SpecPilot Mandates (backfilled');
      expect(written).toContain('NEVER push');
      expect(written).toContain('SPEC-FIRST review gate');
    });

    it('dry-run: does NOT write copilot-instructions.md', async () => {
      const partialMd = `# AI Coding Instructions\n\n1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.\n`;
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: partialMd,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const before = readFileSync(join(testDir, '.github', 'copilot-instructions.md'), 'utf-8');
      await backfiller.backfill(testDir, '.specs', true /* dryRun */, true);
      const after = readFileSync(join(testDir, '.github', 'copilot-instructions.md'), 'utf-8');
      expect(after).toBe(before);
    });
  });

  // ===========================================================================
  // backfillTasksMd
  // ===========================================================================

  describe('backfillTasksMd — file absent', () => {
    it('returns action=missing when tasks.md absent', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        // no tasksMd
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.tasksMd.action).toBe('missing');
    });
  });

  describe('backfillTasksMd — already up to date', () => {
    it('returns action=skipped when both convention line and Multi-Dev Notes present', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.tasksMd.action).toBe('skipped');
      expect(result.tasksMd.found).toBe(2);
      expect(result.tasksMd.total).toBe(2);
    });
  });

  describe('backfillTasksMd — convention line and Multi-Dev Notes missing', () => {
    it('inserts CD-{devPrefix}-### convention line after CS-### line', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.tasksMd.action).toBe('updated');
      const written = readFileSync(join(testDir, '.specs', 'planning', 'tasks.md'), 'utf-8');
      expect(written).toContain('CD-girishr-###');
      expect(result.tasksMd.added).toContain('CD-girishr-### convention line');
    });

    it('inserts ## Multi-Dev Notes section before ## Backlog', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.specs', 'planning', 'tasks.md'), 'utf-8');
      expect(written).toContain('## Multi-Dev Notes');
      // Multi-Dev Notes should appear before ## Backlog
      const multiDevIdx = written.indexOf('## Multi-Dev Notes');
      const backlogIdx = written.indexOf('## Backlog');
      expect(multiDevIdx).toBeLessThan(backlogIdx);
    });

    it('Multi-Dev Notes block references the correct devPrefix', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.specs', 'planning', 'tasks.md'), 'utf-8');
      expect(written).toContain('CD-girishr-###');
    });

    it('dry-run: does NOT write tasks.md', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      const before = readFileSync(join(testDir, '.specs', 'planning', 'tasks.md'), 'utf-8');
      await backfiller.backfill(testDir, '.specs', true /* dryRun */, true);
      const after = readFileSync(join(testDir, '.specs', 'planning', 'tasks.md'), 'utf-8');
      expect(after).toBe(before);
    });
  });

  describe('backfillTasksMd — devPrefix missing from project.yaml', () => {
    it('returns action=skipped with reason when devPrefix absent', async () => {
      const yamlNoPrefix = `name: "TestProject"\nlicense: MIT\ncontributors: ["girishr"]\n`;
      scaffoldSpecs(testDir, {
        projectYaml: yamlNoPrefix,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      // noPrompts=true so ensureDevPrefix uses contributors[0] = "girishr"
      // devPrefix WILL be written, so tasks.md will get updated
      // Verify round-trip: devPrefix should be written to project.yaml first
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const writtenYaml = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(writtenYaml).toContain('devPrefix');
      // After devPrefix is written, tasksMd should get updated (not skipped-with-reason)
      expect(result.tasksMd.action).not.toBe('missing');
    });
  });

  // ===========================================================================
  // readContributorsFirst
  // ===========================================================================

  describe('readContributorsFirst (via ensureDevPrefix path)', () => {
    it('reads first entry from inline contributors array', async () => {
      const yaml = `name: "TestProject"\nlicense: MIT\ncontributors: ["alice", "bob"]\n`;
      scaffoldSpecs(testDir, {
        projectYaml: yaml,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      // devPrefix should have been set to "alice" (first contributor)
      expect(written).toContain('devPrefix: "alice"');
    });

    it('reads first entry from block-list contributors', async () => {
      const yaml = `name: "TestProject"\nlicense: MIT\ncontributors:\n  - "carol"\n  - "dave"\n`;
      scaffoldSpecs(testDir, {
        projectYaml: yaml,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(written).toContain('devPrefix: "carol"');
    });
  });

  // ===========================================================================
  // writeDevPrefix
  // ===========================================================================

  describe('writeDevPrefix (via ensureDevPrefix path)', () => {
    it('inserts team: block with devPrefix after license: line', async () => {
      const yaml = `name: "TestProject"\nlicense: MIT\ncontributors: ["girishr"]\n`;
      scaffoldSpecs(testDir, {
        projectYaml: yaml,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(written).toContain('team:');
      expect(written).toContain('devPrefix: "girishr"');
      // team block should follow license
      const licenseIdx = written.indexOf('license:');
      const teamIdx = written.indexOf('team:');
      expect(teamIdx).toBeGreaterThan(licenseIdx);
    });

    it('inserts devPrefix inside existing team: block (no duplicate team: key)', async () => {
      const yaml = `name: "TestProject"\nlicense: MIT\ncontributors: ["girishr"]\nteam:\n  someOtherField: "value"\n`;
      scaffoldSpecs(testDir, {
        projectYaml: yaml,
        copilotMd: FULL_MD,
        tasksMd: makeBareTasks(),
      });
      await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      expect(written).toContain('devPrefix: "girishr"');
      // Should not produce two `team:` keys
      const teamCount = (written.match(/^team:/gm) || []).length;
      expect(teamCount).toBe(1);
    });
  });

  // ===========================================================================
  // BackfillResult shape
  // ===========================================================================

  describe('BackfillResult shape', () => {
    it('result has projectYaml, copilotInstructions, tasksMd, ideFiles fields', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result).toHaveProperty('projectYaml');
      expect(result).toHaveProperty('copilotInstructions');
      expect(result).toHaveProperty('tasksMd');
      expect(result).toHaveProperty('ideFiles');
    });

    it('all-clean project returns skipped for all three targets', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('skipped');
      expect(result.copilotInstructions.action).toBe('skipped');
      expect(result.tasksMd.action).toBe('skipped');
    });
  });

  // ===========================================================================
  // IDE-native AI context file backfill
  // ===========================================================================

  describe('backfillIdeFiles — absent files', () => {
    it('does not create IDE-native files when they are absent', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      expect(result.ideFiles).toHaveLength(0);
      expect(existsSync(join(testDir, '.cursor', 'rules', 'project.mdc'))).toBe(false);
      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurfrules'))).toBe(false);
      expect(existsSync(join(testDir, '.antigravity', 'rules.md'))).toBe(false);
    });
  });

  describe('backfillIdeFiles — mandate-bearing files', () => {
    it('skips Cursor rules when all 8 MD mandates are already present', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'rules', 'project.mdc'), FULL_MD, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.ideFiles).toEqual([
        expect.objectContaining({
          path: '.cursor/rules/project.mdc',
          action: 'skipped',
          found: 8,
          total: 8,
        }),
      ]);
    });

    it('appends missing mandates to Cursor rules', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      writeFileSync(
        join(testDir, '.cursor', 'rules', 'project.mdc'),
        '---\nalwaysApply: true\n---\n\n1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.\n',
        'utf-8'
      );

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.cursor', 'rules', 'project.mdc'), 'utf-8');

      expect(result.ideFiles[0]).toMatchObject({
        path: '.cursor/rules/project.mdc',
        action: 'updated',
      });
      expect(written).toContain('SpecPilot Mandates (backfilled');
      expect(written).toContain('NEVER push');
      expect(written).toContain('SPEC-FIRST review gate');
    });

    it('dry-run does not write Cursor rules', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      const cursorPath = join(testDir, '.cursor', 'rules', 'project.mdc');
      writeFileSync(cursorPath, '# Cursor Rules\n', 'utf-8');
      const before = readFileSync(cursorPath, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', true, true);
      const after = readFileSync(cursorPath, 'utf-8');

      expect(result.ideFiles[0]).toMatchObject({
        path: '.cursor/rules/project.mdc',
        action: 'updated',
      });
      expect(after).toBe(before);
    });

    it('appends missing mandates to CLAUDE.md', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      writeFileSync(join(testDir, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8');

      expect(result.ideFiles).toContainEqual(expect.objectContaining({ path: 'CLAUDE.md', action: 'updated' }));
      expect(written).toContain('NEVER commit');
      expect(written).toContain('SPEC-FIRST review gate');
    });

    it('reports found and total mandate counts for partial CLAUDE.md', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      writeFileSync(
        join(testDir, 'CLAUDE.md'),
        '1. **NEVER commit** code to git unless the developer explicitly asks. Always ask first.\n',
        'utf-8'
      );

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      expect(result.ideFiles[0]).toMatchObject({
        path: 'CLAUDE.md',
        action: 'updated',
        found: 1,
        total: 8,
      });
      expect(result.ideFiles[0].added).toContain('Never push');
    });

    it('dry-run reports CLAUDE.md additions without writing', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const claudePath = join(testDir, 'CLAUDE.md');
      writeFileSync(claudePath, '# CLAUDE.md\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', true, true);
      const written = readFileSync(claudePath, 'utf-8');

      expect(result.ideFiles[0]).toMatchObject({ path: 'CLAUDE.md', action: 'updated' });
      expect(result.ideFiles[0].added).toHaveLength(8);
      expect(written).toBe('# CLAUDE.md\n');
    });

    it('appends missing mandates to Windsurf rules', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      writeFileSync(join(testDir, '.windsurfrules'), '# Windsurf\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.windsurfrules'), 'utf-8');

      expect(result.ideFiles).toContainEqual(
        expect.objectContaining({ path: '.windsurfrules', action: 'updated' })
      );
      expect(written).toContain('NEVER deploy, publish, or release');
    });

    it('appends missing mandates to Antigravity rules', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.antigravity'), { recursive: true });
      writeFileSync(join(testDir, '.antigravity', 'rules.md'), '# Antigravity\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.antigravity', 'rules.md'), 'utf-8');

      expect(result.ideFiles).toContainEqual(
        expect.objectContaining({ path: '.antigravity/rules.md', action: 'updated' })
      );
      expect(written).toContain('NEVER modify');
    });

    it('returns one result per existing IDE-native file', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      mkdirSync(join(testDir, '.antigravity'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'rules', 'project.mdc'), FULL_MD, 'utf-8');
      writeFileSync(join(testDir, 'CLAUDE.md'), FULL_MD, 'utf-8');
      writeFileSync(join(testDir, '.windsurfrules'), FULL_MD, 'utf-8');
      writeFileSync(join(testDir, '.antigravity', 'rules.md'), FULL_MD, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const paths = result.ideFiles.map((r) => r.path);

      expect(paths).toEqual([
        '.cursor/rules/project.mdc',
        'CLAUDE.md',
        '.windsurfrules',
        '.antigravity/rules.md',
      ]);
    });

    it('preserves existing IDE file content before appended mandate block', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const windsurfPath = join(testDir, '.windsurfrules');
      writeFileSync(windsurfPath, '# Team Windsurf Rules\n\nKeep custom guidance.\n', 'utf-8');

      await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(windsurfPath, 'utf-8');

      expect(written.startsWith('# Team Windsurf Rules\n\nKeep custom guidance.')).toBe(true);
      expect(written).toContain('## SpecPilot Mandates (backfilled');
    });
  });

  describe('backfillIdeFiles — Cowork SKILL.md', () => {
    it('does not report SKILL.md when the file is absent', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      writeFileSync(join(testDir, 'CLAUDE.md'), FULL_MD, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      expect(result.ideFiles.map((r) => r.path)).toEqual(['CLAUDE.md']);
    });

    it('skips SKILL.md when structural fingerprints are present', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.claude', 'skills', 'specpilot-project'), { recursive: true });
      writeFileSync(join(testDir, '.claude', 'skills', 'specpilot-project', 'SKILL.md'), makeFullSkillMd(), 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      expect(result.ideFiles).toEqual([
        expect.objectContaining({
          path: '.claude/skills/specpilot-project/SKILL.md',
          action: 'skipped',
        }),
      ]);
    });

    it('reports stale SKILL.md when structural fingerprints are missing', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.claude', 'skills', 'specpilot-project'), { recursive: true });
      const skillPath = join(testDir, '.claude', 'skills', 'specpilot-project', 'SKILL.md');
      writeFileSync(skillPath, '# Old Skill\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(skillPath, 'utf-8');

      expect(result.ideFiles).toEqual([
        expect.objectContaining({
          path: '.claude/skills/specpilot-project/SKILL.md',
          action: 'stale',
        }),
      ]);
      expect(result.ideFiles[0].reason).toContain('re-run `specpilot add-specs`');
      expect(written).toBe('# Old Skill\n');
    });

    it('dry-run leaves stale SKILL.md unchanged', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.claude', 'skills', 'specpilot-project'), { recursive: true });
      const skillPath = join(testDir, '.claude', 'skills', 'specpilot-project', 'SKILL.md');
      writeFileSync(skillPath, '# Old Skill\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', true, true);
      const written = readFileSync(skillPath, 'utf-8');

      expect(result.ideFiles[0].action).toBe('stale');
      expect(written).toBe('# Old Skill\n');
    });
  });
});
