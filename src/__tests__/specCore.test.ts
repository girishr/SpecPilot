import { createHash } from 'crypto';
import * as yaml from 'js-yaml';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { presentFields, render, RenderOptions, targetsInSpecs, targetsOutsideSpecs } from '../core/render';
import { OptionalFields, OPTIONAL_FIELDS, present, yamlScalar } from '../core/templateEngine';
import { ALL_FIELDS } from './fixtures/allFields';
import { SpecGenerator } from '../utils/specGenerator';
import { API_PARADIGM_CHOICES, IDE_CHOICES } from '../utils/addSpecsQuestions';

// BL-032 golden recording (REQ-002.I.3): what 2.9.0's generator wrote, under one fixed date, for ten
// option sets. Recorded on the code before `src/core/` existed, through `generateSpecs()` on disk;
// `render()` must reproduce every byte. Two sets are kept as full content, the other eight as one
// SHA-256 per path, so a change shows where it is while the snapshot file stays readable. The
// recording changes only when a Spec Report names a template change.

const DATE = '2026-10-06';

const ANALYSIS: RenderOptions['analysis'] = {
  todos: [{ file: 'src/app.ts', line: 12, text: 'handle retries', type: 'TODO' }],
  tests: { framework: 'jest', testFiles: ['src/__tests__/app.test.ts'], testCount: 3, hasE2E: false, hasUnit: true, hasIntegration: false },
  architecture: { components: ['Router', 'Store'], directories: 'src/\n  routes/\n  store/', fileTypes: { '.ts': 12, '.json': 2 } },
};

export const GOLDEN: Record<string, RenderOptions> = {
  'vscode typescript/express rest greenfield with context': {
    projectName: 'parcel-track', language: 'typescript', framework: 'express', specsName: '.specs', ide: 'vscode',
    author: 'girishr', description: 'Tracks parcels for small couriers', mode: 'new', projectType: 'greenfield', apiParadigm: 'rest',
    projectContext: { whatItDoes: 'Tracks parcels', targetUsers: 'Couriers', expectedScale: 'Hundreds of parcels a day', constraints: 'No native app' },
  },
  'claude-code javascript/react rest greenfield': { projectName: 'shop-ui', language: 'javascript', framework: 'react', specsName: '.specs', ide: 'claude-code', apiParadigm: 'rest' },
  'cursor python/fastapi rest greenfield': { projectName: 'ledger-api', language: 'python', framework: 'fastapi', specsName: '.specs', ide: 'Cursor', projectType: 'greenfield' },
  'windsurf kotlin/spring rest greenfield': { projectName: 'fleet', language: 'kotlin', framework: 'spring', specsName: '.specs', ide: 'windsurf' },
  'antigravity swift/vapor rest greenfield': { projectName: 'lantern', language: 'swift', framework: 'vapor', specsName: '.specs', ide: 'antigravity' },
  'codex typescript no framework rest greenfield': { projectName: 'tools', language: 'typescript', specsName: '.specs', ide: 'codex', author: 'jsmith' },
  'vscode typescript/express cli': { projectName: 'spec-cli', language: 'typescript', framework: 'express', specsName: '.specs', apiParadigm: 'cli' },
  'vscode python/django graphql': { projectName: 'graph', language: 'python', framework: 'django', specsName: '.specs', apiParadigm: 'graphql' },
  'vscode typescript/react none inferred': { projectName: 'site', language: 'typescript', framework: 'react', specsName: '.specs' },
  'vscode typescript/nest brownfield with analysis': {
    projectName: 'legacy-api', language: 'typescript', framework: 'nest', specsName: '.specs', ide: 'vscode', author: 'girishr',
    mode: 'existing', apiParadigm: 'rest', analysis: ANALYSIS,
  },
};
const FULL = new Set(['vscode typescript/express rest greenfield with context', 'vscode typescript/nest brownfield with analysis']);

/** Every regular file under `root`, `/`-joined relative path → content, in path order. */
function walk(root: string, rel = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(join(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, walk(root, p));
    else if (e.isFile()) out[p] = readFileSync(join(root, p), 'utf-8');
  }
  return out;
}

/** What `render()` returns for `options`, as path → content, in path order (as the recording walked the disk). */
export function generated(options: RenderOptions): Record<string, string> {
  const files = render({ ...options, date: DATE }).files;
  return Object.fromEntries(files.map(f => [f.path, f.content] as const).sort(([a], [b]) => a.localeCompare(b)));
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('spec core golden recording (BL-032)', () => {
  for (const [name, options] of Object.entries(GOLDEN)) {
    test(name, () => {
      const files = generated(options);
      expect(Object.keys(files).length).toBeGreaterThan(20);
      for (const content of Object.values(files)) expect(content).not.toContain('undefined');
      if (FULL.has(name)) expect(files).toMatchSnapshot();
      else expect(Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]))).toMatchSnapshot();
    });
  }

  test('generateSpecs() writes exactly what render() returns, and render() writes nothing', async () => {
    for (const options of Object.values(GOLDEN)) {
      const dir = mkdtempSync(join(tmpdir(), 'spec-core-'));
      try {
        render({ ...options, date: DATE });
        expect(readdirSync(dir)).toEqual([]);
        await new SpecGenerator().generateSpecs({ ...options, specsName: '.specs', date: DATE, targetDir: dir });
        expect(walk(dir)).toEqual(generated(options));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('every date comes from `date`; today when it is absent', () => {
    const files = render({ projectName: 'p', language: 'typescript', date: '2031-02-03' }).files;
    expect(files.find(f => f.path === '.specs/development/onboarding.md')!.content).toContain('lastUpdated: 2031-02-03');
    expect(files.find(f => f.path === '.specs/architecture/architecture.md')!.content).toContain('*Last updated: 2031-02-03*');
    expect(files.find(f => f.path === '.specs/planning/tasks.md')!.content).toContain('(2031-02-03)');
    const today = new Date().toISOString().split('T')[0];
    expect(render({ projectName: 'p', language: 'typescript' }).files.find(f => f.path === '.specs/planning/tasks.md')!.content).toContain(`(${today})`);
  });

  test('render() paths are in write order and equal the two path tables, for every IDE and paradigm', () => {
    for (const { value: ide } of IDE_CHOICES) {
      for (const { value: apiParadigm } of API_PARADIGM_CHOICES) {
        const paths = render({ projectName: 'p', language: 'python', ide, apiParadigm: apiParadigm as RenderOptions['apiParadigm'] }).files.map(f => f.path);
        expect(paths).toEqual([...targetsInSpecs(apiParadigm), ...targetsOutsideSpecs(ide)]);
        expect(new Set(paths).size).toBe(paths.length);
      }
    }
    expect(render({ projectName: 'p', language: 'python', specsName: 'docs' }).files[0].path).toBe('docs/README.md');
  });
});

describe('src/core is pure (REQ-002.I.2)', () => {
  const core = join(__dirname, '..', 'core');
  const files = readdirSync(core).filter(f => f.endsWith('.ts'));

  test('has the expected modules', () => {
    expect(files.sort()).toEqual(['agentConfig.ts', 'chatFlow.ts', 'ideConfig.ts', 'index.ts', 'render.ts', 'slashCommands.ts', 'specFiles.ts', 'templateEngine.ts']);
  });

  test.each(files)('%s imports only handlebars and files beside it, and uses no Node global', file => {
    const source = readFileSync(join(core, file), 'utf-8');
    const specifiers = [...source.matchAll(/^(?:import|export)\s[^'"]*from\s+'([^']+)'/gm)].map(m => m[1]);
    for (const s of specifiers) expect(s === 'handlebars' || /^\.\/[A-Za-z]+$/.test(s)).toBe(true);
    expect(source).not.toMatch(/\brequire\s*\(/);
    // A use of a Node global, not the word in a string ("review process" is fine).
    expect(source).not.toMatch(/\b(process|Buffer)\s*[.[(]|\btypeof\s+(process|Buffer)\b|[=(,]\s*(process|Buffer)\s*[;,)\n]|\b(__dirname|__filename)\b/);
  });

  test('chatFlow.ts imports nothing at all, so its compiled file runs in the page alone (REQ-002.I.7)', () => {
    expect(readFileSync(join(core, 'chatFlow.ts'), 'utf-8')).not.toMatch(/^\s*(import|export)\b[^\n]*\bfrom\s+['"]|\bimport\s*\(/m);
  });
});

// Phase 2 (REQ-002.I.4, I.5): every optional field set, recorded on the phase 2 code; the ten
// recordings above, which set none, still hold, which is the byte-identity claim.
const BASE: RenderOptions = { projectName: 'parcel-track', language: 'typescript', framework: 'express', specsName: '.specs', author: 'girishr', description: 'Tracks parcels for small couriers' };
const file = (options: RenderOptions, path: string) => render({ ...options, date: DATE }).files.find(f => f.path === path)!.content;

describe('optional template fields (BL-032 phase 2)', () => {
  test('every field set: vscode rest (full content)', () => {
    expect(generated({ ...BASE, ide: 'vscode', apiParadigm: 'rest', ...ALL_FIELDS })).toMatchSnapshot();
  });
  test('every field set: claude-code graphql and codex cli (hashes)', () => {
    for (const [ide, apiParadigm] of [['claude-code', 'graphql'], ['codex', 'cli']] as const) {
      const files = generated({ ...BASE, ide, apiParadigm, ...ALL_FIELDS });
      expect(Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]))).toMatchSnapshot();
    }
  });

  test('absent fields leave every byte of the recording; a blank, an empty list, a list of blanks and an empty map are absent', () => {
    const empty: OptionalFields = {
      platforms: [], accessControl: '  ', specialConsiderations: [''], accessibilityNotes: '', systemPattern: '', activeUsers: '', teamSize: '',
      deploymentTargets: [], localDatabases: [' '], dataSyncStrategy: '', integrations: { payments: [], ai: [''] }, otherApis: '', apiResponseTime: '',
      availability: '', databases: [], authStrategy: '', realtimeTypes: [], compliance: [], cicd: [], securityConcerns: [], buildTimeline: '',
      constraintDescription: '', testingStrategy: [],
    };
    expect(presentFields(empty)).toEqual({});
    expect(Object.keys(presentFields(ALL_FIELDS)).sort()).toEqual([...OPTIONAL_FIELDS].sort());
    expect(presentFields({ integrations: { ai: ['', 'OpenAI'], none: [] } })).toEqual({ integrations: { ai: ['OpenAI'] } });
    const golden = GOLDEN['vscode typescript/express rest greenfield with context'];
    expect(generated({ ...golden, ...empty })).toEqual(generated(golden));
    expect(present(undefined)).toBe(false);
    expect(present({})).toBe(false);
    expect(present('x')).toBe(true);
  });

  test('each section renders as REQ-002.I.4 says', () => {
    const all = { ...BASE, ide: 'vscode', apiParadigm: 'rest' as const, ...ALL_FIELDS };
    expect(file(all, '.specs/project/project.yaml')).toContain('  documentation_required: true\n  \n# Platforms\nplatforms:\n  - iOS Native\n  - Node.js / Express\n\n# Build and Deployment\n');
    expect(file(all, '.specs/project/requirements.md')).toContain('## Functional Requirements\n[TODO]\n\n### Access control\nRole-based (admin, agent, customer)\n\n### Special considerations\n- Accessibility (WCAG)\n- i18n\n\nScreen reader support and right-to-left layout.\n\n## Assumptions\n[TODO]');
    expect(file({ ...BASE, accessibilityNotes: 'Notes only.' }, '.specs/project/requirements.md')).toContain('[TODO]\n\n### Special considerations\n\nNotes only.\n\n## Assumptions');
    const arch = file(all, '.specs/architecture/architecture.md');
    expect(arch).toContain('- **Architecture Style**: Modular monolith\n');
    expect(arch).toContain('## Scale\n- Active users: 1,000 - 10,000\n- Team size: 2-5 devs\n\n## Deployment targets\n- AWS\n- Vercel\n\n## Data layer\n- **Offline support**: Yes\n- **Local database(s)**: SQLite\n- **Data sync strategy**: Last write wins\n\n## Integrations\n- **payments**: Stripe\n- **ai**: OpenAI, Anthropic\n\nOther: Twilio for SMS\n\n## Design Decisions\n');
    expect(arch).toContain('## Performance Considerations\n- **API response-time target**: < 200 ms (p95)\n- **Availability target**: 99.9%\n\n## Monitoring');
    expect(file({ ...BASE, teamSize: 'Solo' }, '.specs/architecture/architecture.md')).toContain('## Scale\n- Team size: Solo\n\n## Design Decisions');
    expect(file({ ...BASE, otherApis: 'Mapbox' }, '.specs/architecture/architecture.md')).toContain('## Integrations\nOther: Mapbox\n\n## Design Decisions');
    expect(file(all, '.specs/architecture/api.yaml')).toContain('          description: "Success"\n\ndatabases:\n  - PostgreSQL\n  - Redis\nauth_strategy: Clerk\nrealtime:\n  enabled: true\n  transports:\n  - WebSockets\n');
    expect(file({ ...all, apiParadigm: 'graphql' }, '.specs/architecture/api.yaml')).toContain('description: "[TODO: What does this mutation do?]"\n\ndatabases:\n');
    expect(file({ ...all, apiParadigm: 'cli' }, '.specs/architecture/api.yaml')).not.toContain('databases');
    expect(file(all, '.specs/security/security-decisions.md')).toMatch(/## Decisions \[SEC-002\.1\]\nAuth strategy: Clerk\nCompliance: GDPR, SOC 2\nCI\/CD: GitHub Actions\n$/);
    expect(file(all, '.specs/security/threat-model.md')).toContain('## Threat Model [SEC-002]\n\n### Security concerns\n- Rate limiting\n- Audit logging\n\n### Integration-derived threat entries\n- payments: Stripe — review vendor data-handling and auth scopes\n- ai: OpenAI, Anthropic — review vendor data-handling and auth scopes\n\n## Attack Surface Summary [SEC-003]\n[TODO]');
    expect(file(all, '.specs/planning/roadmap.md')).toContain('## Milestones\nBuild timeline: 3 months\n\n[TODO]\n\n## Objectives');
    expect(file(all, '.specs/planning/tasks.md')).not.toContain('3 months');
    expect(file(all, '.specs/development/context.md')).toMatch(/## Project Memory\n### Constraints\nMust run on the existing Postgres cluster\.\n$/);
    expect(file(all, '.specs/quality/tests.md')).toMatch(/## Overview\nStrategy: Unit, E2E\n$/);
  });

  test('yaml values: plain when YAML reads them back unchanged, else double-quoted and escaped (REQ-002.I.5)', () => {
    for (const plain of ['Clerk', 'Node.js / Express', "Don't stop", '1,000 - 10,000', '99.9%', '1.0.0', 'a-b_c.d', 'x:y', 'A (B) C', 'OK#1', 'what?']) {
      expect(yamlScalar(plain)).toBe(plain);
    }
    expect(yamlScalar('')).toBe('""');
    expect(yamlScalar('a: b')).toBe('"a: b"');
    expect(yamlScalar('ends with colon:')).toBe('"ends with colon:"');
    expect(yamlScalar('trailing ')).toBe('"trailing "');
    expect(yamlScalar(' leading')).toBe('" leading"');
    expect(yamlScalar('a #comment')).toBe('"a #comment"');
    for (const lead of ['- x', '? x', ': x', ', x', '[x]', '{x}', '#x', '&x', '*x', '!x', '|x', '>x', "'x", '"x', '%x', '@x', '`x']) {
      expect(yamlScalar(lead)).toBe(`"${lead.replace(/"/g, '\\"')}"`);
    }
    for (const word of ['true', 'False', 'NULL', '~', 'yes', 'No', 'on', 'OFF']) expect(yamlScalar(word)).toBe(`"${word}"`);
    for (const num of ['123', '-1', '+2', '1.5', '.5', '1e3', '0x1F', '0o17', '0b1010', '017', '.inf', '-.Inf', '.NaN', '1_000', '20261006']) expect(yamlScalar(num)).toBe(`"${num}"`);
    for (const stamp of ['2026-10-06', '2026-10-06T12:00:00Z', '2026-10-06 12:00:00', '2001-12-14t21:59:43.10-05:00', '2026-1-6']) expect(yamlScalar(stamp)).toBe(`"${stamp}"`);
    for (const plain of ['2026-10', '10-06-2026', 'v2026-10-06', '2026-10-06x', '12:30', '1.0.0']) expect(yamlScalar(plain)).toBe(plain);
    expect(yamlScalar('say "hi" \\ there')).toBe('say "hi" \\ there'); // legal inside a plain scalar
    expect(yamlScalar(': "hi" \\ there')).toBe('": \\"hi\\" \\\\ there"');
    expect(yamlScalar('two\nlines\twith\r')).toBe('"two\\nlines\\twith\\r"');
  });

  test('yaml values round-trip through js-yaml, the reader specpilot validate uses', () => {
    const values = [
      'Clerk', 'Node.js / Express', "Don't stop", '1,000 - 10,000', '99.9%', '1.0.0', 'x:y', 'OK#1', 'what?', 'say "hi" \\ there',
      '', ' ', 'a: b', 'a #b', 'ends:', '- x', '[x]', '{x}', '&x', '*x', '!x', '|x', '>x', "'x", '"x', '%x', '@x', '`x', '? x', ', x',
      'true', 'False', 'NULL', '~', 'null', 'yes', 'No', 'on', 'OFF', '123', '-1', '+2', '1.5', '.5', '1e3', '0x1F', '0o17', '0b1010', '017',
      '.inf', '-.Inf', '.NaN', '1_000', '20261006', '2026-10-06', '2026-10-06T12:00:00Z', '2026-10-06 12:00:00', '2026-1-6', '2026-10', '12:30',
      'two\nlines', 'tab\there', 'cr\r', 'ünïcödé — ok', '日本語',
    ];
    for (const value of values) {
      expect([value, yaml.load(`v: ${yamlScalar(value)}`)]).toEqual([value, { v: value }]);
      expect([value, yaml.load(`l:\n${yamlScalar(value) ? `  - ${yamlScalar(value)}` : ''}`)]).toEqual([value, { l: [value] }]);
    }
  });

  test('project.yaml name and description read back as written (BL-085)', () => {
    expect(file({ ...BASE, projectName: '123', description: 'Deploy: nightly' }, '.specs/project/project.yaml')).toContain('name: "123"\nversion: "1.0.0"\nlanguage: typescript\nframework: express\ndescription: "Deploy: nightly"\n');
    expect(file({ ...BASE, description: "Don't & <b>" }, '.specs/project/project.yaml')).toContain("description: Don't & <b>\n");
    expect(file({ ...BASE, platforms: ['a: b', 'true'] }, '.specs/project/project.yaml')).toContain('platforms:\n  - "a: b"\n  - "true"\n');
    expect(file({ ...BASE, authStrategy: 'OAuth 2.0: PKCE' }, '.specs/architecture/api.yaml')).toContain('auth_strategy: "OAuth 2.0: PKCE"\n');
  });

  test('no HTML escaping: the seven characters land as typed in markdown (BL-PM-004b)', () => {
    const typed = `a&b <c> "d" 'e' \`f\` =g`;
    const arch = file({ ...BASE, apiResponseTime: '< 100ms', otherApis: typed }, '.specs/architecture/architecture.md');
    expect(arch).toContain('- **API response-time target**: < 100ms\n');
    expect(arch).toContain(`Other: ${typed}\n`);
    expect(arch).not.toMatch(/&(amp|lt|gt|quot|#x27|#x60|#x3D);/);
    // a value is data to Handlebars, never template source (SEC-004.3)
    expect(file({ ...BASE, otherApis: '{{projectName}} {{#if x}}' }, '.specs/architecture/architecture.md')).toContain('Other: {{projectName}} {{#if x}}\n');
  });

  test('a detected project name, --lang or --framework with a formerly escaped character still gives YAML that parses (BL-PM-004b)', () => {
    const fronts = (files: { path: string; content: string }[]) => files
      // onboarding.md and the report prompt hold text between --- lines that is not YAML, also on main
      .filter(f => !/onboarding\.md$|specpilot-report/.test(f.path))
      .map(f => (/\.ya?ml$/.test(f.path) ? [f.path, f.content] : f.content.startsWith('---\n') ? [f.path, f.content.split('---\n')[1]] : null))
      .filter((x): x is string[] => x !== null);
    for (const projectName of ['a"b', "'q", '>x', '`t', 'a&b', '=y']) {
      for (const apiParadigm of ['rest', 'cli'] as const) {
        const files = render({ ...BASE, projectName, framework: '"x', language: "o'k", apiParadigm, projectType: 'brownfield', mode: 'existing' }).files;
        for (const [path, text] of fronts(files)) {
          let doc: unknown;
          expect(() => { doc = yaml.load(text); }).not.toThrow();
          const d = (doc ?? {}) as { project?: unknown; framework?: unknown; language?: unknown; info?: { title?: string } };
          if (typeof d.project === 'string' && !path.endsWith('project.yaml')) expect([path, d.project]).toEqual([path, projectName]);
          if ('framework' in d && d.framework !== null) expect([path, d.framework]).toEqual([path, '"x']);
          if (d.info?.title) expect(d.info.title).toBe(`${projectName} API`);
        }
      }
    }
  });

  test('a handle typed at the terminal still gives YAML that reads back as typed (BL-PM-004b)', () => {
    for (const author of ['jsmith', 'Your Name', 'a"b', "o'neil", 'back\\slash', '`tick', '&amp']) {
      const project = yaml.load(file({ ...BASE, author }, '.specs/project/project.yaml')) as { team: { devPrefix: string } };
      expect(project.team.devPrefix).toBe(author);
      const tasks = file({ ...BASE, author }, '.specs/planning/tasks.md');
      const front = yaml.load(tasks.split('---')[1]) as { contributors: string[] };
      expect(front.contributors).toEqual([author]);
    }
  });
});
