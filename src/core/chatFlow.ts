// The chat core (BL-PM-004b, REQ-002.I.7): what init.specpilot.dev's setup chat decides, ported from
// SpecPilot.Init/src/components/chat/flow.ts and flowOptions/*.ts (at 2c694db) with the same behaviour,
// plus what only `specpilot serve` needs. It imports nothing at all: the server also sends tsc's output of
// this file to the page as /assets/chat-core.js, so the page and the tests run the same functions.

// ---------------------------------------------------------------- answers

/** The chat's answers as the page keeps them: the web's ChatAnswers values (option ids, label lists, the
 * integration map) under the web's field names, and the CLI's answers under the CLI's keys. */
export type Answers = Record<string, unknown>;

const str = (a: Answers, k: string): string => (typeof a[k] === 'string' ? (a[k] as string) : '');
const list = (a: Answers, k: string): string[] => (Array.isArray(a[k]) ? (a[k] as string[]) : []);
const map = (a: Answers, k: string): Record<string, string[]> => {
  const v = a[k];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string[]>) : {};
};

// ---------------------------------------------------------------- capabilities (capabilities.ts)

export type ProjectCategory = 'saas' | 'api' | 'mobile' | 'cli' | 'pipeline' | 'ml' | 'static' | 'docs' | 'extension' | 'library' | 'other';

export interface ProjectCapabilities {
  hasServer: boolean;
  hasWebUI: boolean;
  hasMobileUI: boolean;
  hasGraphicalUI: boolean;
  distribution: 'hosting' | 'registry' | 'appstore';
  audienceIsDevelopers: boolean;
}

const OTHER: ProjectCapabilities = { hasServer: true, hasWebUI: true, hasMobileUI: true, hasGraphicalUI: true, distribution: 'hosting', audienceIsDevelopers: false };
const CAPABILITIES: Record<ProjectCategory, ProjectCapabilities> = {
  saas: { hasServer: true, hasWebUI: true, hasMobileUI: true, hasGraphicalUI: true, distribution: 'hosting', audienceIsDevelopers: false },
  api: { hasServer: true, hasWebUI: false, hasMobileUI: false, hasGraphicalUI: false, distribution: 'hosting', audienceIsDevelopers: true },
  mobile: { hasServer: true, hasWebUI: false, hasMobileUI: true, hasGraphicalUI: true, distribution: 'hosting', audienceIsDevelopers: false },
  cli: { hasServer: false, hasWebUI: false, hasMobileUI: false, hasGraphicalUI: false, distribution: 'registry', audienceIsDevelopers: true },
  pipeline: { hasServer: true, hasWebUI: false, hasMobileUI: false, hasGraphicalUI: false, distribution: 'hosting', audienceIsDevelopers: true },
  ml: { hasServer: true, hasWebUI: false, hasMobileUI: false, hasGraphicalUI: false, distribution: 'hosting', audienceIsDevelopers: true },
  static: { hasServer: false, hasWebUI: true, hasMobileUI: false, hasGraphicalUI: true, distribution: 'hosting', audienceIsDevelopers: false },
  docs: { hasServer: false, hasWebUI: true, hasMobileUI: false, hasGraphicalUI: true, distribution: 'hosting', audienceIsDevelopers: true },
  extension: { hasServer: false, hasWebUI: false, hasMobileUI: false, hasGraphicalUI: true, distribution: 'appstore', audienceIsDevelopers: false },
  library: { hasServer: false, hasWebUI: false, hasMobileUI: false, hasGraphicalUI: false, distribution: 'registry', audienceIsDevelopers: true },
  other: OTHER,
};

/** No category (free text, or guided setup) falls back to 'other': show and allow everything. */
export function getCapabilities(category: ProjectCategory | null | undefined): ProjectCapabilities {
  return category ? CAPABILITIES[category] : OTHER;
}

// ---------------------------------------------------------------- project description (projectOptions.ts)

export const STARTER_GROUPS: { group: string; items: { emoji: string; label: string }[] }[] = [
  {
    group: 'APPS & PRODUCTS',
    items: [
      { emoji: '✅', label: 'Task / Project Manager' }, { emoji: '🛒', label: 'E-commerce Store' }, { emoji: '🤝', label: 'CRM System' },
      { emoji: '🏥', label: 'Healthcare / Clinic App' }, { emoji: '📅', label: 'Booking / Scheduling' }, { emoji: '🎓', label: 'Learning Platform' },
      { emoji: '💬', label: 'Social / Community App' }, { emoji: '📰', label: 'News / Blog / CMS' }, { emoji: '📊', label: 'Admin Dashboard' },
      { emoji: '🤖', label: 'AI Chatbot / Assistant' }, { emoji: '🏬', label: 'Marketplace' }, { emoji: '💳', label: 'Subscription SaaS' },
    ],
  },
  {
    group: 'SIMPLER / COMMON',
    items: [
      { emoji: '🌐', label: 'Static Website' }, { emoji: '⚡', label: 'Single Page App (SPA)' }, { emoji: '🎯', label: 'Landing Page' },
      { emoji: '🖼️', label: 'Portfolio Site' }, { emoji: '📚', label: 'Documentation Site' }, { emoji: '🏢', label: 'Company Intranet' },
      { emoji: '🛠️', label: 'Internal Tool' }, { emoji: '🧩', label: 'Browser Extension' }, { emoji: '🧩', label: 'Chrome Extension' },
    ],
  },
  {
    group: 'DEVELOPER / DATA',
    items: [
      { emoji: '🔌', label: 'REST API / Backend' }, { emoji: '📡', label: 'GraphQL API' }, { emoji: '⌨️', label: 'CLI Tool' },
      { emoji: '🔄', label: 'Data Pipeline' }, { emoji: '🧠', label: 'ML / AI Service' }, { emoji: '🪝', label: 'Webhook Service' },
      { emoji: '🗂️', label: 'Monorepo / Library' }, { emoji: '📦', label: 'SDK / npm Package' },
    ],
  },
];

const CATEGORY_BY_LABEL: Record<string, ProjectCategory> = {
  'Task / Project Manager': 'saas', 'E-commerce Store': 'saas', 'CRM System': 'saas', 'Healthcare / Clinic App': 'saas',
  'Booking / Scheduling': 'saas', 'Learning Platform': 'saas', 'Social / Community App': 'saas', 'News / Blog / CMS': 'saas',
  'Admin Dashboard': 'saas', 'AI Chatbot / Assistant': 'saas', Marketplace: 'saas', 'Subscription SaaS': 'saas',
  'Static Website': 'static', 'Single Page App (SPA)': 'saas', 'Landing Page': 'static', 'Portfolio Site': 'static',
  'Documentation Site': 'docs', 'Company Intranet': 'saas', 'Internal Tool': 'saas', 'Browser Extension': 'extension',
  'Chrome Extension': 'extension', 'REST API / Backend': 'api', 'GraphQL API': 'api', 'CLI Tool': 'cli', 'Data Pipeline': 'pipeline',
  'ML / AI Service': 'ml', 'Webhook Service': 'api', 'Monorepo / Library': 'library', 'SDK / npm Package': 'library',
};

/** Keyed on the exact starter-chip label; free text stays uncategorized (null). */
export function inferProjectCategory(description: string): ProjectCategory | null {
  return CATEGORY_BY_LABEL[description] ?? null;
}

// ---------------------------------------------------------------- platforms (platformOptions.ts)

export type PlatformItem = { id: string; label: string; lang: string; emoji?: string };

export const PLATFORM_GROUPS: { group: string; emoji: string; items: PlatformItem[] }[] = [
  { group: 'MOBILE', emoji: '📱', items: [
    { id: 'ios', label: 'iOS Native', lang: 'Swift' }, { id: 'android', label: 'Android Native', lang: 'Kotlin' },
    { id: 'rn', label: 'React Native', lang: 'JS / TS' }, { id: 'flutter', label: 'Flutter', lang: 'Dart' },
    { id: 'kmp', label: 'Kotlin Multiplatform', lang: 'Kotlin' },
  ] },
  { group: 'WEB FRONTEND', emoji: '🌐', items: [
    { id: 'react', label: 'React', lang: 'TS / JS' }, { id: 'nextjs', label: 'Next.js', lang: 'TS / JS' },
    { id: 'angular', label: 'Angular', lang: 'TS' }, { id: 'vue', label: 'Vue / Nuxt', lang: 'TS / JS' },
    { id: 'svelte', label: 'SvelteKit', lang: 'TS / JS' },
  ] },
  { group: 'BACKEND', emoji: '⚙', items: [
    { id: 'node', label: 'Node.js / Express', lang: 'TS / JS' }, { id: 'fastapi', label: 'FastAPI', lang: 'Python' },
    { id: 'django', label: 'Django', lang: 'Python' }, { id: 'spring', label: 'Spring Boot', lang: 'Kotlin / Java' },
    { id: 'dotnet', label: '.NET / ASP.NET', lang: 'C#' }, { id: 'laravel', label: 'Laravel', lang: 'PHP' },
  ] },
  { group: 'FULL STACK BUNDLES', emoji: '🚀', items: [
    { id: 't3', label: 'T3 Stack', lang: 'TS' }, { id: 'mern', label: 'MERN Stack', lang: 'JS / TS', emoji: '🌱' },
    { id: 'supabase', label: 'Supabase Stack', lang: 'TS / JS' }, { id: 'firebase', label: 'Firebase', lang: 'TS / JS' },
    { id: 'amplify', label: 'AWS Amplify', lang: 'TS / JS' }, { id: 'appwrite', label: 'Appwrite', lang: 'TS / JS', emoji: '🔺' },
  ] },
  { group: 'CLI FRAMEWORKS', emoji: '⌨️', items: [
    { id: 'commander', label: 'Node.js (Commander / Ink)', lang: 'TypeScript / JavaScript' }, { id: 'click', label: 'Python (Click / Typer)', lang: 'Python' },
    { id: 'cobra', label: 'Go (Cobra)', lang: 'Go' }, { id: 'clap', label: 'Rust (Clap)', lang: 'Rust' }, { id: 'shell', label: 'Shell script', lang: 'Bash' },
  ] },
  { group: 'EXTENSION FRAMEWORKS', emoji: '🧩', items: [
    { id: 'plasmo', label: 'Plasmo', lang: 'TypeScript / React' }, { id: 'wxt', label: 'WXT', lang: 'TypeScript' },
    { id: 'crxjs', label: 'CRXJS (Vite)', lang: 'TypeScript / JavaScript' }, { id: 'vanilla-mv3', label: 'Vanilla Manifest V3', lang: 'JavaScript / TypeScript', emoji: '📄' },
  ] },
  { group: 'LANGUAGE / PACKAGE', emoji: '📦', items: [
    { id: 'npm-ts', label: 'TypeScript (npm)', lang: 'TypeScript' }, { id: 'py-pypi', label: 'Python (PyPI)', lang: 'Python' },
    { id: 'go-mod', label: 'Go module', lang: 'Go' }, { id: 'rust-crate', label: 'Rust crate', lang: 'Rust' },
    { id: 'java-maven', label: 'Java (Maven / Gradle)', lang: 'Java / Kotlin' },
  ] },
  { group: 'DATA PIPELINE TOOLS', emoji: '🔄', items: [
    { id: 'airflow', label: 'Airflow', lang: 'Python' }, { id: 'dagster', label: 'Dagster', lang: 'Python' },
    { id: 'prefect', label: 'Prefect', lang: 'Python' }, { id: 'dbt', label: 'dbt', lang: 'SQL / Python' },
    { id: 'cron', label: 'Plain Python / cron script', lang: 'Python', emoji: '⏰' },
  ] },
  { group: 'DOCS FRAMEWORKS', emoji: '📚', items: [
    { id: 'docusaurus', label: 'Docusaurus', lang: 'TypeScript / React' }, { id: 'vitepress', label: 'VitePress', lang: 'TypeScript / Vue' },
    { id: 'mkdocs', label: 'MkDocs', lang: 'Python', emoji: '📘' }, { id: 'mintlify', label: 'Mintlify', lang: 'MDX' },
  ] },
];

const groupIds = (group: string) => PLATFORM_GROUPS.find(g => g.group === group)?.items.map(i => i.id) ?? [];
const PLATFORM_GROUP: Record<string, string> = Object.fromEntries(PLATFORM_GROUPS.flatMap(g => g.items.map(i => [i.id, g.group])));

/** Bundles that include their own frontend (T3 = Next.js, MERN = React). */
export const BUNDLES_INCLUDE_FRONTEND = ['t3', 'mern'];
/** Backend-as-a-service bundles: they bring hosting, a database and auth. */
export const BAAS_BUNDLES = ['supabase', 'firebase', 'amplify', 'appwrite'];

export function hasMobilePlatform(platforms: string[]): boolean {
  const ids = groupIds('MOBILE');
  return platforms.some(p => ids.includes(p));
}

export function hasBaasPlatform(platforms: string[]): boolean {
  return platforms.some(p => BAAS_BUNDLES.includes(p));
}

/** The platform groups a category shows. */
export function visiblePlatformGroups(category: ProjectCategory | null): string[] {
  const cap = getCapabilities(category);
  const groups: string[] = [];
  if (cap.hasMobileUI) groups.push('MOBILE');
  if (cap.hasWebUI) groups.push('WEB FRONTEND');
  if (cap.hasServer) groups.push('BACKEND');
  if (cap.hasServer && (cap.hasWebUI || cap.hasMobileUI)) groups.push('FULL STACK BUNDLES');
  if (category === 'cli') groups.push('CLI FRAMEWORKS');
  if (category === 'extension') groups.push('EXTENSION FRAMEWORKS');
  if (category === 'library') groups.push('LANGUAGE / PACKAGE');
  if (category === 'pipeline') groups.push('DATA PIPELINE TOOLS');
  if (category === 'docs') groups.push('DOCS FRAMEWORKS');
  return groups;
}

/** One pick per group; a bundle replaces a backend pick (and a web pick when it bundles a frontend), and back. */
export function togglePlatform(platforms: string[], id: string): string[] {
  const ids = groupIds(PLATFORM_GROUP[id]);
  const withoutGroup = platforms.filter(p => !ids.includes(p));
  const isDeselecting = platforms.includes(id);
  let next = isDeselecting ? withoutGroup : [...withoutGroup, id];
  const bundleIds = groupIds('FULL STACK BUNDLES');
  const webIds = groupIds('WEB FRONTEND');
  const backendIds = groupIds('BACKEND');
  if (!isDeselecting && bundleIds.includes(id)) {
    next = next.filter(p => !backendIds.includes(p) && !(BUNDLES_INCLUDE_FRONTEND.includes(id) && webIds.includes(p)));
  } else if (!isDeselecting && backendIds.includes(id)) {
    next = next.filter(p => !bundleIds.includes(p));
  } else if (!isDeselecting && webIds.includes(id)) {
    next = next.filter(p => !(bundleIds.includes(p) && BUNDLES_INCLUDE_FRONTEND.includes(p)));
  }
  return next;
}

/** The groups the grid shows now: a bundle hides Backend, a frontend bundle hides Web frontend too. */
export function platformGridGroups(category: ProjectCategory | null, platforms: string[]): string[] {
  const bundleSelected = platforms.some(p => groupIds('FULL STACK BUNDLES').includes(p));
  const frontendBundle = platforms.some(p => BUNDLES_INCLUDE_FRONTEND.includes(p));
  return visiblePlatformGroups(category).filter(g => !(bundleSelected && g === 'BACKEND') && !(frontendBundle && g === 'WEB FRONTEND'));
}

/** The line under the grid when a bundle is picked, or ''. */
export function bundleLine(platforms: string[]): string {
  if (!platforms.some(p => groupIds('FULL STACK BUNDLES').includes(p))) return '';
  return platforms.some(p => BUNDLES_INCLUDE_FRONTEND.includes(p))
    ? 'ℹ Web Frontend and Backend are covered by your bundle.'
    : 'ℹ Backend is covered by your bundle - pick a Web Frontend too if you need one.';
}

const ECOSYSTEM: Record<string, string> = {
  ios: 'swift', android: 'kotlin', rn: 'jsts', flutter: 'dart', kmp: 'kotlin', react: 'jsts', nextjs: 'jsts', angular: 'jsts', vue: 'jsts', svelte: 'jsts',
  node: 'jsts', fastapi: 'python', django: 'python', spring: 'kotlin', dotnet: 'csharp', laravel: 'php', t3: 'jsts', mern: 'jsts', supabase: 'jsts',
  firebase: 'jsts', amplify: 'jsts', appwrite: 'jsts', commander: 'jsts', click: 'python', cobra: 'go', clap: 'rust', shell: 'bash',
  plasmo: 'jsts', wxt: 'jsts', crxjs: 'jsts', 'vanilla-mv3': 'jsts', 'npm-ts': 'jsts', 'py-pypi': 'python', 'go-mod': 'go', 'rust-crate': 'rust', 'java-maven': 'kotlin',
  airflow: 'python', dagster: 'python', prefect: 'python', dbt: 'python', cron: 'python', docusaurus: 'jsts', vitepress: 'jsts', mkdocs: 'python', mintlify: 'jsts',
};
const ECOSYSTEM_LABEL: Record<string, string> = {
  swift: 'Swift', kotlin: 'Kotlin / Java', jsts: 'TypeScript / JavaScript', dart: 'Dart', python: 'Python', csharp: 'C#', php: 'PHP', go: 'Go', rust: 'Rust', bash: 'Bash',
};

/** The note after the platforms answer, or null. */
export function getPlatformNote(platforms: string[]): { tone: 'info' | 'warn' | 'success'; text: string } | null {
  const bundleIds = groupIds('FULL STACK BUNDLES');
  const webIds = groupIds('WEB FRONTEND');
  const backendIds = groupIds('BACKEND');
  const bundleSelected = platforms.some(p => bundleIds.includes(p));
  const isMultiGroup = PLATFORM_GROUPS.filter(g => g.items.some(i => platforms.includes(i.id))).length >= 2;
  const ecosystems = [...new Set(platforms.map(p => ECOSYSTEM[p]).filter(Boolean))];
  const backendPlatformSelected = platforms.some(p => backendIds.includes(p));
  const hasWebFrontend = platforms.some(p => webIds.includes(p));
  const rnWithWeb = platforms.includes('rn') && (hasWebFrontend || bundleSelected);
  if (isMultiGroup) {
    if (rnWithWeb) return { tone: 'success', text: 'React Native + web is the best monorepo candidate - shared TypeScript, hooks, and types. Expo Router + Next.js in a Turborepo with a packages/ directory is the go-to setup.' };
    if (ecosystems.length === 1) return { tone: 'success', text: `Monorepo-friendly - all selected platforms share ${ECOSYSTEM_LABEL[ecosystems[0]]}. Consider Turborepo or Nx to manage shared workspaces.` };
    return { tone: 'warn', text: `Cross-ecosystem: ${ecosystems.map(e => ECOSYSTEM_LABEL[e]).join(' + ')}. These platforms can't share code and will likely live in separate repos - I'll generate separate spec sections for each.` };
  }
  if (hasMobilePlatform(platforms) && !(backendPlatformSelected || bundleSelected)) {
    return { tone: 'warn', text: 'Mobile apps typically need a data layer - consider adding a backend or picking a Full Stack Bundle (Supabase Stack is popular for mobile).' };
  }
  if (platforms.some(p => ['nextjs', 'svelte'].includes(p)) && backendPlatformSelected) {
    return { tone: 'info', text: `${platforms.includes('nextjs') ? 'Next.js' : 'SvelteKit'} has built-in API routes - a separate backend is optional unless you need an independent service.` };
  }
  return null;
}

// ---------------------------------------------------------------- platform → CLI language (the App's own, REQ-002.H.28)

/** Platform id → [CLI language, CLI framework or null]; absent = no CLI language (Dart, C#, PHP, Go, Rust, Bash, MDX). */
export const PLATFORM_LANGUAGE: Record<string, [string, string | null]> = {
  ios: ['swift', 'ios'], android: ['kotlin', 'android'], kmp: ['kotlin', null],
  rn: ['typescript', null], svelte: ['typescript', null], supabase: ['typescript', null], firebase: ['typescript', null], amplify: ['typescript', null],
  appwrite: ['typescript', null], commander: ['typescript', null], wxt: ['typescript', null], crxjs: ['typescript', null], plasmo: ['typescript', null],
  'vanilla-mv3': ['typescript', null], 'npm-ts': ['typescript', null], docusaurus: ['typescript', null], vitepress: ['typescript', null],
  react: ['typescript', 'react'], nextjs: ['typescript', 'next'], angular: ['typescript', 'angular'], vue: ['typescript', 'vue'],
  node: ['typescript', 'express'], mern: ['typescript', 'express'], t3: ['typescript', 'next'],
  fastapi: ['python', 'fastapi'], django: ['python', 'django'],
  click: ['python', null], 'py-pypi': ['python', null], airflow: ['python', null], dagster: ['python', null], prefect: ['python', null],
  dbt: ['python', null], cron: ['python', null], mkdocs: ['python', null],
  spring: ['kotlin', 'spring'], 'java-maven': ['kotlin', null],
};
const UNSUPPORTED_LANGUAGE: Record<string, string> = {
  flutter: 'Dart', dotnet: 'C#', laravel: 'PHP', cobra: 'Go', 'go-mod': 'Go', clap: 'Rust', 'rust-crate': 'Rust', shell: 'Bash', mintlify: 'MDX',
};
const LANGUAGE_NAME: Record<string, string> = { typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', kotlin: 'Kotlin', swift: 'Swift' };
/** Tab priority for the pre-selection when the platforms imply two languages (the developer's answer, 2026-10-07). */
const GROUP_PRIORITY = ['BACKEND', 'FULL STACK BUNDLES', 'WEB FRONTEND', 'MOBILE'];
const priority = (id: string) => {
  const i = GROUP_PRIORITY.indexOf(PLATFORM_GROUP[id]);
  return i < 0 ? GROUP_PRIORITY.length : i;
};

/** What the platforms say about the CLI's language and framework questions. */
export function languageHints(platforms: string[], language?: string): {
  languages: string[];
  language: string | undefined;
  frameworks: string[];
  framework: string | undefined;
  note: string;
} {
  const mapped = platforms.filter(p => PLATFORM_LANGUAGE[p]).sort((a, b) => priority(a) - priority(b));
  const languages = [...new Set(mapped.map(p => PLATFORM_LANGUAGE[p][0]))];
  const top = mapped[0];
  const chosen = language ?? (top ? PLATFORM_LANGUAGE[top][0] : undefined);
  const sameLanguage = mapped.filter(p => PLATFORM_LANGUAGE[p][0] === chosen);
  const frameworks = [...new Set(sameLanguage.map(p => PLATFORM_LANGUAGE[p][1]).filter((f): f is string => !!f))];
  const notes: string[] = [];
  if (languages.length > 1) {
    const names = languages.map(l => LANGUAGE_NAME[l]);
    notes.push(`Your platforms use ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. SpecPilot writes one language into project.yaml: pick the main one. Every platform is still listed under platforms.`);
  }
  const unsupported = [...new Set(platforms.map(p => UNSUPPORTED_LANGUAGE[p]).filter(Boolean))];
  if (unsupported.length) notes.push(`SpecPilot has no ${unsupported.join(' or ')} templates yet. Pick the closest language; your platforms are listed as you picked them.`);
  return {
    languages,
    language: top ? PLATFORM_LANGUAGE[top][0] : undefined,
    frameworks,
    framework: sameLanguage.map(p => PLATFORM_LANGUAGE[p][1]).find((f): f is string => !!f),
    note: notes.join(' '),
  };
}

// ---------------------------------------------------------------- users (userOptions.ts)

export const USER_TYPE_GROUPS: { group: string; items: { emoji: string; label: string }[] }[] = [
  { group: 'CONSUMERS', items: [{ emoji: '👥', label: 'Customers' }, { emoji: '🌍', label: 'General Public' }, { emoji: '👶', label: 'Children' }, { emoji: '🎓', label: 'Students' }, { emoji: '👨‍👩‍👧', label: 'Parents' }] },
  { group: 'ENTERPRISE', items: [{ emoji: '💼', label: 'Employees' }, { emoji: '📊', label: 'Managers' }, { emoji: '🔧', label: 'Admins' }, { emoji: '💻', label: 'Developers' }, { emoji: '🏢', label: 'Enterprise Users' }] },
  { group: 'DOMAIN', items: [{ emoji: '🏥', label: 'Patients' }, { emoji: '👨‍⚕️', label: 'Doctors / Clinicians' }, { emoji: '👩‍🏫', label: 'Teachers' }, { emoji: '⛪', label: 'Church Members' }] },
];

export function visibleUserTypeGroups(category: ProjectCategory | null): typeof USER_TYPE_GROUPS {
  return getCapabilities(category).audienceIsDevelopers ? USER_TYPE_GROUPS.filter(g => g.group === 'ENTERPRISE') : USER_TYPE_GROUPS;
}

export const ACCESS_OPTIONS = [
  { id: 'public', emoji: '🌍', label: 'Public - no login' },
  { id: 'login', emoji: '🔐', label: 'Login required' },
  { id: 'role', emoji: '🎭', label: 'Role-based access' },
  { id: 'multitenant', emoji: '🏢', label: 'Multi-tenant / team-based' },
  { id: 'unsure', emoji: '❓', label: 'Not sure → TODO', isTodo: true },
];

export const SPECIAL_OPTIONS = [
  { id: 'a11y', emoji: '♿', label: 'Accessibility (WCAG)' },
  { id: 'i18n', emoji: '🌐', label: 'Multi-language / i18n' },
  { id: 'offline', emoji: '📱', label: 'Low-bandwidth / offline' },
  { id: 'child', emoji: '👶', label: 'Child-safe content' },
  { id: 'sensitive', emoji: '🔏', label: 'High data sensitivity' },
];

// ---------------------------------------------------------------- scale (scaleOptions.ts)

export const SCALE_TIERS = [
  { id: 'prototype', emoji: '🧪', title: 'Prototype', description: 'Solo dev, fast iteration, minimal infra' },
  { id: 'startup', emoji: '🚀', title: 'Startup', description: '1K–50K users, growth-focused', badge: 'recommended' as const },
  { id: 'scaleup', emoji: '📈', title: 'Scale-up', description: '50K–500K users, team 5–20 devs' },
  { id: 'enterprise', emoji: '🏛️', title: 'Enterprise', description: '500K+ users, compliance requirements' },
];

export const TIMELINES = [
  { id: '1-3m', emoji: '⚡', label: '1–3 months' }, { id: '3-6m', emoji: '🏃', label: '3–6 months' },
  { id: '6-12m', emoji: '🚶', label: '6–12 months' }, { id: '12m+', emoji: '🐢', label: '12+ months' },
  { id: 'noidea', emoji: '❓', label: 'No idea → TODO', isTodo: true },
];

export const USER_RANGES = [
  { id: '< 100', emoji: '🌱', label: '< 100' }, { id: '100–1K', emoji: '🌿', label: '100–1K' }, { id: '1K–50K', emoji: '🌳', label: '1K–50K' },
  { id: '50K–500K', emoji: '🌲', label: '50K–500K' }, { id: '500K+', emoji: '🌍', label: '500K+' }, { id: 'noidea', emoji: '❓', label: 'No idea → TODO', isTodo: true },
];

export const DEPLOY_TARGETS: { label: string; emoji?: string; description?: string; group?: string }[] = [
  { label: 'AWS', description: 'Raw cloud infrastructure - EC2/ECS/Lambda, you assemble and operate the stack', group: 'CLOUD' },
  { label: 'GCP', description: 'Raw cloud infrastructure - Compute/Cloud Run/Functions, you assemble the stack', group: 'CLOUD' },
  { label: 'Azure', description: 'Raw cloud infrastructure - App Service/Functions, common in Microsoft/.NET shops', group: 'CLOUD' },
  { label: 'Self-hosted', emoji: '🏠', description: 'Your own servers or a VPS - full control, you handle uptime, scaling, and patching', group: 'CLOUD' },
  { label: 'Vercel', description: 'Managed platform - git-push deploys, built for Next.js and frontend frameworks', group: 'PLATFORM' },
  { label: 'Netlify', description: 'Managed platform - git-push deploys for static sites and serverless functions', group: 'PLATFORM' },
  { label: 'Railway', description: 'Managed platform - runs long-lived servers and databases with minimal config', group: 'PLATFORM' },
  { label: 'Fly.io', description: 'Managed platform - runs containers close to users, good for always-on servers', group: 'PLATFORM' },
  { label: 'Cloudflare Pages', description: 'Managed platform - static sites and frontend frameworks on Cloudflare\'s edge', group: 'PLATFORM' },
  { label: 'Cloudflare Workers', description: 'Managed platform - serverless functions at the edge, pairs with D1/R2/KV', group: 'PLATFORM' },
  { label: 'Supabase', description: 'Backend-as-a-service - Postgres, auth, storage, and realtime hosted together', group: 'BAAS' },
  { label: 'Firebase Hosting', description: 'Backend-as-a-service - Google-hosted, pairs with Firestore and Firebase Auth', group: 'BAAS' },
  { label: 'AWS Amplify Hosting', description: 'Backend-as-a-service - AWS-hosted, pairs with Amplify DataStore and Amplify Auth', group: 'BAAS' },
  { label: 'Appwrite Cloud', description: 'Backend-as-a-service - hosted Appwrite, bundles database, auth, and storage', group: 'BAAS' },
  { label: 'App Store', description: 'Apple\'s iOS/iPadOS store - review process, yearly developer account fee', group: 'MOBILE STORES' },
  { label: 'Google Play', description: 'Android\'s store - review process, one-time developer account fee', group: 'MOBILE STORES' },
  { label: 'Undecided', emoji: '❓', description: 'Not chosen yet - recorded as a TODO in the generated specs', group: 'CLOUD' },
];

/** BaaS platform → the deploy target it implies (badge and seed). */
export const BAAS_DEPLOY_TARGET: Record<string, string> = { supabase: 'Supabase', firebase: 'Firebase Hosting', amplify: 'AWS Amplify Hosting', appwrite: 'Appwrite Cloud' };

export const REGISTRY_DEPLOY_TARGETS = [{ label: 'npm' }, { label: 'PyPI' }, { label: 'Homebrew' }, { label: 'crates.io' }, { label: 'GitHub Releases' }, { label: 'Undecided', emoji: '❓' }];
export const APPSTORE_DEPLOY_TARGETS = [{ label: 'Chrome Web Store' }, { label: 'Firefox Add-ons' }, { label: 'Edge Add-ons' }, { label: 'Undecided', emoji: '❓' }];

export const TEAM_SIZES = [
  { id: 'solo', emoji: '🧑‍💻', label: 'Solo dev' }, { id: '2-5', emoji: '👥', label: '2–5 devs' },
  { id: '5-15', emoji: '👨‍👩‍👧‍👦', label: '5–15 devs' }, { id: '15+', emoji: '🏢', label: '15+ devs' },
];

/** The deploy targets for a category and its platforms (registry, store, or hosting without the tabs the platforms rule out). */
export function deployTargetOptions(category: ProjectCategory | null, platforms: string[]): { label: string; emoji?: string; description?: string; group?: string }[] {
  const cap = getCapabilities(category);
  if (cap.distribution === 'registry') return REGISTRY_DEPLOY_TARGETS;
  if (cap.distribution === 'appstore') return APPSTORE_DEPLOY_TARGETS;
  const answered = platforms.length > 0;
  const showMobileStores = cap.hasMobileUI && (!answered || hasMobilePlatform(platforms));
  const showBaas = !answered || hasBaasPlatform(platforms);
  return DEPLOY_TARGETS.filter(t => (t.group !== 'MOBILE STORES' || showMobileStores) && (t.group !== 'BAAS' || showBaas));
}

// ---------------------------------------------------------------- architecture (architectureOptions.ts)

export type Badges = Record<string, 'recommended' | 'flagged' | undefined>;
export type Warnings = Record<string, string | undefined>;

export function getArchBadge(scaleTier: string, teamSize: string): Badges {
  const solo = teamSize === 'solo';
  const small = teamSize === '2-5';
  const large = teamSize === '5-15' || teamSize === '15+';
  if (solo || (small && (scaleTier === 'prototype' || scaleTier === 'startup'))) return { monolith: 'recommended' };
  if (small && scaleTier === 'scaleup') return { monolith: 'recommended', modular: 'recommended' };
  if (large && (scaleTier === 'scaleup' || scaleTier === 'enterprise')) return { modular: 'recommended', microservices: 'flagged' };
  return { monolith: 'recommended' };
}

const API_STYLE_BY_DESCRIPTION: Record<string, string> = { 'GraphQL API': 'graphql', 'REST API / Backend': 'rest' };

/** The web's API style badge; its `rest` and `graphql` are the CLI paradigm values of the same name. */
export function getApiBadge(scaleTier: string, projectDescription = ''): Badges {
  const fromDescription = API_STYLE_BY_DESCRIPTION[projectDescription];
  if (fromDescription) return { [fromDescription]: 'recommended' };
  if (scaleTier === 'enterprise') return { graphql: 'recommended' };
  return { rest: 'recommended' };
}

const BAAS_DATABASE: Record<string, string> = { supabase: 'Supabase', firebase: 'Firestore', amplify: 'Amplify DataStore' };
const BAAS_AUTH: Record<string, string> = { supabase: 'Supabase Auth', firebase: 'Firebase Auth', amplify: 'Amplify Auth' };
const baasBadge = (platforms: string[], m: Record<string, string>): Badges => {
  const match = platforms.map(p => m[p]).find(Boolean);
  return match ? { [match]: 'recommended' } : {};
};
export const getDatabaseBadge = (platforms: string[]): Badges => baasBadge(platforms, BAAS_DATABASE);
export const getAuthBadge = (platforms: string[]): Badges => baasBadge(platforms, BAAS_AUTH);

const VENDOR_LOCKED_DATABASES: Record<string, string> = {
  'Amazon RDS': 'AWS', DynamoDB: 'AWS', 'Amazon ElastiCache': 'AWS', 'Amplify DataStore': 'AWS', 'Google Cloud SQL': 'GCP', Firestore: 'GCP', 'Azure SQL Database': 'Azure',
};
const CLOUDFLARE_DATABASES = ['Cloudflare D1'];
const VECTOR_DATABASES = ['Pinecone', 'Weaviate', 'Chroma', 'pgvector (Postgres)'];

const aiSelected = (a: Answers) => (map(a, 'integrations').ai ?? []).some(v => v !== 'None');

export function getDatabaseMismatch(a: Answers): Warnings {
  const result: Warnings = {};
  const targets = new Set(list(a, 'deploymentTargets'));
  for (const [label, vendor] of Object.entries(VENDOR_LOCKED_DATABASES)) if (!targets.has(vendor)) result[label] = `Deploy target is not ${vendor}`;
  if (!targets.has('Cloudflare Pages') && !targets.has('Cloudflare Workers')) for (const label of CLOUDFLARE_DATABASES) result[label] = 'Deploy target is not Cloudflare';
  if (!aiSelected(a) && a.projectCategory !== 'ml') for (const label of VECTOR_DATABASES) result[label] = 'No AI/LLM integration selected';
  return result;
}

export const SYSTEM_PATTERNS = [
  { id: 'monolith', emoji: '🧱', title: 'Monolith', description: 'Single deploy, simple ops' },
  { id: 'modular', emoji: '🧩', title: 'Modular Monolith', description: 'Domain modules, deploy as one' },
  { id: 'microservices', emoji: '🕸️', title: 'Microservices', description: 'Independent services, complex ops' },
];

export const DATABASES: { label: string; emoji?: string; description?: string; isTodo?: boolean; group?: string }[] = [
  { label: 'PostgreSQL', description: 'SQL - general-purpose relational database, the safe default for structured data', group: 'SQL' },
  { label: 'MySQL', description: 'SQL - relational database, common in traditional hosting/WordPress-adjacent stacks', group: 'SQL' },
  { label: 'SQLite', description: 'SQL - file-based, zero setup, best for local/small-scale or embedded use', group: 'SQL' },
  { label: 'Amazon RDS', emoji: '🟧', description: 'Managed SQL - AWS-hosted Postgres/MySQL/SQL Server/etc., handles backups, patching, and scaling', group: 'MANAGED SQL' },
  { label: 'Google Cloud SQL', emoji: '🔵', description: 'Managed SQL - GCP-hosted Postgres/MySQL/SQL Server, integrates with the rest of GCP', group: 'MANAGED SQL' },
  { label: 'Azure SQL Database', emoji: '🔷', description: 'Managed SQL - Microsoft-hosted SQL Server, integrates with the rest of Azure', group: 'MANAGED SQL' },
  { label: 'Cloudflare D1', description: 'Managed SQL (SQLite-based) - serverless, runs at the edge alongside Cloudflare Workers', group: 'MANAGED SQL' },
  { label: 'Supabase', description: 'Managed SQL (Postgres) - managed, with built-in auth/storage/realtime bundled in', group: 'MANAGED SQL' },
  { label: 'SQL Server', emoji: '🗄️', description: 'SQL - Microsoft-managed relational database, common in enterprise/.NET stacks', group: 'SQL' },
  { label: 'Oracle', emoji: '🗄️', description: 'SQL - enterprise relational database, common where it\'s already the corporate standard', group: 'SQL' },
  { label: 'MongoDB', description: 'NoSQL - flexible document storage, good when your data shape varies or evolves fast', group: 'NoSQL' },
  { label: 'DynamoDB', description: 'NoSQL - AWS-managed key-value/document store, scales automatically', group: 'NoSQL' },
  { label: 'Firestore', description: 'NoSQL - Google-managed document store, pairs with Firebase Auth', group: 'NoSQL' },
  { label: 'Amplify DataStore', description: 'NoSQL - AWS-managed, pairs with Amplify Auth, offline-first sync built in', group: 'NoSQL' },
  { label: 'Redis', emoji: '🟥', description: 'Cache / key-value - in-memory store, common for caching, sessions, and rate limiting', group: 'CACHE / KEY-VALUE' },
  { label: 'Amazon ElastiCache', emoji: '🟧', description: 'Cache / key-value - AWS-managed Redis or Memcached, handles patching and scaling', group: 'CACHE / KEY-VALUE' },
  { label: 'Memcached', emoji: '⚡', description: 'Cache / key-value - simple, high-performance in-memory cache', group: 'CACHE / KEY-VALUE' },
  { label: 'Upstash', emoji: '🔺', description: 'Cache / key-value - serverless Redis, pay-per-request, no server to manage', group: 'CACHE / KEY-VALUE' },
  { label: 'Pinecone', description: 'Vector - fully managed vector database, purpose-built for similarity search at scale', group: 'VECTOR' },
  { label: 'Weaviate', emoji: '🕸️', description: 'Vector - open-source vector database with built-in hybrid search', group: 'VECTOR' },
  { label: 'Chroma', description: 'Vector - lightweight, embeddable vector database, easy to self-host', group: 'VECTOR' },
  { label: 'pgvector (Postgres)', description: 'Vector - adds vector search to Postgres, good if you already run Postgres', group: 'VECTOR' },
  { label: 'Not sure → TODO', emoji: '❓', isTodo: true },
];

export const AUTH_OPTIONS: { label: string; emoji?: string; description?: string; isTodo?: boolean; group?: string }[] = [
  { label: 'JWT', description: 'Protocol - you build and manage the tokens/sessions yourself, full control', group: 'PROTOCOL' },
  { label: 'OAuth 2.0', emoji: '🔐', description: 'Protocol - "Sign in with Google/GitHub/etc.", you still host the integration', group: 'PROTOCOL' },
  { label: 'SAML / SSO', description: 'Protocol - enterprise single sign-on, usually required by corporate customers', group: 'PROTOCOL' },
  { label: 'Clerk', description: 'Managed service - drop-in login UI and user management, you don’t build auth', group: 'MANAGED SERVICE' },
  { label: 'Auth0', description: 'Managed service - enterprise-grade hosted auth, you don’t build it yourself', group: 'MANAGED SERVICE' },
  { label: 'Firebase Auth', description: 'Managed service - Google-hosted auth, pairs naturally with Firestore', group: 'MANAGED SERVICE' },
  { label: 'Supabase Auth', description: 'Managed service - bundled with Supabase’s Postgres database', group: 'MANAGED SERVICE' },
  { label: 'AWS Cognito', description: 'Managed service - AWS-hosted user pools and identity federation', group: 'MANAGED SERVICE' },
  { label: 'Amplify Auth', description: 'Managed service - AWS Amplify’s auth layer, pairs with Amplify DataStore', group: 'MANAGED SERVICE' },
  { label: 'Not sure → TODO', emoji: '❓', isTodo: true },
];

export const REALTIME_TYPES = [
  { label: 'WebSockets', emoji: '🔌', description: 'Full two-way live connection - best for chat, multiplayer, collaborative editing' },
  { label: 'Server-Sent Events', emoji: '📡', description: 'One-way live updates from server to client - good for feeds, notifications' },
  { label: 'Polling', emoji: '🔄', description: 'Client checks for updates on a timer - simplest to build, less instant' },
];

type LocalDatabaseOption = { label: string; emoji?: string; description?: string };
const REALM = { label: 'Realm', emoji: '🗄️', description: 'Cross-platform mobile database, works across iOS and Android' };
const SQLITE = { label: 'SQLite', description: 'Embedded file-based database, no separate server process' };
const LOCAL_DATABASES_BY_PLATFORM: Record<string, LocalDatabaseOption[]> = {
  ios: [{ label: 'Core Data', emoji: '🍎', description: 'Apple\'s native object graph and persistence framework' }, { label: 'SwiftData', emoji: '🍎', description: 'Swift-native persistence, the modern successor to Core Data' }, REALM, SQLITE],
  android: [{ label: 'Room', emoji: '🤖', description: 'Android Jetpack\'s SQLite abstraction layer' }, { label: 'DataStore', emoji: '🤖', description: 'Jetpack\'s modern key-value/typed preferences store' }, REALM, SQLITE],
  flutter: [{ label: 'Hive', emoji: '🐝', description: 'Lightweight, fast key-value store for Dart/Flutter' }, { label: 'Isar', emoji: '💎', description: 'Fast NoSQL database built for Flutter' }, { label: 'Drift', emoji: '💧', description: 'Reactive persistence library over SQLite for Dart' }, { label: 'sqflite', description: 'Direct SQLite bindings for Flutter' }],
  rn: [{ label: 'WatermelonDB', emoji: '🍉', description: 'Reactive, high-performance database built for React Native' }, { label: 'AsyncStorage', emoji: '📦', description: 'Simple async key-value storage for React Native' }, { label: 'SQLite (Expo)', description: 'Direct SQLite access via expo-sqlite' }, REALM],
};
const SERVER_SIDE_LOCAL_DATABASES: LocalDatabaseOption[] = [SQLITE, { label: 'IndexedDB', emoji: '🌐', description: 'Browser-native structured storage for offline web clients' }];

export function getLocalDatabaseOptions(platforms: string[]): LocalDatabaseOption[] {
  const seen = new Map<string, LocalDatabaseOption>();
  for (const platform of platforms) for (const db of LOCAL_DATABASES_BY_PLATFORM[platform] ?? []) seen.set(db.label, db);
  return seen.size > 0 ? Array.from(seen.values()) : SERVER_SIDE_LOCAL_DATABASES;
}

export const DATA_SYNC_STRATEGIES = [
  { id: 'last-write-wins', label: 'Last write wins', emoji: '🏁', description: 'Simplest conflict resolution - the most recent write overwrites earlier ones' },
  { id: 'merge-fields', label: 'Field-level merge', emoji: '🧬', description: 'Merges non-conflicting fields from each side instead of discarding one write entirely' },
  { id: 'crdt-merge', label: 'Automatic merge (CRDT)', emoji: '🔀', description: 'Keeps both sides\' changes and merges them automatically, even on true conflicts - no data lost, no user prompt (e.g. Automerge, Yjs)' },
  { id: 'manual-resolution', label: 'Manual conflict resolution', emoji: '🙋', description: 'Surfaces conflicts to the user to resolve, rather than resolving automatically' },
  { id: 'server-authoritative', label: 'Server is authoritative', emoji: '🖥️', description: 'The server\'s copy always wins - local changes are queued and replayed, not merged' },
];

const SERVERLESS_TARGETS = ['Vercel', 'Netlify', 'Cloudflare Pages', 'Cloudflare Workers'];
const LONG_LIVED_SERVER_PLATFORMS: Record<string, string> = { django: 'Django', laravel: 'Laravel', spring: 'Spring Boot', dotnet: '.NET / ASP.NET' };

export function getDeployTargetMismatch(a: Answers): Warnings {
  const result: Warnings = {};
  const platform = list(a, 'platforms').map(p => LONG_LIVED_SERVER_PLATFORMS[p]).find(Boolean);
  if (!platform) return result;
  for (const target of SERVERLESS_TARGETS) result[target] = `${platform} needs a long-running server - this host runs serverless functions`;
  return result;
}

const NO_WEBSOCKET_TARGETS = ['Vercel', 'Netlify', 'Cloudflare Pages'];

export function getRealtimeMismatch(a: Answers): Warnings {
  const blocking = list(a, 'deploymentTargets').filter(t => NO_WEBSOCKET_TARGETS.includes(t));
  if (!blocking.length) return {};
  return { WebSockets: `${blocking.join(' / ')} does not hold open WebSocket connections - needs Durable Objects or a separate service` };
}

const TIER_LABEL: Record<string, string> = { prototype: 'Prototype', startup: 'Startup', scaleup: 'Scale-up', enterprise: 'Enterprise' };
const TIER_USER_RANGES: Record<string, string[]> = {
  prototype: ['< 100', '100–1K'], startup: ['100–1K', '1K–50K'], scaleup: ['1K–50K', '50K–500K'], enterprise: ['50K–500K', '500K+'],
};
const TIER_TEAM_SIZES: Record<string, string[]> = {
  prototype: ['solo', '2-5'], startup: ['solo', '2-5', '5-15'], scaleup: ['2-5', '5-15', '15+'], enterprise: ['5-15', '15+'],
};

export function getActiveUsersMismatch(a: Answers): Warnings {
  const tier = str(a, 'scaleTier');
  const expected = TIER_USER_RANGES[tier];
  if (!expected) return {};
  const result: Warnings = {};
  for (const range of Object.values(TIER_USER_RANGES).flat()) if (!expected.includes(range)) result[range] = `Unusual for a ${TIER_LABEL[tier]} project`;
  return result;
}

export function getTeamSizeMismatch(a: Answers): Warnings {
  const tier = str(a, 'scaleTier');
  const expected = TIER_TEAM_SIZES[tier];
  if (!expected) return {};
  const result: Warnings = {};
  for (const size of ['solo', '2-5', '5-15', '15+']) if (!expected.includes(size)) result[size] = `Unusual for a ${TIER_LABEL[tier]} project`;
  return result;
}

// ---------------------------------------------------------------- integrations (integrationOptions.ts)

export type IntegrationCategory = { id: string; emoji: string; label: string; options: string[]; mobileOnly?: boolean };

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  { id: 'payments', emoji: '💳', label: 'Payments', options: ['Stripe', 'LemonSqueezy', 'Paddle', 'None'] },
  { id: 'email', emoji: '📧', label: 'Email / SMS', options: ['Resend', 'SendGrid', 'Twilio', 'Postmark', 'None'] },
  { id: 'storage', emoji: '🗄', label: 'File Storage', options: ['AWS S3', 'Cloudinary', 'Supabase Storage', 'Cloudflare R2', 'None'] },
  { id: 'analytics', emoji: '📊', label: 'Analytics', options: ['PostHog', 'Mixpanel', 'GA4', 'None'] },
  { id: 'errors', emoji: '🐛', label: 'Error Tracking', options: ['Sentry', 'Datadog', 'LogRocket', 'None'] },
  { id: 'push', emoji: '🔔', label: 'Push Notifications', options: ['FCM', 'APNs', 'OneSignal', 'None'], mobileOnly: true },
  { id: 'maps', emoji: '🗺', label: 'Maps', options: ['Google Maps', 'Mapbox', 'None'] },
  { id: 'ai', emoji: '🤖', label: 'AI / LLM', options: ['OpenAI', 'Anthropic', 'Groq', 'HuggingFace', 'None'] },
];

/** The integration map's keys a request may send. */
export const INTEGRATION_CATEGORY_IDS = INTEGRATION_CATEGORIES.map(c => c.id);

const CATEGORY_MAP: Record<ProjectCategory, string[]> = {
  saas: ['payments', 'email', 'storage', 'analytics', 'errors', 'maps', 'ai'],
  api: ['email', 'analytics', 'errors', 'ai'],
  mobile: ['push', 'analytics', 'errors', 'maps', 'ai', 'storage'],
  cli: ['errors', 'ai'],
  pipeline: ['storage', 'errors', 'analytics'],
  ml: ['storage', 'errors', 'ai'],
  static: ['analytics', 'email'],
  docs: ['analytics'],
  extension: ['analytics', 'errors', 'ai'],
  library: ['errors', 'ai'],
  other: ['payments', 'email', 'storage', 'analytics', 'errors', 'push', 'maps', 'ai'],
};

export function visibleCategories(category: ProjectCategory | null, mobile = false): IntegrationCategory[] {
  const ids = category ? CATEGORY_MAP[category] : INTEGRATION_CATEGORY_IDS;
  return INTEGRATION_CATEGORIES.filter(c => ids.includes(c.id) && (!c.mobileOnly || mobile));
}

/** `None` is exclusive within a category. */
export function toggleIntegration(current: Record<string, string[]>, categoryId: string, option: string): Record<string, string[]> {
  const selected = current[categoryId] ?? [];
  let next: string[];
  if (option === 'None') next = selected.includes('None') ? [] : ['None'];
  else {
    const withoutNone = selected.filter(v => v !== 'None');
    next = withoutNone.includes(option) ? withoutNone.filter(v => v !== option) : [...withoutNone, option];
  }
  return { ...current, [categoryId]: next };
}

/** "None of these apply": `None` in every visible category that has no pick yet. */
export function noneOfThese(current: Record<string, string[]>, visible: IntegrationCategory[]): Record<string, string[]> {
  const filled = { ...current };
  for (const c of visible) if (!filled[c.id] || filled[c.id].length === 0) filled[c.id] = ['None'];
  return filled;
}

// ---------------------------------------------------------------- constraints (constraintOptions.ts)

export const CONSTRAINT_OPTIONS = [
  { emoji: '💰', label: 'Budget cap' }, { emoji: '🏗️', label: 'Must use existing infra' }, { emoji: '📚', label: 'Team skill gaps' },
  { emoji: '🕰️', label: 'Legacy system integration' }, { emoji: '⏰', label: 'Hard deadline' },
];

export const COMPLIANCE_OPTIONS = [
  { id: 'gdpr', emoji: '🇪🇺', label: 'GDPR', description: 'You have users in the EU, or handle their personal data' },
  { id: 'hipaa', emoji: '🏥', label: 'HIPAA', description: 'You store or process U.S. health/medical data' },
  { id: 'soc2', emoji: '🛡️', label: 'SOC 2', description: 'You sell to businesses that require an independent security audit' },
  { id: 'pci', emoji: '💳', label: 'PCI DSS', description: 'You handle credit card payments directly (not just via Stripe/etc. checkout)' },
  { id: 'ccpa', emoji: '🇺🇸', label: 'CCPA', description: 'You have users in California, or handle their personal data' },
  { id: 'coppa', emoji: '👶', label: 'COPPA', description: 'Your service is directed at children under 13, or you knowingly collect their data' },
  { id: 'none', emoji: '➖', label: 'None' },
  { id: 'unsure', emoji: '❓', label: 'Not sure → TODO', isTodo: true },
];

const HEALTHCARE_USER_TYPES = ['Patients', 'Doctors / Clinicians'];

export function getComplianceBadge(userTypes: string[], specialConsiderations: string[], integrations: Record<string, string[]>): Badges {
  const badges: Badges = {};
  if (userTypes.some(u => HEALTHCARE_USER_TYPES.includes(u))) badges.hipaa = 'recommended';
  if (userTypes.includes('Children')) badges.coppa = 'recommended';
  if ((integrations.payments ?? []).some(v => v !== 'None')) badges.pci = 'flagged';
  if (specialConsiderations.includes('sensitive')) {
    badges.gdpr ??= 'recommended';
    badges.ccpa ??= 'recommended';
  }
  return badges;
}

export const RESPONSE_TIME_OPTIONS = [
  { id: '100ms', emoji: '⚡', label: '< 100ms' }, { id: '500ms', emoji: '🏃', label: '< 500ms' }, { id: '1s', emoji: '🚶', label: '< 1s' },
  { id: 'best', emoji: '🤷', label: 'Best effort' }, { id: 'unsure', emoji: '❓', label: 'Not sure → TODO', isTodo: true },
];

export const AVAILABILITY_OPTIONS = [
  { id: '99', emoji: '🥉', label: '99%', description: '≈ 3.65 days of downtime per year' },
  { id: '99.5', emoji: '🥈', label: '99.5%', description: '≈ 1.83 days of downtime per year' },
  { id: '99.9', emoji: '🥇', label: '99.9%', description: '≈ 8.76 hours of downtime per year' },
  { id: '99.99', emoji: '💎', label: '99.99%', description: '≈ 52.6 minutes of downtime per year' },
  { id: 'unsure', emoji: '❓', label: 'Not sure → TODO', isTodo: true },
];

// ---------------------------------------------------------------- security (securityOptions.ts)

export const SECURITY_CARDS = [
  { id: 'encryption', emoji: '🔐', label: 'Data Encryption', description: 'Encrypt sensitive data at rest and in transit' },
  { id: 'ratelimit', emoji: '🛡', label: 'Rate Limiting', description: 'Cap how many requests a client can make, to stop abuse/overload' },
  { id: 'audit', emoji: '📋', label: 'Audit Logging', description: 'Record who did what and when, for accountability and incident review' },
  { id: 'secrets', emoji: '🔑', label: 'Secrets Mgmt', description: 'Keep API keys/passwords out of source code, in a dedicated vault/store' },
  { id: 'owasp', emoji: '🌐', label: 'OWASP Top 10 2025', description: 'Guard against the most common web vulnerabilities (SQL injection, XSS, etc.)' },
  { id: 'ddos', emoji: '🚫', label: 'DDoS Protection', description: 'Defend against traffic floods meant to take your service down' },
  { id: 'validation', emoji: '🔍', label: 'Input Validation', description: 'Reject malformed or malicious input before it reaches your logic' },
  { id: 'intrusion', emoji: '👁', label: 'Intrusion Detection', description: 'Monitor for and alert on suspicious activity or break-in attempts' },
  { id: 'promptinjection', emoji: '🧩', label: 'Prompt Injection Defense', description: 'Guard against untrusted text hijacking an LLM\'s instructions or triggering unintended actions' },
  { id: 'outputfiltering', emoji: '🧹', label: 'Output Filtering', description: 'Sanitize/validate LLM output before rendering or acting on it, so it can\'t inject scripts or leak data' },
];
export const AI_ONLY_SECURITY_IDS = ['promptinjection', 'outputfiltering'];

export const TESTING_OPTIONS = [
  { id: 'unit', label: 'Unit tests', description: 'Tests individual functions/components in isolation, fast and focused' },
  { id: 'integration', label: 'Integration tests', description: 'Tests multiple parts working together (e.g. API + database)' },
  { id: 'e2e', label: 'E2E tests', description: 'End-to-end - simulates a real user clicking through the whole app' },
  { id: 'load', label: 'Load / perf tests', description: 'Simulates heavy traffic to find performance limits and bottlenecks' },
  { id: 'security', label: 'Security scans', description: 'Automated checks for known vulnerabilities and misconfigurations' },
  { id: 'none', label: 'None for now' },
  { id: 'unsure', label: 'Not sure → TODO', isTodo: true },
];

export const CICD_OPTIONS = [
  { id: 'github', label: 'GitHub Actions' }, { id: 'gitlab', label: 'GitLab CI' }, { id: 'circle', label: 'CircleCI' },
  { id: 'cloudflare', label: 'Cloudflare Pages (built-in)' }, { id: 'vercel', label: 'Vercel (built-in)' }, { id: 'netlify', label: 'Netlify (built-in)' },
  { id: 'railway', label: 'Railway (built-in)' }, { id: 'none', label: 'None', emoji: '➖' }, { id: 'unsure', label: 'Not sure → TODO', emoji: '❓', isTodo: true },
];

const CICD_BY_DEPLOY_TARGET: Record<string, string> = { Vercel: 'vercel', Netlify: 'netlify', Railway: 'railway', 'Cloudflare Pages': 'cloudflare', 'Cloudflare Workers': 'cloudflare' };

export function getCicdBadge(deploymentTargets: string[]): Badges {
  const match = deploymentTargets.map(t => CICD_BY_DEPLOY_TARGET[t]).find(Boolean);
  return match ? { [match]: 'recommended' } : {};
}

// ---------------------------------------------------------------- the flow

export type QuestionType = 'text' | 'choice' | 'multi' | 'cards' | 'tabbed-chips' | 'grouped-multi' | 'platform-grid' | 'categorized';

export interface ChatOption {
  id: string;
  label: string;
  emoji?: string;
  description?: string;
  group?: string;
  todo?: boolean;
  badge?: 'recommended' | 'flagged';
  warning?: string;
}

/** A question as the page shows it: one of the core's, or one of the server's (the CLI's) with what the core adds. */
export interface ChatQuestion {
  key: string;
  step: string;
  core: boolean;
  type: QuestionType;
  chat: string;
  /** The CLI's question under the bot line ('' when the CLI does not ask it). */
  message: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: ChatOption[];
  /** `Other: ___` free entry. */
  custom?: boolean;
  /** A text question's TODO answer (non-goals). */
  todo?: string;
  /** Shown above the choices. */
  note?: string;
  /** The composer's first selection when unanswered. */
  seed?: unknown;
  /** Skip notes of the questions skipped just before this one, and a note after its answer. */
  notesBefore: string[];
  noteAfter?: string;
  /** Integration categories (categorized questions). */
  categories?: { id: string; label: string; emoji: string; options: string[] }[];
  /** Tabs of a platform grid, in order. */
  tabs?: string[];
  answered: boolean;
  /** The answer as a bubble and a recap row show it. */
  text: string;
  /** The files the answer changes (spec-relative inside .specs/; the IDE's project-relative), and the caption made of them. */
  files: string[];
  caption: string;
  /** Everything else the server sent for a CLI question. */
  [extra: string]: unknown;
}

/** A server question as GET /api/setup and GET /api/projects/new send it (after `route.flowQuestions()`). */
export interface CliQuestion {
  key: string;
  message: string;
  chat?: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  choices?: { name: string; value: string }[];
  [extra: string]: unknown;
}

export const CHAT_STEPS = ['Project identity', 'Platform & IDE', 'Target users', 'Scale & deploy', 'Architecture & data', 'Integrations', 'Constraints & non-goals', 'Security & NFR'];

/** Every question key in the chat's order, with its step (index into CHAT_STEPS). The parent folder is the page's own. */
export const CHAT_KEYS: [string, number][] = [
  ['parent', 0], ['projectDescription', 0], ['projectType', 0], ['handle', 0],
  ['platforms', 1], ['language', 1], ['framework', 1], ['ide', 1],
  ['userTypes', 2], ['accessControl', 2], ['specialConsiderations', 2], ['accessibilityNotes', 2],
  ['scaleTier', 3], ['activeUsers', 3], ['deploymentTargets', 3], ['buildTimeline', 3], ['teamSize', 3],
  ['systemPattern', 4], ['apiParadigm', 4], ['databases', 4], ['authStrategy', 4], ['realtimeTypes', 4], ['localDatabases', 4], ['dataSyncStrategy', 4],
  ['integrations', 5], ['otherApis', 5],
  ['nonGoals', 6], ['technicalConstraints', 6], ['constraintDescription', 6], ['compliance', 6], ['apiResponseTime', 6], ['availability', 6],
  ['securityConcerns', 7], ['testingStrategy', 7], ['cicd', 7],
];

/** The TODO answer of the non-goals question. */
export const TODO = '__todo__';

/** Each key the page sends: the 23 optional fields of REQ-002.I.4, their kind and longest text. */
export const OPTIONAL_FIELD_LIMITS: Record<string, { kind: 'text' | 'list' | 'map'; max: number }> = {
  platforms: { kind: 'list', max: 100 }, accessControl: { kind: 'text', max: 100 }, specialConsiderations: { kind: 'list', max: 100 },
  accessibilityNotes: { kind: 'text', max: 1000 }, systemPattern: { kind: 'text', max: 100 }, activeUsers: { kind: 'text', max: 100 },
  teamSize: { kind: 'text', max: 100 }, deploymentTargets: { kind: 'list', max: 100 }, localDatabases: { kind: 'list', max: 100 },
  dataSyncStrategy: { kind: 'text', max: 100 }, integrations: { kind: 'map', max: 100 }, otherApis: { kind: 'text', max: 1000 },
  apiResponseTime: { kind: 'text', max: 100 }, availability: { kind: 'text', max: 100 }, databases: { kind: 'list', max: 100 },
  authStrategy: { kind: 'text', max: 100 }, realtimeTypes: { kind: 'list', max: 100 }, compliance: { kind: 'list', max: 100 },
  cicd: { kind: 'list', max: 100 }, securityConcerns: { kind: 'list', max: 100 }, buildTimeline: { kind: 'text', max: 100 },
  constraintDescription: { kind: 'text', max: 1000 }, testingStrategy: { kind: 'list', max: 100 },
};
/** Most items in one list (and in one integration category). */
export const MAX_LIST_ITEMS = 25;

/**
 * The files each answer changes, spec-relative inside `.specs/` (checked against `render()` by a test).
 * The context answers fill `development/onboarding.md` for Greenfield only.
 */
export const FIELD_FILES: Record<string, string[]> = {
  platforms: ['project/project.yaml'],
  accessControl: ['project/requirements.md'], specialConsiderations: ['project/requirements.md'], accessibilityNotes: ['project/requirements.md'],
  systemPattern: ['architecture/architecture.md'], activeUsers: ['architecture/architecture.md'], teamSize: ['architecture/architecture.md'],
  deploymentTargets: ['architecture/architecture.md'], localDatabases: ['architecture/architecture.md'], dataSyncStrategy: ['architecture/architecture.md'],
  integrations: ['architecture/architecture.md', 'security/threat-model.md'], otherApis: ['architecture/architecture.md'],
  apiResponseTime: ['architecture/architecture.md'], availability: ['architecture/architecture.md'],
  databases: ['architecture/api.yaml'], authStrategy: ['architecture/api.yaml', 'security/security-decisions.md'], realtimeTypes: ['architecture/api.yaml'],
  compliance: ['security/security-decisions.md'], cicd: ['security/security-decisions.md'], securityConcerns: ['security/threat-model.md'],
  buildTimeline: ['planning/roadmap.md'], constraintDescription: ['development/context.md'], testingStrategy: ['quality/tests.md'],
  whatItDoes: ['development/onboarding.md'], targetUsers: ['development/onboarding.md'], expectedScale: ['development/onboarding.md'], constraints: ['development/onboarding.md'],
  projectType: ['development/onboarding.md'], apiParadigm: ['architecture/api.yaml'],
};

/** Which context answer each folded question is sent in. */
const FOLDED_INTO: Record<string, string> = {
  projectDescription: 'whatItDoes', userTypes: 'targetUsers', scaleTier: 'expectedScale', nonGoals: 'constraints', technicalConstraints: 'constraints',
};

/** The caption: `For a & b & c`, `For <n> files`, or '' for none. */
export function captionText(files: string[]): string {
  if (!files.length) return '';
  return files.length > 3 ? `For ${files.length} files` : `For ${files.join(' & ')}`;
}

type Opt = { id?: string; label: string; emoji?: string; description?: string; group?: string; isTodo?: boolean; badge?: 'recommended' };
const opts = (arr: Opt[]): ChatOption[] =>
  arr.map(o => ({ id: o.id ?? o.label, label: o.label, emoji: o.emoji, description: o.description, group: o.group, todo: o.isTodo, badge: o.badge }));

interface CoreDef {
  type: QuestionType;
  chat: string | ((a: Answers) => string);
  label: string;
  required?: boolean;
  placeholder?: string;
  custom?: boolean;
  todo?: string;
  /** The CLI context question whose message shows under the bot line. */
  cli?: string;
  options?: (a: Answers) => ChatOption[];
  badges?: (a: Answers) => Badges;
  warnings?: (a: Answers) => Warnings;
  seed?: (a: Answers) => unknown;
  skip?: (a: Answers) => boolean;
  skipNote?: (a: Answers) => string;
}

const cap = (a: Answers) => getCapabilities(a.projectCategory as ProjectCategory | null);
const desc = (a: Answers) => str(a, 'projectDescription').toLowerCase();
/** The App's own rule: `api.yaml` is the only home of databases and realtime, written after `rest` and `graphql` only. */
const apiYamlHolds = (a: Answers) => ['rest', 'graphql'].includes(str(a, 'apiParadigm'));

const CORE: Record<string, CoreDef> = {
  projectDescription: {
    type: 'tabbed-chips', required: true, label: 'Description', cli: 'whatItDoes',
    placeholder: 'A CRM for boutique gyms to manage members, book classes, and handle recurring billing',
    options: () => STARTER_GROUPS.flatMap(g => g.items.map(i => ({ id: i.label, label: i.label, emoji: i.emoji, group: g.group }))),
    chat: "Describe it in plain words. As detailed or as brief as you like — I'll gather the rest.",
  },
  platforms: {
    type: 'platform-grid', label: 'Platforms',
    options: a => platformGridGroups(a.projectCategory as ProjectCategory | null, list(a, 'platforms'))
      .flatMap(g => PLATFORM_GROUPS.find(x => x.group === g)!.items.map(i => ({ id: i.id, label: i.label, emoji: i.emoji, description: `[${i.lang}]`, group: g }))),
    chat: 'Which platforms should this run on? Pick everything that applies.',
  },
  userTypes: {
    type: 'grouped-multi', label: 'User types', cli: 'targetUsers', custom: true,
    options: a => [
      ...visibleUserTypeGroups(a.projectCategory as ProjectCategory | null).flatMap(g => g.items.map(i => ({ id: i.label, label: i.label, emoji: i.emoji, group: g.group }))),
      { id: TODO, label: 'Not sure yet → TODO', emoji: '❓', todo: true },
    ],
    chat: "Who's going to use this system? Pick everything that applies.",
  },
  accessControl: {
    type: 'choice', required: true, label: 'Access control', options: () => opts(ACCESS_OPTIONS),
    chat: "What's the access control model? This drives the security spec's auth/authorization section and the app's permission model.",
  },
  specialConsiderations: {
    type: 'multi', label: 'Special considerations',
    options: a => opts(SPECIAL_OPTIONS.filter(o => cap(a).hasGraphicalUI || o.id !== 'a11y')),
    chat: 'Any special considerations - accessibility, i18n, offline support?',
  },
  accessibilityNotes: {
    type: 'text', label: 'Accessibility notes', placeholder: 'e.g. Screen reader support, right-to-left layout…',
    chat: 'Anything else on accessibility or constraints worth noting? Optional.',
  },
  scaleTier: {
    type: 'cards', required: true, label: 'Scale tier', cli: 'expectedScale',
    options: () => SCALE_TIERS.map(t => ({ id: t.id, label: t.title, emoji: t.emoji, description: t.description, badge: t.badge })),
    chat: "What's the expected scale? This drives infrastructure and architecture choices.",
  },
  activeUsers: {
    type: 'choice', required: true, label: 'Active users', options: () => opts(USER_RANGES), warnings: getActiveUsersMismatch,
    chat: 'Roughly how many active users are you expecting?',
  },
  deploymentTargets: {
    type: 'multi', label: 'Deploy targets', custom: true,
    options: a => opts(deployTargetOptions(a.projectCategory as ProjectCategory | null, list(a, 'platforms'))),
    badges: a => {
      const target = list(a, 'platforms').map(p => BAAS_DEPLOY_TARGET[p]).find(Boolean);
      return target ? { [target]: 'recommended' } : {};
    },
    warnings: getDeployTargetMismatch,
    seed: a => {
      const target = list(a, 'platforms').map(p => BAAS_DEPLOY_TARGET[p]).find(Boolean);
      return target && cap(a).distribution === 'hosting' ? [target] : undefined;
    },
    chat: a => {
      const dist = cap(a).distribution;
      if (dist === 'registry') return 'Where will you publish this - which package registries?';
      if (dist === 'appstore') return 'Where will you publish this - which extension stores?';
      return "Where's this going to deploy? Pick everything that applies.";
    },
  },
  buildTimeline: { type: 'choice', required: true, label: 'Timeline', options: () => opts(TIMELINES), chat: "What's the build timeline?" },
  teamSize: { type: 'choice', required: true, label: 'Team size', options: () => opts(TEAM_SIZES), warnings: getTeamSizeMismatch, chat: 'How big is the team building this?' },
  systemPattern: {
    type: 'cards', required: true, label: 'Pattern',
    options: () => SYSTEM_PATTERNS.map(p => ({ id: p.id, label: p.title, emoji: p.emoji, description: p.description })),
    badges: a => getArchBadge(str(a, 'scaleTier'), str(a, 'teamSize')),
    skip: a => !cap(a).hasServer,
    skipNote: a => `Skipping architecture pattern, database, auth, and real-time questions - a ${desc(a)} doesn't typically need a backend. Tap your project description above to change it if that's wrong.`,
    chat: 'One deployable app, or split into services? Pick an architecture pattern - monolith, modular monolith, or microservices.',
  },
  databases: {
    type: 'multi', label: 'Database', custom: true, options: () => opts(DATABASES),
    warnings: getDatabaseMismatch, badges: a => getDatabaseBadge(list(a, 'platforms')),
    skip: a => !cap(a).hasServer || !apiYamlHolds(a),
    chat: 'Database preference? Pick as many as apply - SQL (structured, related tables), NoSQL (flexible, document-based), a cache/key-value store, or vector - whatever fits your data.',
  },
  authStrategy: {
    type: 'choice', label: 'Auth strategy', custom: true, options: () => opts(AUTH_OPTIONS), badges: a => getAuthBadge(list(a, 'platforms')),
    skip: a => !cap(a).hasServer,
    chat: 'Auth strategy? Build it yourself with a protocol (JWT/OAuth/SAML), or use a managed service (Clerk/Auth0/Firebase/etc.) - this feeds the security spec\'s auth section.',
  },
  realtimeTypes: {
    type: 'multi', label: 'Realtime', options: () => opts(REALTIME_TYPES), warnings: getRealtimeMismatch,
    skip: a => !cap(a).hasServer || !apiYamlHolds(a),
    chat: 'Does anything need to update live without a refresh - chat, dashboards, notifications? If so, pick how (WebSockets, SSE, polling).',
  },
  localDatabases: {
    type: 'multi', label: 'Offline', custom: true, options: a => opts(getLocalDatabaseOptions(list(a, 'platforms'))),
    skip: a => !cap(a).hasGraphicalUI,
    chat: 'Does this need to work offline? If so, pick what stores data locally on the device.',
  },
  dataSyncStrategy: {
    type: 'choice', label: 'Data sync', options: () => opts(DATA_SYNC_STRATEGIES),
    skip: a => !cap(a).hasGraphicalUI || list(a, 'localDatabases').length === 0,
    chat: 'How should conflicting local and server state get reconciled once the device is back online?',
  },
  integrations: {
    type: 'categorized', label: 'Integrations',
    chat: 'Any third-party integrations I should plan for? Only categories relevant to your project type are shown.',
  },
  otherApis: {
    type: 'text', label: 'Other APIs', placeholder: 'e.g. Twilio for SMS, Mapbox for maps…',
    chat: 'Any other external APIs or services not listed above? Optional.',
  },
  nonGoals: {
    type: 'text', required: true, label: 'Non-goals', todo: TODO, cli: 'constraints',
    placeholder: 'e.g. No mobile app in v1. No offline mode. No multi-language support initially.',
    chat: 'What will this project explicitly NOT do?',
  },
  technicalConstraints: {
    type: 'multi', label: 'Technical constraints', options: () => opts(CONSTRAINT_OPTIONS),
    chat: 'Any technical constraints - budget, existing infra, legacy systems, a hard deadline?',
  },
  constraintDescription: {
    type: 'text', label: 'Constraint detail', placeholder: 'Describe the constraint…',
    skip: a => list(a, 'technicalConstraints').length === 0,
    chat: 'Can you say a bit more about that constraint?',
  },
  compliance: {
    type: 'multi', label: 'Compliance', custom: true, options: () => opts(COMPLIANCE_OPTIONS),
    badges: a => getComplianceBadge(list(a, 'userTypes'), list(a, 'specialConsiderations'), map(a, 'integrations')),
    chat: 'Any compliance requirements - GDPR, HIPAA, SOC 2? Getting this wrong has real legal consequences, so pick by your situation (EU users, health data, payments) below, not the regulation name.',
  },
  apiResponseTime: {
    type: 'choice', label: 'Response time', options: () => opts(RESPONSE_TIME_OPTIONS),
    skip: a => !cap(a).hasServer,
    skipNote: a => `Skipping response-time and availability SLA questions too - not hosted-service concepts for a ${desc(a)}.`,
    chat: 'Any API response-time target?',
  },
  availability: {
    type: 'choice', label: 'Availability', options: () => opts(AVAILABILITY_OPTIONS), skip: a => !cap(a).hasServer,
    chat: 'Availability SLA target - what fraction of the time does this need to be up? Higher percentages mean much less allowed downtime per year.',
  },
  securityConcerns: {
    type: 'multi', label: 'Security concerns',
    options: a => opts(aiSelected(a) ? SECURITY_CARDS : SECURITY_CARDS.filter(c => !AI_ONLY_SECURITY_IDS.includes(c.id))),
    chat: 'Any security concerns to plan for - encryption, rate limiting, audit logging?',
  },
  testingStrategy: { type: 'multi', label: 'Testing strategy', options: () => opts(TESTING_OPTIONS), chat: 'Testing strategy?' },
  cicd: {
    type: 'multi', label: 'CI/CD', options: () => opts(CICD_OPTIONS), badges: a => getCicdBadge(list(a, 'deploymentTargets')),
    chat: 'CI / CD - automatically running tests and deploying on every code change. Pick everything that applies.',
  },
};

/** Who is set up: a new project (`init`) or a folder without `.specs/` (`add-specs`). */
export type ChatMode = 'new' | 'setup';

const greenfield = (a: Answers) => (a.projectType ?? 'greenfield') === 'greenfield';

/** Whether a core question is asked at all in this mode (before the skip rules). */
function inMode(key: string, a: Answers, mode: ChatMode): boolean {
  if (key === 'projectDescription') return mode === 'new';
  if (key === 'userTypes' || key === 'scaleTier' || key === 'nonGoals') return mode === 'new' && greenfield(a);
  return true;
}

const asArray = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

/** A core answer as the bubble shows it. */
function coreText(key: string, def: CoreDef, value: unknown, options: ChatOption[]): string {
  const label = (id: string) => {
    const o = options.find(x => x.id === id) ?? (def.type === 'platform-grid' ? PLATFORM_GROUPS.flatMap(g => g.items).find(i => i.id === id) : undefined);
    return o ? (o.emoji ? `${o.emoji} ${o.label}` : o.label) : id;
  };
  if (def.type === 'text' || def.type === 'tabbed-chips') {
    if (def.todo && value === def.todo) return 'Not sure - skip for now (TODO)';
    return typeof value === 'string' && value.trim() ? value.trim() : 'Skipped';
  }
  if (def.type === 'choice' || def.type === 'cards') return typeof value === 'string' && value ? label(value) : 'Skipped';
  if (def.type === 'categorized') {
    const entries = Object.entries((value ?? {}) as Record<string, string[]>).filter(([, v]) => v.length && !(v.length === 1 && v[0] === 'None'));
    return entries.length ? entries.map(([k, v]) => `${INTEGRATION_CATEGORIES.find(c => c.id === k)?.label ?? k}: ${v.filter(x => x !== 'None').join(', ')}`).join(' · ') : 'None';
  }
  const arr = asArray(value);
  if (key === 'userTypes' && arr.includes(TODO) && arr.length === 1) return 'Not sure yet (TODO)';
  return arr.length ? arr.map(label).join(' · ') : 'None';
}

/** Whether a stored core answer still fits its question (an option filtered away since is asked again). */
function coreAnswered(def: CoreDef, value: unknown, options: ChatOption[]): boolean {
  if (value === undefined) return false;
  const ids = options.map(o => o.id);
  if (def.type === 'text' || def.type === 'tabbed-chips') return typeof value === 'string' && (!def.required || value.trim() !== '');
  if (def.type === 'choice' || def.type === 'cards') {
    if (typeof value !== 'string') return false;
    if (value === '') return !def.required;
    return ids.includes(value) || !!def.custom;
  }
  if (def.type === 'categorized') return !!value && typeof value === 'object';
  if (!Array.isArray(value)) return false;
  if (def.type === 'platform-grid') return value.every(v => PLATFORM_GROUP[v] !== undefined);
  return value.every(v => ids.includes(v) || !!def.custom);
}

const withBadges = (options: ChatOption[], badges: Badges, warnings: Warnings): ChatOption[] =>
  options.map(o => ({ ...o, badge: badges[o.id] ?? o.badge, warning: warnings[o.id] }));

/**
 * The questions to ask now, in the chat's order: the core's, and the server's CLI questions (`cli`, as
 * `route.flowQuestions()` leaves them) in their places with their badges, seeds and notes. `all` is every
 * question the server sent (the context questions lend their message to the folded ones and are not asked
 * themselves); `parent` is the page's own first question of a new project.
 */
export function chatQuestions(all: CliQuestion[], cli: CliQuestion[], a: Answers, mode: ChatMode, outside: Record<string, string[]> = {}): ChatQuestion[] {
  const message = (key: string) => all.find(q => q.key === key)?.message ?? '';
  const out: ChatQuestion[] = [];
  let pending: string[] = [];
  const hints = languageHints(list(a, 'platforms'), typeof a.language === 'string' ? a.language : undefined);
  for (const [key, stepIndex] of CHAT_KEYS) {
    const step = CHAT_STEPS[stepIndex];
    const def = CORE[key];
    if (!def) {
      const q = cli.find(x => x.key === key);
      if (!q) continue;
      const extra: Partial<ChatQuestion> = {};
      if (key === 'language') {
        extra.badges = Object.fromEntries(hints.languages.map(l => [l, 'recommended']));
        extra.seed = hints.language;
        extra.note = hints.note || undefined;
      } else if (key === 'framework') {
        extra.badges = Object.fromEntries(hints.frameworks.map(f => [f, 'recommended']));
        extra.seed = hints.framework;
      } else if (key === 'apiParadigm') {
        extra.badges = getApiBadge(str(a, 'scaleTier'), str(a, 'projectDescription'));
        const c = cap(a);
        if (!c.hasServer) extra.seed = a.projectCategory === 'cli' ? 'cli' : 'none';
        extra.type = 'cards';
      } else if (key === 'ide') extra.type = 'cards';
      const choice = q.choices?.find(c => c.value === a[key]);
      const answered = key in a && (!q.choices || !!choice);
      const files = key === 'ide' ? outside[String(choice?.value ?? q.choices?.[0]?.value)] ?? []
        : key === 'projectType' && mode === 'setup' ? [] : FIELD_FILES[key] ?? [];
      out.push({
        ...q,
        type: q.choices ? 'choice' : 'text',
        ...extra,
        key, step, core: false, chat: q.chat ?? '', message: q.message, label: q.label ?? key, required: q.required ?? false,
        notesBefore: pending, answered,
        text: q.choices ? (choice ? choice.name.split(' — ')[0] : '') : String(a[key] ?? '').trim() || 'Skipped',
        files, caption: captionText(files),
      } as ChatQuestion);
      pending = [];
      continue;
    }
    if (!inMode(key, a, mode)) continue;
    if (def.skip?.(a)) {
      if (def.skipNote) pending.push(def.skipNote(a));
      continue;
    }
    let options = def.options?.(a);
    if (options) options = withBadges(options, def.badges?.(a) ?? {}, def.warnings?.(a) ?? {});
    const fold = FOLDED_INTO[key];
    const sentAs = fold ? (mode === 'new' && greenfield(a) ? fold : null) : key;
    const q: ChatQuestion = {
      key, step, core: true, type: def.type,
      chat: typeof def.chat === 'function' ? def.chat(a) : def.chat,
      message: def.cli ? message(def.cli) : '',
      label: def.label, required: !!def.required, placeholder: def.placeholder, options, custom: def.custom, todo: def.todo,
      seed: def.seed?.(a), notesBefore: pending,
      answered: coreAnswered(def, a[key], options ?? []),
      text: coreText(key, def, a[key], options ?? []),
      files: sentAs ? FIELD_FILES[sentAs] ?? [] : [],
      caption: captionText(sentAs ? FIELD_FILES[sentAs] ?? [] : []),
    };
    if (key === 'platforms') {
      q.tabs = platformGridGroups(a.projectCategory as ProjectCategory | null, list(a, 'platforms'));
      q.note = bundleLine(list(a, 'platforms')) || undefined;
      q.noteAfter = getPlatformNote(list(a, 'platforms'))?.text;
    }
    if (key === 'integrations') {
      q.categories = visibleCategories(a.projectCategory as ProjectCategory | null, hasMobilePlatform(list(a, 'platforms')))
        .map(c => ({ id: c.id, label: c.label, emoji: c.emoji, options: c.options }));
    }
    out.push(q);
    pending = [];
  }
  return out;
}

/** What storing `value` for a question changes: the value, and for the description the category (the web's toPatch). */
export function answerPatch(key: string, value: unknown, a: Answers): Answers {
  if (key === 'projectDescription') {
    const description = String(value);
    const inferred = inferProjectCategory(description);
    return { projectDescription: description, projectCategory: description.trim() === '' ? null : (inferred ?? (a.projectCategory as ProjectCategory | null) ?? null) };
  }
  return { [key]: value };
}

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/**
 * Replace stale seeds: an answer that still equals the seed it was given (`seeded`, which the page records
 * when the user continues with the seed unchanged) is replaced by the question's seed now, when that differs.
 */
export function reseed(questions: ChatQuestion[], a: Answers, seeded: Record<string, unknown>): { answers: Answers; seeded: Record<string, unknown> } {
  const answers = { ...a };
  const next = { ...seeded };
  for (const q of questions) {
    if (!(q.key in next)) continue;
    if (!same(answers[q.key], next[q.key])) {
      delete next[q.key];
      continue;
    }
    if (q.seed !== undefined && !same(q.seed, answers[q.key])) {
      answers[q.key] = q.seed;
      next[q.key] = q.seed;
    }
  }
  return { answers, seeded: next };
}

/** The labels to send for a stored choice: TODO choices dropped, ids shown as their labels, free entries as typed. */
function labelsOf(q: ChatQuestion, ids: string[]): string[] {
  return ids
    .filter(id => !q.options?.find(o => o.id === id)?.todo && id !== TODO)
    .map(id => q.options?.find(o => o.id === id)?.label ?? id)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * The optional fields and the folded context answers to send, from the asked questions (REQ-002.H.28): labels,
 * no TODO choices, no `None` inside an integration category; the four folds for a Greenfield new project only.
 */
export function requestFields(questions: ChatQuestion[], a: Answers, mode: ChatMode): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const asked = (key: string) => questions.find(q => q.key === key && q.core);
  for (const key of Object.keys(OPTIONAL_FIELD_LIMITS)) {
    const q = asked(key);
    if (!q) continue;
    const value = a[key];
    if (key === 'integrations') {
      const m = Object.fromEntries(Object.entries(map(a, key)).map(([k, v]) => [k, v.filter(x => x !== 'None')]).filter(([, v]) => v.length));
      if (Object.keys(m).length) body[key] = m;
    } else if (q.type === 'text') {
      if (typeof value === 'string' && value.trim()) body[key] = value.trim();
    } else if (q.type === 'choice' || q.type === 'cards') {
      const v = typeof value === 'string' ? labelsOf(q, [value]) : [];
      if (v.length) body[key] = v[0];
    } else {
      const v = labelsOf(q, asArray(value));
      if (v.length) body[key] = v;
    }
  }
  if (mode === 'new' && greenfield(a)) {
    const userTypes = asked('userTypes');
    const tier = SCALE_TIERS.find(t => t.id === a.scaleTier);
    const nonGoals = str(a, 'nonGoals') === TODO ? '' : str(a, 'nonGoals').trim();
    const tc = asked('technicalConstraints') ? labelsOf(asked('technicalConstraints')!, list(a, 'technicalConstraints')) : [];
    body.whatItDoes = str(a, 'projectDescription').trim();
    body.targetUsers = userTypes ? labelsOf(userTypes, list(a, 'userTypes')).join(', ') : '';
    body.expectedScale = tier ? `${tier.title} (${tier.description})` : '';
    body.constraints = [nonGoals, tc.length ? `Technical constraints: ${tc.join(', ')}.` : ''].filter(Boolean).join(' ');
  }
  return body;
}
