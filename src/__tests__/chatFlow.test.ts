import { readFileSync } from 'fs';
import { join } from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import * as core from '../core/chatFlow';
import { Answers, ChatQuestion, CliQuestion } from '../core/chatFlow';
import { render } from '../core/render';
import { chatCoreScript } from '../utils/specServer';
import { newProjectQuestions } from '../utils/specSetup';

// What the chat core adds for the App (BL-PM-004b, REQ-002.H.28, REQ-002.I.7); the web's own rules are
// pinned by chatFlowWeb.test.ts.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const route = require('../../ui/route.js') as {
  flowQuestions: (q: unknown, answers: Answers, first?: unknown[]) => CliQuestion[];
  flowBody: (list: unknown[], answers: Answers) => Record<string, string>;
  threadRows: (q: unknown, list: unknown[], answers: Answers, cur: unknown, ctx: { name: string; language: string }, named: boolean) => { kind: string; text: string; caption?: string }[];
  optionHtml: (o: unknown, pressed: boolean) => string;
  setupsLoad: (raw: string | null) => { id: string }[];
  setupsPut: (list: unknown[], entry: unknown) => { id: string; updatedAt: number }[];
  setupsRemove: (list: unknown[], id: string) => { id: string }[];
  setupRecord: (st: unknown) => Record<string, unknown>;
  setupTitle: (e: unknown) => string;
  setupStatus: (e: unknown) => string;
};

const server = newProjectQuestions();
const PARENT = { key: 'parent', message: 'Parent folder', label: 'Folder', required: true, chat: '', step: 'Project identity' };

/** The questions a new project's chat asks for `a`, as the page builds them. */
const ask = (a: Answers, mode: core.ChatMode = 'new'): ChatQuestion[] => {
  const first = mode === 'new' ? [PARENT] : [];
  const all = [...first, ...server.questions] as CliQuestion[];
  return core.chatQuestions(all, route.flowQuestions(server, a, first), a, mode, server.files.outside);
};
const keys = (a: Answers, mode: core.ChatMode = 'new') => ask(a, mode).map(q => q.key);

describe('the questions and their order (REQ-002.H.28)', () => {
  it('a new Greenfield project: the web\'s 33 in its order, the CLI\'s six in their places, plus language, framework and the parent folder', () => {
    expect(keys({ projectDescription: 'CRM System', projectCategory: 'saas', apiParadigm: 'rest', localDatabases: ['SQLite'], technicalConstraints: ['Budget cap'] })).toEqual([
      'parent', 'projectDescription', 'projectType', 'handle',
      'platforms', 'language', 'framework', 'ide',
      'userTypes', 'accessControl', 'specialConsiderations', 'accessibilityNotes',
      'scaleTier', 'activeUsers', 'deploymentTargets', 'buildTimeline', 'teamSize',
      'systemPattern', 'apiParadigm', 'databases', 'authStrategy', 'realtimeTypes', 'localDatabases', 'dataSyncStrategy',
      'integrations', 'otherApis',
      'nonGoals', 'technicalConstraints', 'constraintDescription', 'compliance', 'apiResponseTime', 'availability',
      'securityConcerns', 'testingStrategy', 'cicd',
    ]);
    expect(core.CHAT_STEPS).toHaveLength(8);
  });

  it('Brownfield: the description and technical constraints stay (category, gate), user types, scale tier and non-goals go', () => {
    const k = keys({ projectType: 'brownfield', projectDescription: 'CRM System', projectCategory: 'saas', apiParadigm: 'rest' });
    expect(k).toEqual(expect.arrayContaining(['projectDescription', 'technicalConstraints']));
    for (const key of ['userTypes', 'scaleTier', 'nonGoals']) expect(k).not.toContain(key);
  });

  it('guided setup: no name, folder, description, user types, scale tier or non-goals; the 23 fields\' questions all asked', () => {
    const k = keys({ apiParadigm: 'rest', technicalConstraints: ['Budget cap'], localDatabases: ['SQLite'] }, 'setup');
    for (const key of ['parent', 'projectDescription', 'userTypes', 'scaleTier', 'nonGoals']) expect(k).not.toContain(key);
    for (const key of Object.keys(core.OPTIONAL_FIELD_LIMITS)) expect(k).toContain(key);
  });

  it('the CLI\'s context questions are not asked themselves; the folded questions show their message', () => {
    const list = ask({});
    for (const key of ['whatItDoes', 'targetUsers', 'expectedScale', 'constraints']) expect(list.map(q => q.key)).not.toContain(key);
    const msg = (key: string) => list.find(q => q.key === key)!.message;
    expect(msg('projectDescription')).toBe(server.questions.find(q => q.key === 'whatItDoes')!.message);
    expect(msg('userTypes')).toBe(server.questions.find(q => q.key === 'targetUsers')!.message);
    expect(msg('platforms')).toBe('');
  });

  it('the App\'s rule: databases and realtime only for rest and graphql; auth still asked', () => {
    for (const apiParadigm of ['cli', 'none']) {
      const k = keys({ projectCategory: 'saas', apiParadigm });
      expect(k).not.toContain('databases');
      expect(k).not.toContain('realtimeTypes');
      expect(k).toContain('authStrategy');
    }
    expect(keys({ projectCategory: 'saas', apiParadigm: 'graphql' })).toEqual(expect.arrayContaining(['databases', 'realtimeTypes']));
  });

  it('a server-less category skips the web\'s server questions with its note, and seeds the API paradigm', () => {
    const a = { projectDescription: 'CLI Tool', projectCategory: 'cli' };
    const list = ask(a);
    for (const key of ['systemPattern', 'databases', 'authStrategy', 'realtimeTypes', 'apiResponseTime', 'availability', 'localDatabases']) expect(list.map(q => q.key)).not.toContain(key);
    const api = list.find(q => q.key === 'apiParadigm')!;
    expect(api.seed).toBe('cli');
    expect(api.notesBefore[0]).toMatch(/^Skipping architecture pattern, database, auth, and real-time questions - a cli tool/);
    expect(ask({ projectDescription: 'Static Website', projectCategory: 'static' }).find(q => q.key === 'apiParadigm')!.seed).toBe('none');
    expect(ask({ projectCategory: 'saas' }).find(q => q.key === 'apiParadigm')!.seed).toBeUndefined();
  });

  it('the description sets the category as the web\'s toPatch does', () => {
    expect(core.answerPatch('projectDescription', 'CLI Tool', {})).toEqual({ projectDescription: 'CLI Tool', projectCategory: 'cli' });
    expect(core.answerPatch('projectDescription', 'CLI Tool for parcels', { projectCategory: 'cli' }).projectCategory).toBe('cli');
    expect(core.answerPatch('projectDescription', '', { projectCategory: 'cli' }).projectCategory).toBeNull();
    expect(core.answerPatch('teamSize', 'solo', {})).toEqual({ teamSize: 'solo' });
  });
});

describe('the language from the platforms (REQ-002.H.28, open question 1)', () => {
  it('one language: pre-selected and recommended, with its framework', () => {
    const h = core.languageHints(['fastapi']);
    expect([h.languages, h.language, h.frameworks, h.framework, h.note]).toEqual([['python'], 'python', ['fastapi'], 'fastapi', '']);
  });

  it('two languages: the highest-priority tab wins (Backend > Full stack > Web > Mobile), both recommended, a note', () => {
    expect(core.languageHints(['ios', 'node']).language).toBe('typescript');
    expect(core.languageHints(['ios', 'django']).language).toBe('python');
    expect(core.languageHints(['android', 'react']).language).toBe('typescript'); // web before mobile
    const h = core.languageHints(['ios', 'node']);
    expect(h.languages.sort()).toEqual(['swift', 'typescript']);
    expect(h.note).toBe('Your platforms use TypeScript and Swift. SpecPilot writes one language into project.yaml: pick the main one. Every platform is still listed under platforms.');
  });

  it('the framework only within the chosen language', () => {
    expect(core.languageHints(['ios', 'node'], 'swift')).toMatchObject({ frameworks: ['ios'], framework: 'ios' });
    expect(core.languageHints(['react', 'node'])).toMatchObject({ language: 'typescript', framework: 'express', frameworks: ['express', 'react'] });
  });

  it('no CLI language: nothing pre-selected, a note naming it', () => {
    const h = core.languageHints(['flutter']);
    expect([h.language, h.languages]).toEqual([undefined, []]);
    expect(h.note).toBe('SpecPilot has no Dart templates yet. Pick the closest language; your platforms are listed as you picked them.');
  });

  it('every platform of the grid is in the table or named as unsupported, and maps to a framework of its language', () => {
    for (const id of core.PLATFORM_GROUPS.flatMap(g => g.items.map(i => i.id))) {
      const m = core.PLATFORM_LANGUAGE[id];
      if (!m) {
        expect(core.languageHints([id]).note).toMatch(/^SpecPilot has no /);
        continue;
      }
      expect(['typescript', 'javascript', 'python', 'kotlin', 'swift']).toContain(m[0]);
      if (m[1]) expect(server.frameworks[m[0]]).toContain(m[1]);
    }
  });

  it('the language and framework questions carry the badges and the seed', () => {
    const list = ask({ platforms: ['ios', 'node'] });
    const lang = list.find(q => q.key === 'language')!;
    expect([lang.seed, lang.badges, lang.note]).toEqual(['typescript', { typescript: 'recommended', swift: 'recommended' }, expect.stringMatching(/^Your platforms use/)]);
    expect(ask({ platforms: ['ios', 'node'], language: 'typescript' }).find(q => q.key === 'framework')!.seed).toBe('express');
  });
});

describe('seeds (the web\'s seedIf and seedIsStale)', () => {
  it('a seed fills nothing by itself; a kept seed is replaced when the platforms change, a user\'s pick is not', () => {
    const a: Answers = { projectCategory: 'saas', platforms: ['supabase'] };
    const deploy = ask(a).find(q => q.key === 'deploymentTargets')!;
    expect(deploy.seed).toEqual(['Supabase']);
    expect(deploy.answered).toBe(false);
    // continued with the seed: recorded; then the platform changes to Firebase
    const after = { ...a, deploymentTargets: ['Supabase'], platforms: ['firebase'] };
    const r = core.reseed(ask(after), after, { deploymentTargets: ['Supabase'] });
    expect(r.answers.deploymentTargets).toEqual(['Firebase Hosting']);
    expect(r.seeded).toEqual({ deploymentTargets: ['Firebase Hosting'] });
    // the user's own pick (not recorded as a seed) stays
    expect(core.reseed(ask(after), after, {}).answers.deploymentTargets).toEqual(['Supabase']);
  });

  it('a seeded language follows the platforms while it is still the seed', () => {
    const a = { platforms: ['django'], language: 'typescript' };
    expect(core.reseed(ask(a), a, { language: 'typescript' }).answers.language).toBe('python');
  });
});

describe('what is sent (REQ-002.H.28)', () => {
  const answers: Answers = {
    projectDescription: 'CRM System', projectCategory: 'saas', projectType: 'greenfield', platforms: ['ios', 'node'],
    userTypes: ['Customers', 'Admins', core.TODO], accessControl: 'role', specialConsiderations: ['a11y'], accessibilityNotes: '  ',
    scaleTier: 'startup', activeUsers: 'noidea', deploymentTargets: ['AWS', 'My rack'], buildTimeline: '1-3m', teamSize: 'solo',
    systemPattern: 'modular', apiParadigm: 'rest', databases: ['PostgreSQL', 'Not sure → TODO'], authStrategy: 'Clerk', realtimeTypes: [],
    localDatabases: ['Core Data'], dataSyncStrategy: 'last-write-wins', integrations: { payments: ['Stripe'], ai: ['None'] }, otherApis: 'Twilio',
    nonGoals: 'No mobile app', technicalConstraints: ['Budget cap', 'Hard deadline'], constraintDescription: 'Postgres only',
    compliance: ['gdpr', 'none'], apiResponseTime: 'unsure', availability: '99.9', securityConcerns: ['audit'], testingStrategy: ['none'], cicd: ['github'],
  };

  it('labels, not ids; TODO choices and an empty text left out; None inside an integration category left out; free entries as typed', () => {
    const body = core.requestFields(ask(answers), answers, 'new');
    expect(body).toEqual({
      platforms: ['iOS Native', 'Node.js / Express'], accessControl: 'Role-based access', specialConsiderations: ['Accessibility (WCAG)'],
      systemPattern: 'Modular Monolith', teamSize: 'Solo dev', deploymentTargets: ['AWS', 'My rack'], localDatabases: ['Core Data'],
      dataSyncStrategy: 'Last write wins', integrations: { payments: ['Stripe'] }, otherApis: 'Twilio', availability: '99.9%',
      databases: ['PostgreSQL'], authStrategy: 'Clerk', compliance: ['GDPR', 'None'], cicd: ['GitHub Actions'], securityConcerns: ['Audit Logging'],
      buildTimeline: '1–3 months', constraintDescription: 'Postgres only', testingStrategy: ['None for now'],
      whatItDoes: 'CRM System', targetUsers: 'Customers, Admins', expectedScale: 'Startup (1K–50K users, growth-focused)',
      constraints: 'No mobile app Technical constraints: Budget cap, Hard deadline.',
    });
  });

  it('no folds for Brownfield or guided setup; a TODO non-goal folds to nothing', () => {
    expect(Object.keys(core.requestFields(ask({ ...answers, projectType: 'brownfield' }), { ...answers, projectType: 'brownfield' }, 'new'))).not.toContain('whatItDoes');
    expect(Object.keys(core.requestFields(ask(answers, 'setup'), answers, 'setup'))).not.toContain('constraints');
    const todo = { ...answers, nonGoals: core.TODO, technicalConstraints: [] };
    expect(core.requestFields(ask(todo), todo, 'new').constraints).toBe('');
  });

  it('a question not asked is not sent (its answer stays in the page)', () => {
    const cli = { ...answers, apiParadigm: 'cli' };
    const body = core.requestFields(ask(cli), cli, 'new');
    expect(body.databases).toBeUndefined();
    expect(body.realtimeTypes).toBeUndefined();
  });

  it('each answer\'s caption names the files it changes; none for the folder, the handle, the language and the framework', () => {
    const list = ask(answers);
    const cap = (key: string) => list.find(q => q.key === key)!.caption;
    expect(cap('platforms')).toBe('For project/project.yaml');
    expect(cap('authStrategy')).toBe('For architecture/api.yaml & security/security-decisions.md');
    expect(cap('userTypes')).toBe('For development/onboarding.md');
    expect(cap('ide')).toMatch(/^For \d+ files$/);
    for (const key of ['parent', 'handle', 'language', 'framework']) expect(cap(key)).toBe('');
    expect(ask({ ...answers, projectType: 'brownfield' }).find(q => q.key === 'technicalConstraints')!.caption).toBe('');
  });
});

describe('the field-to-file table is what render() changes (REQ-002.I.7)', () => {
  const base = (apiParadigm: 'rest' | 'graphql' | 'cli' | 'none') => ({
    projectName: 'x', language: 'typescript', framework: 'express', author: 'me', ide: 'vscode', mode: 'new' as const, projectType: 'greenfield' as const,
    apiParadigm, date: '2026-01-01', projectContext: { whatItDoes: 'N', targetUsers: 'N', expectedScale: 'N', constraints: 'N' },
  });
  const changed = (a: Parameters<typeof render>[0], b: Parameters<typeof render>[0]) => {
    const before = new Map(render(a).files.map(f => [f.path, f.content]));
    return render(b).files.filter(f => before.get(f.path) !== f.content).map(f => f.path.replace(/^\.specs\//, '')).sort();
  };
  const sample = (key: string) => {
    const { kind } = core.OPTIONAL_FIELD_LIMITS[key];
    return kind === 'map' ? { ai: ['OpenAI'] } : kind === 'list' ? ['A'] : 'A';
  };

  it.each(['rest', 'graphql', 'cli', 'none'] as const)('%s: each optional field, each context answer, the project type and the paradigm', p => {
    for (const key of Object.keys(core.OPTIONAL_FIELD_LIMITS)) {
      const apiOnly = core.FIELD_FILES[key].every(f => f === 'architecture/api.yaml');
      const expected = (p === 'cli' || p === 'none') ? core.FIELD_FILES[key].filter(f => f !== 'architecture/api.yaml') : core.FIELD_FILES[key];
      // databases and realtime have no file under cli or none, which is why the chat does not ask them there
      expect([key, changed(base(p), { ...base(p), [key]: sample(key) })]).toEqual([key, apiOnly && (p === 'cli' || p === 'none') ? [] : [...expected].sort()]);
    }
    for (const key of ['whatItDoes', 'targetUsers', 'expectedScale', 'constraints']) {
      expect(changed(base(p), { ...base(p), projectContext: { ...base(p).projectContext, [key]: 'Z' } })).toEqual(core.FIELD_FILES[key]);
    }
    expect(changed(base(p), { ...base(p), projectType: 'brownfield' })).toEqual(core.FIELD_FILES.projectType);
  });

  it('the API paradigm changes api.yaml', () => {
    expect(changed(base('rest'), base('graphql'))).toEqual(core.FIELD_FILES.apiParadigm);
  });
});

describe('the served chat core (/assets/chat-core.js)', () => {
  it('runs alone in a page and exposes the module\'s functions', () => {
    const compiled = ts.transpileModule(readFileSync(join(__dirname, '..', 'core', 'chatFlow.ts'), 'utf-8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const sandbox: { window: Record<string, unknown> } = { window: {} };
    vm.runInNewContext(chatCoreScript(compiled + '\n//# sourceMappingURL=chatFlow.js.map'), sandbox);
    const page = sandbox.window.SpecPilotChat as Record<string, unknown>;
    expect(Object.keys(page).sort()).toEqual(Object.keys(core).sort());
    expect((page.languageHints as typeof core.languageHints)(['ios', 'node']).language).toBe('typescript');
    expect(chatCoreScript('x\n//# sourceMappingURL=a.map')).not.toContain('sourceMappingURL');
  });
});

describe('the page\'s pieces (ui/route.js)', () => {
  it('one renderer: a chip, a card with a description, the two badges, a warning, escaped', () => {
    expect(route.optionHtml({ id: 'a', label: 'A <b>' }, false)).toBe('<button type="button" class="chip" aria-pressed="false" data-v="a"><b>A &lt;b&gt;</b></button>');
    const card = route.optionHtml({ id: 'm', label: 'Monolith', emoji: '🧱', description: 'One deploy', badge: 'recommended', warning: 'Hmm' }, true);
    expect(card).toContain('class="chip card"');
    expect(card).toContain('aria-pressed="true"');
    expect(card).toContain('<span class="bdg">Recommended</span>');
    expect(card).toContain('<small>One deploy</small><small class="wn">⚠ Hmm</small>');
    expect(route.optionHtml({ id: 'x', label: 'X', badge: 'flagged' }, false)).toContain('<span class="bdg fl">Check this</span>');
  });

  it('the thread shows skip notes, the caption and the note after an answer', () => {
    const list = ask({ projectDescription: 'CLI Tool', projectCategory: 'cli', parent: '~/dev', projectType: 'greenfield', handle: '', platforms: ['commander'] });
    const rows = route.threadRows(server, list, { parent: '~/dev', projectDescription: 'CLI Tool', projectType: 'greenfield', handle: '', platforms: ['commander'] }, null, { name: 'x', language: '' }, true);
    expect(rows.find(r => r.kind === 'bot' && r.text.startsWith('Which platforms'))!.caption).toBe('For project/project.yaml');
    expect(rows.some(r => r.kind === 'note' && r.text.startsWith('Skipping architecture pattern'))).toBe(true);
  });

  it('the create body: the CLI\'s answers from flowBody(), the rest from the core', () => {
    const a: Answers = { parent: '~/dev', projectDescription: 'CRM System', projectType: 'greenfield', handle: '', language: 'typescript', framework: 'none', ide: 'vscode', apiParadigm: 'rest' };
    const list = ask(a);
    expect(route.flowBody(list.filter(q => !q.core), a)).toEqual({ parent: '~/dev', projectType: 'greenfield', handle: '', language: 'typescript', framework: 'none', ide: 'vscode', apiParadigm: 'rest' });
  });

  it('saved setups: newest first, at most 50, replaced by id, removed, bad JSON ignored, never the token', () => {
    expect(route.setupsLoad('not json')).toEqual([]);
    expect(route.setupsLoad('{"a":1}')).toEqual([]);
    expect(route.setupsLoad('[{"id":"x"},{"id":"n1","kind":"new","answers":{}}]').map(e => e.id)).toEqual(['n1']);
    let list: { id: string; updatedAt: number }[] = [];
    for (let i = 0; i < 55; i++) list = route.setupsPut(list, { id: 'n' + i, kind: 'new', answers: {}, updatedAt: i });
    expect(list).toHaveLength(50);
    expect(list[0].id).toBe('n54');
    list = route.setupsPut(list, { id: 'n10', kind: 'new', answers: {}, updatedAt: 99 });
    expect([list[0].id, list.filter(e => e.id === 'n10').length]).toEqual(['n10', 1]);
    expect(route.setupsRemove(list, 'n10').some(e => e.id === 'n10')).toBe(false);
    const record = route.setupRecord({ id: 'n1', kind: 'new', answers: { name: 'demo' }, started: true, token: 'secret', updatedAt: 1 });
    expect(JSON.stringify(record)).not.toContain('secret');
    expect(Object.keys(record).sort()).toEqual(['answers', 'editing', 'finished', 'id', 'kind', 'name', 'preview', 'root', 'seeded', 'started', 'updatedAt']);
    expect([route.setupTitle({ kind: 'new', name: '' }), route.setupTitle({ kind: 'setup', root: '/a/b/proj' }), route.setupStatus({ finished: true })]).toEqual(['Untitled setup', 'proj', 'Ready to create']);
  });
});
