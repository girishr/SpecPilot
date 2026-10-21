import { SpecBackfiller, withTasksLine } from '../utils/specBackfiller';
import { backfillCommand } from '../commands/backfill';
import { fillReleasedSkill, KNOWN_SKILL_TEMPLATES } from '../core/agentConfig';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, symlinkSync } from 'fs';
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
  process:
    - "MANDATE: Track ALL AI interactions — update .specs/development/prompts.md with every AI prompt, including timestamps and context."
`;

/** Minimal project.yaml with zero mandates */
const BARE_YAML = `name: "TestProject"
license: MIT
language: typescript
contributors: ["girishr"]
team:
  devPrefix: "girishr"
`;

/** Minimal copilot-instructions.md with all 8 MD mandates + 2 code sections present */
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

## 🟡 Process Mandates

- **Tasks:** When the SpecPilot MCP tools are connected, use them to add and move tasks. Otherwise edit \`.specs/planning/tasks.md\` directly and keep its table format.

## Code Philosophy — Write Only What Needed

1. Need exist? No → skip. Say why.
2. Already in codebase? → reuse. Not rewrite.
3. Stdlib do it? → use it.
4. Native or installed dep cover it? → use. No new deps.
5. One line do it? → write that.
6. Only then: minimum code that work.
7. Never cut: validation, error handling, security, explicit requirement.

## Code Rules

1. No abstraction, interface, factory, or pattern unless asked.
2. No scaffold "for later". Later scaffold itself.
3. Delete before add.
4. Shortest correct diff win.
5. Fix cause, not symptom. One guard in shared function beat guard in every caller.
6. Boring over clever. Clever = 3am bug.
7. Read before write. Never reference code you haven't read.
`;

/**
 * Minimal IDE-native file (CLAUDE.md / Cursor / Windsurf / Antigravity) with all
 * 8 terse mandates + 2 code sections present — matches buildCriticalMandatesMarkdown().
 */
const FULL_MD_TERSE = `# CLAUDE.md

## 🔴 Critical Mandates — Never violate, no exceptions

1. No commit unless asked.
2. No push unless asked.
3. No deploy/publish/release unless asked.
4. No \`.specs/\` structure changes — content only.
5. Update specs after change:
   - Trivial → \`planning/tasks.md\`
   - Feature → \`project/requirements.md\` + \`planning/tasks.md\`
   - Architectural → all affected files + \`CHANGELOG.md\`
6. Never reference file contents without reading first. If unread, say so.
7. Never write code or change files unless asked. Ask first.
8. Spec-first gate (scale to task size):
   - Trivial → no gate
   - Feature → read 1–2 relevant \`.specs/\` files before coding
   - Architectural → update all affected specs, present Spec Report, wait for \`yes, proceed\`

## 🟡 Process Mandates

- **Tasks:** When the SpecPilot MCP tools are connected, use them to add and move tasks. Otherwise edit \`.specs/planning/tasks.md\` directly and keep its table format.

## Code Philosophy — Write Only What Needed

1. Need exist? No → skip. Say why.
2. Already in codebase? → reuse. Not rewrite.
3. Stdlib do it? → use it.
4. Native or installed dep cover it? → use. No new deps.
5. One line do it? → write that.
6. Only then: minimum code that work.
7. Never cut: validation, error handling, security, explicit requirement.

## Code Rules

1. No abstraction, interface, factory, or pattern unless asked.
2. No scaffold "for later". Later scaffold itself.
3. Delete before add.
4. Shortest correct diff win.
5. Fix cause, not symptom. One guard in shared function beat guard in every caller.
6. Boring over clever. Clever = 3am bug.
7. Read before write. Never reference code you haven't read.
`;

/** tasks.md with the handle-form convention line older backfills wrote, and their Multi-Dev Notes */
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

/** tasks.md with a CS-### line but no devPrefix convention line */
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
    it('returns action=skipped when all 9 YAML mandates found', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('skipped');
      expect(result.projectYaml.found).toBe(9);
      expect(result.projectYaml.total).toBe(9);
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

    it('leaves a project.yaml without rules: unchanged, as generated since 2.0.0 (BL-066)', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: BARE_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml).toMatchObject({ action: 'skipped', added: [] });
      expect(result.projectYaml.reason).toContain('no `rules:` section');
      expect(readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8')).toBe(BARE_YAML);
    });

    it('adds missing process mandate under existing rules.critical without touching it', async () => {
      const yamlWithCriticalOnly = `name: "TestProject"
license: MIT
contributors: ["girishr"]
team:
  devPrefix: "girishr"
rules:
  critical:
    - "MANDATE: Never commit code to git unless prompted by the developer. Always ask first."
`;
      scaffoldSpecs(testDir, {
        projectYaml: yamlWithCriticalOnly,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('updated');
      const written = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');

      const yaml = require('js-yaml');
      const parsed = yaml.load(written) as any;
      expect(Array.isArray(parsed.rules.process)).toBe(true);
      expect(parsed.rules.process.some((r: string) => r.includes('Track ALL AI interactions'))).toBe(true);
    });

    it('dry-run: does NOT write project.yaml', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: BARE_YAML + 'rules:\n  critical:\n',
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
    it('returns action=skipped when all 8 mandates + 2 code sections found', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions.action).toBe('skipped');
      expect(result.copilotInstructions.found).toBe(11);
      expect(result.copilotInstructions.total).toBe(11);
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
  // BL-066: check each file in the wording SpecPilot generates for it
  // ===========================================================================

  describe('project.yaml rules key (same test as validate, BL-066)', () => {
    const yamlFile = () => join(testDir, '.specs', 'project', 'project.yaml');

    it.each([
      ['a null rules:', BARE_YAML + 'rules:\n'],
      ['rules: []', BARE_YAML + 'rules: []\n'],
    ])('counts %s as present: dry run reports all 9 and writes nothing', async (_what, text) => {
      scaffoldSpecs(testDir, { projectYaml: text, copilotMd: FULL_MD, tasksMd: makeFullTasksMd('girishr') });
      const result = await backfiller.backfill(testDir, '.specs', true, true);
      expect(result.projectYaml.action).toBe('updated');
      expect(result.projectYaml.added).toHaveLength(9);
      expect(readFileSync(yamlFile(), 'utf-8')).toBe(text);
    });

    it.each([
      ['a commented # rules:', BARE_YAML + '# rules:\n#   critical: []\n'],
      ['a nested rules:', BARE_YAML + 'build:\n  rules:\n    - lint\n'],
    ])('does not count %s: left unchanged', async (_what, text) => {
      scaffoldSpecs(testDir, { projectYaml: text, copilotMd: FULL_MD, tasksMd: makeFullTasksMd('girishr') });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml.action).toBe('skipped');
      expect(readFileSync(yamlFile(), 'utf-8')).toBe(text);
    });

    it('leaves a project.yaml that does not parse unchanged', async () => {
      const text = 'name: x\nteam:\n  devPrefix: "girishr"\nrules: [\n';
      scaffoldSpecs(testDir, { projectYaml: text, copilotMd: FULL_MD, tasksMd: makeFullTasksMd('girishr') });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.projectYaml).toMatchObject({ action: 'skipped', reason: 'could not parse project.yaml, left unchanged' });
      expect(readFileSync(yamlFile(), 'utf-8')).toBe(text);
    });
  });

  describe('copilot-instructions.md in the wording it already uses (BL-066)', () => {
    const mdFile = () => join(testDir, '.github', 'copilot-instructions.md');

    it('reports a file written by init today as up to date', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { IdeConfigGenerator } = require('../utils/ideConfigGenerator');
      scaffoldSpecs(testDir, { projectYaml: BARE_YAML, tasksMd: makeFullTasksMd('girishr') });
      await new IdeConfigGenerator().generateCopilotInstructions(testDir, { projectName: 'x', language: 'typescript' });
      const before = readFileSync(mdFile(), 'utf-8');
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions).toMatchObject({ action: 'skipped', found: 11, total: 11 });
      expect(readFileSync(mdFile(), 'utf-8')).toBe(before);
    });

    it('adds a missing mandate to a terse file in terse wording', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { IdeConfigGenerator } = require('../utils/ideConfigGenerator');
      scaffoldSpecs(testDir, { projectYaml: BARE_YAML, tasksMd: makeFullTasksMd('girishr') });
      await new IdeConfigGenerator().generateCopilotInstructions(testDir, { projectName: 'x', language: 'typescript' });
      writeFileSync(mdFile(), readFileSync(mdFile(), 'utf-8').replace('2. No push unless asked.\n', ''));
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions.added).toEqual(['Never push']);
      const written = readFileSync(mdFile(), 'utf-8');
      expect(written).toContain('## 🔴 Critical Mandates — Never violate, no exceptions\n\n2. No push unless asked.\n');
      expect(written).not.toContain('NEVER');
    });

    it('adds the terse block to a file with neither wording', async () => {
      scaffoldSpecs(testDir, { projectYaml: BARE_YAML, copilotMd: '# My instructions\n', tasksMd: makeFullTasksMd('girishr') });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions.added).toHaveLength(11);
      const written = readFileSync(mdFile(), 'utf-8');
      expect(written).toContain('1. No commit unless asked.');
      expect(written).not.toContain('NEVER');
    });
  });

  describe('a project fresh from init (BL-066)', () => {
    it('has nothing to add to project.yaml or copilot-instructions.md, and validates without the rules error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SpecGenerator } = require('../utils/specGenerator');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SpecValidator } = require('../utils/specValidator');
      jest.spyOn(console, 'log').mockImplementation(() => undefined);
      await new SpecGenerator().generateSpecs({ projectName: 'demo', language: 'typescript', targetDir: testDir, specsName: '.specs', ide: 'vscode', author: 'girishr', noPrompts: true });
      const yamlBefore = readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8');
      const result = await backfiller.backfill(testDir, '.specs', true, true);
      expect(result.projectYaml.action).toBe('skipped');
      expect(result.copilotInstructions.action).toBe('skipped');
      expect(result.tasksMd).toMatchObject({ action: 'skipped', found: 1, total: 1 }); // BL-069
      expect(readFileSync(join(testDir, '.specs', 'project', 'project.yaml'), 'utf-8')).toBe(yamlBefore);
      const v = await new SpecValidator().validate(testDir, { fix: false, verbose: false });
      expect(v.errors.filter((e: string) => e.includes('prompt tracking'))).toEqual([]);
      expect(v.warnings.filter((w: string) => w.includes('rules section'))).toEqual([]);
      jest.restoreAllMocks();
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

  describe('backfillTasksMd — convention line present (BL-069)', () => {
    const tasksFile = () => join(testDir, '.specs', 'planning', 'tasks.md');

    it.each([
      ['the handle form older backfills wrote (kept with its Multi-Dev Notes)', makeFullTasksMd('girishr')],
      ['the template form init writes', makeBareTasks().replace('- CD-###: Completed items', '- CD-{devPrefix}-###: Completed items (e.g. CD-girishr-001)')],
    ])('is up to date with %s and left byte-identical', async (_what, text) => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, copilotMd: FULL_MD, tasksMd: text });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.tasksMd).toMatchObject({ action: 'skipped', found: 1, total: 1, added: [] });
      expect(readFileSync(tasksFile(), 'utf-8')).toBe(text);
    });

    it('says "All 1 item already present" in the output', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, copilotMd: FULL_MD, tasksMd: makeFullTasksMd('girishr') });
      const out: string[] = [];
      jest.spyOn(console, 'log').mockImplementation((m?: unknown) => void out.push(String(m)));
      try {
        await backfillCommand({ dir: testDir, specsName: '.specs', noPrompts: true });
      } finally {
        jest.restoreAllMocks();
      }
      expect(out.join('\n')).toContain('All 1 item already present');
      expect(out.join('\n')).toContain('All 11 items already present');
    });
  });

  describe('backfillTasksMd — convention line missing', () => {
    const tasksFile = () => join(testDir, '.specs', 'planning', 'tasks.md');

    it("inserts the template's convention line after the CS-### line", async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, copilotMd: FULL_MD, tasksMd: makeBareTasks() });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.tasksMd).toMatchObject({ action: 'updated', found: 0, total: 1, added: ['CD-girishr-### convention line'] });
      expect(readFileSync(tasksFile(), 'utf-8')).toContain(
        '- CS-###: Current Sprint items\n- CD-{devPrefix}-###: Completed items (e.g. CD-girishr-001)\n',
      );
    });

    it('skips with a reason, never "already present", when there is no line to insert after', async () => {
      const text = '# Tasks\n\n## Completed\n';
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, copilotMd: FULL_MD, tasksMd: text });
      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.tasksMd).toMatchObject({ action: 'skipped', found: 0, total: 1, added: [] });
      expect(result.tasksMd.reason).toContain('add it by hand');
      expect(readFileSync(tasksFile(), 'utf-8')).toBe(text);
    });

    it.each([
      ['with a ## Backlog', makeBareTasks()],
      ['without a ## Backlog', ['# Task Tracking', '', '- CS-###: Current Sprint items', '', '## Completed', '', '1. [CD-girishr-001] did a thing'].join('\n')],
    ])('never adds ## Multi-Dev Notes (%s), which left the template in 2.0.0', async (_what, text) => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, copilotMd: FULL_MD, tasksMd: text });
      await backfiller.backfill(testDir, '.specs', false, true);
      expect(readFileSync(tasksFile(), 'utf-8')).not.toContain('Multi-Dev Notes');
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
      expect(existsSync(join(testDir, '.cursor', 'rules', 'specpilot.mdc'))).toBe(false);
      expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(false);
      expect(existsSync(join(testDir, '.windsurfrules'))).toBe(false);
      expect(existsSync(join(testDir, '.antigravity', 'rules.md'))).toBe(false);
    });
  });

  describe('backfillIdeFiles — mandate-bearing files', () => {
    it('skips Cursor rules when all 8 mandates + 2 code sections are already present', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'rules', 'specpilot.mdc'), FULL_MD_TERSE, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      expect(result.ideFiles).toEqual([
        expect.objectContaining({
          path: '.cursor/rules/specpilot.mdc',
          action: 'skipped',
          found: 11,
          total: 11,
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
        join(testDir, '.cursor', 'rules', 'specpilot.mdc'),
        '---\nalwaysApply: true\n---\n\n1. No commit unless asked.\n',
        'utf-8'
      );

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(join(testDir, '.cursor', 'rules', 'specpilot.mdc'), 'utf-8');

      expect(result.ideFiles[0]).toMatchObject({
        path: '.cursor/rules/specpilot.mdc',
        action: 'updated',
      });
      expect(written).toContain('Critical Mandates');
      expect(written).toContain('No push unless asked');
      expect(written).toContain('Spec-first gate');
    });

    it('dry-run does not write Cursor rules', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      const cursorPath = join(testDir, '.cursor', 'rules', 'specpilot.mdc');
      writeFileSync(cursorPath, '# Cursor Rules\n', 'utf-8');
      const before = readFileSync(cursorPath, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', true, true);
      const after = readFileSync(cursorPath, 'utf-8');

      expect(result.ideFiles[0]).toMatchObject({
        path: '.cursor/rules/specpilot.mdc',
        action: 'updated',
      });
      expect(after).toBe(before);
    });

    it('emits migration warning when project.mdc exists but specpilot.mdc does not', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'rules', 'project.mdc'), FULL_MD, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const warnResult = result.ideFiles.find((r) => r.path === '.cursor/rules/project.mdc');

      expect(warnResult).toMatchObject({ action: 'warn' });
      expect(warnResult?.reason).toContain('specpilot.mdc');
    });

    it('does not emit migration warning when specpilot.mdc already exists', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'rules', 'project.mdc'), FULL_MD, 'utf-8');
      writeFileSync(join(testDir, '.cursor', 'rules', 'specpilot.mdc'), FULL_MD, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const warnResult = result.ideFiles.find((r) => r.action === 'warn');

      expect(warnResult).toBeUndefined();
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
      expect(written).toContain('No commit unless asked');
      expect(written).toContain('Spec-first gate');
    });

    it('reports found and total mandate counts for partial CLAUDE.md', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      writeFileSync(
        join(testDir, 'CLAUDE.md'),
        '1. No commit unless asked.\n',
        'utf-8'
      );

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      expect(result.ideFiles[0]).toMatchObject({
        path: 'CLAUDE.md',
        action: 'updated',
        found: 1,
        total: 11,
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
      expect(result.ideFiles[0].added).toHaveLength(11);
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
      expect(written).toContain('No deploy/publish/release unless asked');
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
      expect(written).toContain('No `.specs/` structure changes');
    });

    it('returns one result per existing IDE-native file', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      mkdirSync(join(testDir, '.cursor', 'rules'), { recursive: true });
      mkdirSync(join(testDir, '.antigravity'), { recursive: true });
      writeFileSync(join(testDir, '.cursor', 'rules', 'specpilot.mdc'), FULL_MD_TERSE, 'utf-8');
      writeFileSync(join(testDir, 'CLAUDE.md'), FULL_MD_TERSE, 'utf-8');
      writeFileSync(join(testDir, '.windsurfrules'), FULL_MD_TERSE, 'utf-8');
      writeFileSync(join(testDir, '.antigravity', 'rules.md'), FULL_MD_TERSE, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const paths = result.ideFiles.map((r) => r.path);

      expect(paths).toEqual([
        '.cursor/rules/specpilot.mdc',
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
      expect(written).toContain('## 🔴 Critical Mandates — Never violate, no exceptions');
    });

    it('appends Code Philosophy and Code Rules sections when missing', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      const windsurfPath = join(testDir, '.windsurfrules');
      // File has all 8 mandates but no Code Philosophy/Code Rules
      writeFileSync(windsurfPath,
        '## 🔴 Critical Mandates — Never violate, no exceptions\n\n' +
        '1. No commit unless asked.\n' +
        '2. No push unless asked.\n' +
        '3. No deploy/publish/release unless asked.\n' +
        '4. No `.specs/` structure changes — content only.\n' +
        '5. Update specs after change:\n' +
        '6. Never reference file contents without reading first. If unread, say so.\n' +
        '7. Never write code or change files unless asked. Ask first.\n' +
        '8. Spec-first gate (scale to task size):\n',
        'utf-8'
      );

      const result = await backfiller.backfill(testDir, '.specs', false, true);
      const written = readFileSync(windsurfPath, 'utf-8');

      expect(result.ideFiles).toContainEqual(
        expect.objectContaining({ path: '.windsurfrules', action: 'updated', found: 8, total: 11 })
      );
      expect(written).toContain('## Code Philosophy — Write Only What Needed');
      expect(written).toContain('## Code Rules');
      expect(written).toContain('Need exist? No → skip');
      expect(written).toContain('Boring over clever');
    });

    it('skips when all 8 mandates + 2 code sections present in IDE file', async () => {
      scaffoldSpecs(testDir, {
        projectYaml: FULL_YAML,
        copilotMd: FULL_MD,
        tasksMd: makeFullTasksMd('girishr'),
      });
      writeFileSync(join(testDir, '.windsurfrules'), FULL_MD_TERSE, 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      expect(result.ideFiles).toContainEqual(
        expect.objectContaining({ path: '.windsurfrules', action: 'skipped', found: 11, total: 11 })
      );
    });
  });

  describe('the Claude Code skill (BL-PM-012)', () => {
    const SKILL = '.claude/skills/specpilot-project/SKILL.md';
    const skillFile = () => join(testDir, ...SKILL.split('/'));
    const setup = (claude = true) => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, copilotMd: FULL_MD, tasksMd: makeFullTasksMd('girishr') });
      if (claude) writeFileSync(join(testDir, 'CLAUDE.md'), FULL_MD_TERSE, 'utf-8');
    };
    const putSkill = (text: string) => {
      mkdirSync(join(testDir, '.claude', 'skills', 'specpilot-project'), { recursive: true });
      writeFileSync(skillFile(), text);
    };

    it('writes no skill without CLAUDE.md', async () => {
      setup(false);
      expect((await backfiller.backfill(testDir, '.specs', false, true)).skill).toBeNull();
      expect(existsSync(join(testDir, '.claude'))).toBe(false);
    });

    it('adds a missing skill rendered from project.yaml, and then finds it current', async () => {
      setup();
      expect((await backfiller.backfill(testDir, '.specs', false, true)).skill).toEqual({ path: SKILL, action: 'added' });
      expect(readFileSync(skillFile(), 'utf-8')).toContain('Project: TestProject\nLanguage: typescript\nLicense: MIT\n');
      expect((await backfiller.backfill(testDir, '.specs', false, true)).skill).toEqual({ path: SKILL, action: 'current' });
    });

    it('replaces a released render, only listing it with --dry-run', async () => {
      setup();
      const released = fillReleasedSkill(KNOWN_SKILL_TEMPLATES[0], { projectName: 'TestProject', language: 'typescript' });
      putSkill(released);
      expect((await backfiller.backfill(testDir, '.specs', true, true)).skill).toEqual({ path: SKILL, action: 'updated' });
      expect(readFileSync(skillFile(), 'utf-8')).toBe(released);
      expect((await backfiller.backfill(testDir, '.specs', false, true)).skill).toEqual({ path: SKILL, action: 'updated' });
      expect(readFileSync(skillFile(), 'utf-8')).toContain('License: MIT');
    });

    it('keeps an edited skill and says why, in the result and the output', async () => {
      setup();
      putSkill('# My own skill\n');
      const out: string[] = [];
      jest.spyOn(console, 'log').mockImplementation((m?: unknown) => void out.push(String(m)));
      try {
        await backfillCommand({ dir: testDir, specsName: '.specs', noPrompts: true });
      } finally {
        jest.restoreAllMocks();
      }
      expect(readFileSync(skillFile(), 'utf-8')).toBe('# My own skill\n');
      const text = out.join('\n');
      expect(text).toContain("Kept as it was (does not match SpecPilot's render of project.yaml)");
      expect(text).toContain('1 kept.');
      expect(text).not.toMatch(/stale/i);
    });

    it("reads project.yaml from the --specs-name folder", async () => {
      writeFileSync(join(testDir, 'CLAUDE.md'), FULL_MD_TERSE, 'utf-8');
      mkdirSync(join(testDir, 'specs', 'project'), { recursive: true });
      mkdirSync(join(testDir, 'specs', 'planning'), { recursive: true });
      writeFileSync(join(testDir, 'specs', 'project', 'project.yaml'), 'name: "Other"\nlanguage: python\n');
      expect((await backfiller.backfill(testDir, 'specs', false, true)).skill).toEqual({ path: SKILL, action: 'added' });
      expect(readFileSync(skillFile(), 'utf-8')).toContain('Project: Other\nLanguage: python\n');
    });
  });

  // ===========================================================================
  // Slash command backfill (CS-088)
  // ===========================================================================

  describe('backfillSlashCommands', () => {
    it('returns an empty array when no IDE signal files exist', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });

      const result = await backfiller.backfill(testDir, '.specs', true, true);

      expect(result.slashCommands).toEqual([]);
    });

    it('detects the CLAUDE.md signal and reports missing commands without writing in dry-run', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
      writeFileSync(join(testDir, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', true, true);

      expect(result.slashCommands).toContainEqual(
        expect.objectContaining({ ide: 'claude-code', signalFile: 'CLAUDE.md' })
      );
      const claudeResult = result.slashCommands.find((r) => r.ide === 'claude-code')!;
      expect(claudeResult.added).toEqual(expect.arrayContaining(['status', 'backfill']));
      expect(existsSync(join(testDir, '.claude', 'commands'))).toBe(false);
    });

    it('writes the missing command files for real when not a dry run', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
      writeFileSync(join(testDir, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      const claudeResult = result.slashCommands.find((r) => r.ide === 'claude-code')!;
      expect(claudeResult.added.length).toBeGreaterThan(0);
      for (const name of claudeResult.added) {
        expect(existsSync(join(testDir, '.claude', 'commands', `specpilot-${name}.md`))).toBe(true);
      }
    });

    it('keeps an edited command file and reports it as modified', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
      writeFileSync(join(testDir, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf-8');
      mkdirSync(join(testDir, '.claude', 'commands'), { recursive: true });
      writeFileSync(join(testDir, '.claude', 'commands', 'specpilot-status.md'), 'custom content', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', false, true);

      const claudeResult = result.slashCommands.find((r) => r.ide === 'claude-code')!;
      expect(claudeResult.added).not.toContain('status');
      expect(claudeResult.kept).toEqual([
        { name: 'status', path: '.claude/commands/specpilot-status.md', reason: 'modified' },
      ]);
      expect(readFileSync(join(testDir, '.claude', 'commands', 'specpilot-status.md'), 'utf-8')).toBe(
        'custom content'
      );
    });

    it('detects multiple IDE signals independently', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
      writeFileSync(join(testDir, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf-8');
      writeFileSync(join(testDir, '.windsurfrules'), '# Windsurf\n', 'utf-8');

      const result = await backfiller.backfill(testDir, '.specs', true, true);

      expect(result.slashCommands.map((r) => r.ide).sort()).toEqual(['claude-code', 'windsurf']);
    });

    it('refreshes the in-repo Codex copies when CODEX_INSTRUCTIONS.md exists, and never touches the home directory', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
      writeFileSync(join(testDir, 'CODEX_INSTRUCTIONS.md'), '# Codex\n', 'utf-8');
      const home = makeTmpDir();
      const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, CODEX_HOME: process.env.CODEX_HOME };
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      process.env.CODEX_HOME = join(home, '.codex');
      try {
        const result = await backfiller.backfill(testDir, '.specs', false, true);
        const codex = result.slashCommands.find((r) => r.ide === 'codex')!;
        expect(codex.signalFile).toBe('CODEX_INSTRUCTIONS.md');
        expect(codex.added).toHaveLength(8);
        expect(existsSync(join(testDir, '.codex', 'prompts', 'specpilot-archive.md'))).toBe(true);
        expect(readdirSync(home)).toEqual([]);
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
        rmSync(home, { recursive: true, force: true });
      }
    });

    it('`specpilot backfill` lists kept files with their reason and does not fail (exit code 0)', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
      writeFileSync(join(testDir, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf-8');
      mkdirSync(join(testDir, '.claude', 'commands'), { recursive: true });
      writeFileSync(join(testDir, '.claude', 'commands', 'specpilot-status.md'), 'custom content', 'utf-8');
      const out: string[] = [];
      const log = jest.spyOn(console, 'log').mockImplementation((m?: unknown) => {
        out.push(String(m));
      });
      const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called');
      }) as never);
      try {
        await backfillCommand({ dir: testDir, specsName: '.specs', noPrompts: true });
      } finally {
        log.mockRestore();
        exit.mockRestore();
      }
      expect(exit).not.toHaveBeenCalled();
      const text = out.join('\n');
      expect(text).toContain('kept: modified  .claude/commands/specpilot-status.md');
      expect(text).toContain('delete it and re-run specpilot backfill to get the latest version');
    });

    (process.platform === 'win32' ? it.skip : it)('`specpilot backfill` writes no command file through a linked .claude folder and says so (BL-PM-006)', async () => {
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
      writeFileSync(join(testDir, 'CLAUDE.md'), '# CLAUDE.md\n', 'utf-8');
      const outside = makeTmpDir();
      symlinkSync(outside, join(testDir, '.claude'));
      const out: string[] = [];
      const log = jest.spyOn(console, 'log').mockImplementation((m?: unknown) => {
        out.push(String(m));
      });
      try {
        await backfillCommand({ dir: testDir, specsName: '.specs', noPrompts: true });
      } finally {
        log.mockRestore();
      }
      expect(readdirSync(outside)).toEqual([]);
      expect(out.join('\n')).toContain('kept: folder is a symbolic link or not a folder  .claude/commands/specpilot-status.md');
      rmSync(outside, { recursive: true, force: true });
    });
  });
});

describe('the MCP Tasks line (BL-088)', () => {
  const TASKS = '- **Tasks:** When the SpecPilot MCP tools are connected, use them to add and move tasks. Otherwise edit `.specs/planning/tasks.md` directly and keep its table format. Finished work goes from Current Sprint to Review, never straight to Completed; a Review row gets its Completed entry (number, CD ID, commit) only once it ends with `Approved <date>`.';
  const PROCESS = '## 🟡 Process Mandates\n\n- **Spec-First:** Update `.specs/` before writing code.\n- **Document decisions** in `.specs/development/context.md`.\n';
  /** The input with exactly one line added at line index `at`. */
  const oneLineAt = (input: string, at: number, eol = '\n') => {
    const lines = input.split(eol);
    lines.splice(at, 0, TASKS);
    return lines.join(eol);
  };

  it('goes after the last Process Mandates item, nothing else changed', () => {
    const input = `# CLAUDE.md\n\n${PROCESS}\n## Code Rules\n\n1. Delete before add.\n`;
    expect(withTasksLine(input)).toBe(oneLineAt(input, 6));
  });

  it('goes after the last item when the next heading follows at once', () => {
    const input = `${PROCESS}## Re-Anchor\n`;
    expect(withTasksLine(input)).toBe(oneLineAt(input, 4));
  });

  it("keeps an item's indented continuation lines with it", () => {
    const input = '## 🟡 Process Mandates\n\n- **Spec-First:** one\n  two\n\n## Next\n';
    expect(withTasksLine(input)).toBe(oneLineAt(input, 4));
  });

  it('keeps CRLF line endings', () => {
    const input = `# X\r\n\r\n${PROCESS.replace(/\n/g, '\r\n')}\r\n## Code Rules\r\n`;
    const out = withTasksLine(input)!;
    expect(out).toBe(oneLineAt(input, 6, '\r\n'));
    expect(out.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('adds the heading with the line at the end when the file has no Process Mandates', () => {
    expect(withTasksLine('# CLAUDE.md\n\n## Re-Anchor\n')).toBe(`# CLAUDE.md\n\n## Re-Anchor\n\n## 🟡 Process Mandates\n\n${TASKS}\n`);
    expect(withTasksLine('# CLAUDE.md')).toBe(`# CLAUDE.md\n\n## 🟡 Process Mandates\n\n${TASKS}`);
  });

  it('keeps a file without a final newline without one', () => {
    const input = `${PROCESS}\n## Code Rules\n\n1. Delete before add.`;
    const out = withTasksLine(input)!;
    expect(out).toBe(oneLineAt(input, 4));
    expect(out.endsWith('add.')).toBe(true);
  });

  it('is null when the line is there, so a second run changes nothing', () => {
    const once = withTasksLine(`# X\n\n${PROCESS}`)!;
    expect(withTasksLine(once)).toBeNull();
  });

  describe('through specpilot backfill', () => {
    let testDir: string;
    beforeEach(() => {
      testDir = makeTmpDir();
      scaffoldSpecs(testDir, { projectYaml: FULL_YAML, tasksMd: makeFullTasksMd('girishr') });
    });
    afterEach(() => rmSync(testDir, { recursive: true, force: true }));

    /** A complete file of the IDE files' wording, without the Tasks line. */
    const withoutTasks = (md: string) => md.split('\n').filter(l => !l.startsWith('- **Tasks:**')).join('\n');

    it.each(['CLAUDE.md', '.cursor/rules/specpilot.mdc', '.windsurfrules', '.antigravity/rules.md'])('adds exactly one line to %s, then nothing', async rel => {
      const file = join(testDir, ...rel.split('/'));
      mkdirSync(join(file, '..'), { recursive: true });
      const input = withoutTasks(FULL_MD_TERSE);
      writeFileSync(file, input);
      writeFileSync(join(testDir, '.github', 'copilot-instructions.md'), FULL_MD);
      const result = await new SpecBackfiller().backfill(testDir, '.specs', false, true);
      expect(result.ideFiles.find(r => r.path === rel)).toMatchObject({ action: 'updated', found: 10, total: 11, added: ['Tasks line (MCP)'] });
      const once = readFileSync(file, 'utf-8');
      expect(once).toBe(withTasksLine(input));
      expect(once.split('\n').length).toBe(input.split('\n').length + 1);
      await new SpecBackfiller().backfill(testDir, '.specs', false, true);
      expect(readFileSync(file, 'utf-8')).toBe(once);
    });

    it.each([['verbose', FULL_MD], ['terse', FULL_MD_TERSE]])('adds exactly one line to a %s copilot-instructions.md', async (_wording, md) => {
      const file = join(testDir, '.github', 'copilot-instructions.md');
      const input = withoutTasks(md);
      writeFileSync(file, input);
      const result = await new SpecBackfiller().backfill(testDir, '.specs', false, true);
      expect(result.copilotInstructions).toMatchObject({ action: 'updated', found: 10, total: 11, added: ['Tasks line (MCP)'] });
      expect(readFileSync(file, 'utf-8')).toBe(withTasksLine(input));
    });

    it('with --dry-run lists the line and writes nothing', async () => {
      const file = join(testDir, 'CLAUDE.md');
      const input = withoutTasks(FULL_MD_TERSE);
      writeFileSync(file, input);
      writeFileSync(join(testDir, '.github', 'copilot-instructions.md'), FULL_MD);
      const result = await new SpecBackfiller().backfill(testDir, '.specs', true, true);
      expect(result.ideFiles.find(r => r.path === 'CLAUDE.md')!.added).toEqual(['Tasks line (MCP)']);
      expect(readFileSync(file, 'utf-8')).toBe(input);
    });
  });
});
