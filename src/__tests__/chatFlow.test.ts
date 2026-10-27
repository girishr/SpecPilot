import * as core from '../core/chatFlow';
import { Answers, ChatQuestion, CliQuestion } from '../core/chatFlow';
import { render } from '../core/render';
import { newProjectQuestions } from '../utils/specSetup';

// What the chat core adds for the App (BL-PM-004b, REQ-002.H.28, REQ-002.I.7); the web's own rules are
// pinned by chatFlowWeb.test.ts.

// eslint-disable-next-line @typescript-eslint/no-var-requires
const route = require('../../ui/route.js') as {
  flowQuestions: (q: unknown, answers: Answers, first?: unknown[]) => CliQuestion[];
  flowBody: (list: unknown[], answers: Answers) => Record<string, string>;
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
    expect(keys({ projectDescription: 'CRM System', projectCategory: 'saas', apiParadigm: 'rest', localDatabases: ['SQLite'], technicalConstraints: ['Budget cap'], hasDesignAssets: 'Yes' })).toEqual([
      'parent', 'projectDescription', 'projectType', 'handle',
      'platforms', 'language', 'framework', 'ide',
      'userTypes', 'accessControl', 'specialConsiderations', 'accessibilityNotes',
      'scaleTier', 'activeUsers', 'deploymentTargets', 'buildTimeline', 'teamSize',
      'systemPattern', 'apiParadigm', 'databases', 'authStrategy', 'realtimeTypes', 'localDatabases', 'dataSyncStrategy',
      'integrations', 'otherApis',
      'nonGoals', 'technicalConstraints', 'constraintDescription', 'compliance', 'apiResponseTime', 'availability',
      'securityConcerns', 'testingStrategy', 'cicd',
      'hasDesignAssets', 'figmaUrl', 'designSystem', 'designNotes', 'uiStyle',
    ]);
    expect(core.CHAT_STEPS).toHaveLength(9);
  });

  it('Brownfield: the description and technical constraints stay (category, gate), user types, scale tier and non-goals go', () => {
    const k = keys({ projectType: 'brownfield', projectDescription: 'CRM System', projectCategory: 'saas', apiParadigm: 'rest' });
    expect(k).toEqual(expect.arrayContaining(['projectDescription', 'technicalConstraints']));
    for (const key of ['userTypes', 'scaleTier', 'nonGoals']) expect(k).not.toContain(key);
  });

  it('guided setup: no name, folder, description, user types, scale tier or non-goals; the 28 fields\' questions all asked', () => {
    const k = keys({ apiParadigm: 'rest', technicalConstraints: ['Budget cap'], localDatabases: ['SQLite'], hasDesignAssets: 'Yes' }, 'setup');
    for (const key of ['parent', 'projectDescription', 'userTypes', 'scaleTier', 'nonGoals']) expect(k).not.toContain(key);
    for (const key of Object.keys(core.OPTIONAL_FIELD_LIMITS)) expect(k).toContain(key);
    for (const key of ['packageManager', 'testFramework', 'repository', 'license']) expect(Object.keys(core.OPTIONAL_FIELD_LIMITS)).not.toContain(key); // BL-095: never from a request
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
      const gate = [...core.DESIGN_GATED, 'uiStyle'].includes(key) ? { hasDesignAssets: 'Yes' } : {}; // the section needs the gate (REQ-002.I.8)
      expect([key, changed({ ...base(p), ...gate }, { ...base(p), ...gate, [key]: key === 'hasDesignAssets' ? 'Yes' : sample(key) })]).toEqual([key, apiOnly && (p === 'cli' || p === 'none') ? [] : [...expected].sort()]);
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

describe('the question list the chat core takes (ui/route.js)', () => {
  it('the create body: the CLI\'s answers from flowBody(), the rest from the core', () => {
    const a: Answers = { parent: '~/dev', projectDescription: 'CRM System', projectType: 'greenfield', handle: '', language: 'typescript', framework: 'none', ide: 'vscode', apiParadigm: 'rest' };
    const list = ask(a);
    expect(route.flowBody(list.filter(q => !q.core), a)).toEqual({ parent: '~/dev', projectType: 'greenfield', handle: '', language: 'typescript', framework: 'none', ide: 'vscode', apiParadigm: 'rest' });
  });
});

describe('the Design & UI step (BL-129, REQ-002.I.8; Init\'s TEST-086)', () => {
  const saas = { projectDescription: 'CRM System', projectCategory: 'saas', apiParadigm: 'rest' };
  const design = (a: Answers) => ask(a).filter(q => q.step === 'Design & UI');
  const sent = (a: Answers) => core.requestFields(ask(a), a, 'new');
  const assets = { figmaUrl: 'https://www.figma.com/design/x', designSystem: 'shadcn/ui', designNotes: 'Colours final.' };

  it('is the ninth step, right after Security & NFR, with the five keys in order and every earlier key where it was', () => {
    expect(core.CHAT_STEPS.slice(7)).toEqual(['Security & NFR', 'Design & UI']);
    expect(core.CHAT_KEYS.slice(-5)).toEqual([['hasDesignAssets', 8], ['figmaUrl', 8], ['designSystem', 8], ['designNotes', 8], ['uiStyle', 8]]);
    expect(core.CHAT_KEYS.slice(0, -5).every(([, step]) => step < 8)).toBe(true);
  });

  it('gate No: the three asset questions are skipped and not sent, even with stale answers; UI style is still asked', () => {
    const a = { ...saas, hasDesignAssets: 'No', ...assets, uiStyle: 'Playful' };
    expect(design(a).map(q => q.key)).toEqual(['hasDesignAssets', 'uiStyle']);
    const body = sent(a);
    for (const key of core.DESIGN_GATED) expect(body).not.toHaveProperty(key);
    expect(body).toMatchObject({ hasDesignAssets: 'No', uiStyle: 'Playful' });
  });

  it('gate Yes: all four are asked and sent with their labels', () => {
    const a = { ...saas, hasDesignAssets: 'Yes', ...assets, uiStyle: 'Minimal-Clean' };
    expect(design(a).map(q => q.key)).toEqual(['hasDesignAssets', 'figmaUrl', 'designSystem', 'designNotes', 'uiStyle']);
    expect(sent(a)).toMatchObject({ hasDesignAssets: 'Yes', ...assets, uiStyle: 'Minimal-Clean' });
  });

  it('the gate changed from Yes to No: the asset answers are no longer sent', () => {
    const a = { ...saas, hasDesignAssets: 'Yes', ...assets };
    expect(sent(a)).toMatchObject(assets);
    const body = sent({ ...a, hasDesignAssets: 'No' });
    for (const key of core.DESIGN_GATED) expect(body).not.toHaveProperty(key);
  });

  it('a CLI or a library project skips the whole step and sends none of the five', () => {
    for (const [projectDescription, projectCategory] of [['CLI Tool', 'cli'], ['Library', 'library']]) {
      const a = { projectDescription, projectCategory, hasDesignAssets: 'Yes', ...assets, uiStyle: 'Playful' };
      expect(design(a)).toEqual([]);
      const body = sent(a);
      for (const key of ['hasDesignAssets', ...core.DESIGN_GATED, 'uiStyle']) expect(body).not.toHaveProperty(key);
    }
  });

  it('the option lists, bot lines and labels are Init\'s', () => {
    const q = design({ ...saas, hasDesignAssets: 'Yes' });
    expect(q.map(x => [x.label, x.chat])).toEqual([
      ['Design assets', 'Do you have existing design assets - Figma files, a design system, mockups?'],
      ['Figma', 'Got a Figma link? Optional.'],
      ['Design system', 'Which design system are the designs built on?'],
      ['Design notes', 'Anything about the designs worth noting? Optional.'],
      ['UI style', 'What UI style are you going for?'],
    ]);
    expect(q[0].options!.map(o => o.id)).toEqual(['Yes', 'No']);
    expect(q[0].required).toBe(true);
    expect(q[2].options!.map(o => o.id)).toEqual(['Material Design', 'Human Interface Guidelines', 'shadcn/ui', 'Ant Design', 'Chakra UI', 'Custom']);
    expect(q[4].options!.map(o => o.id)).toEqual(['Minimal-Clean', 'Bold-Vibrant', 'Dark-mode-first', 'Material', 'iOS-native feel', 'Corporate', 'Playful', 'Custom brand']);
  });
});
