// The web's rule tests (SpecPilot.Init/src/components/chat/flowOptions/*.test.ts at 2c694db), ported case for
// case onto the chat core (BL-PM-004b, REQ-002.I.7). The bodies are the web's, unchanged; only the imports
// differ, through the names below. Left out, with the reason at each place: cases about the web's brand
// icon files and its API style list (gRPC, tRPC), which the core does not carry (REQ-002.H.28).
import * as core from '../core/chatFlow';

const {
  getCapabilities, inferProjectCategory, togglePlatform, getPlatformNote, visiblePlatformGroups, hasMobilePlatform, hasBaasPlatform,
  visibleUserTypeGroups, getArchBadge, getApiBadge, getDatabaseMismatch, getDatabaseBadge, getAuthBadge, getDeployTargetMismatch,
  getRealtimeMismatch, getActiveUsersMismatch, getTeamSizeMismatch, getLocalDatabaseOptions, visibleCategories, toggleIntegration,
  getComplianceBadge, getCicdBadge,
} = core;
const platformGroups = core.PLATFORM_GROUPS;
const bundlesIncludeFrontend = core.BUNDLES_INCLUDE_FRONTEND;
const databases = core.DATABASES;
const authOptions = core.AUTH_OPTIONS;
const realtimeTypes = core.REALTIME_TYPES;
const dataSyncStrategies = core.DATA_SYNC_STRATEGIES;
const deployTargets = core.DEPLOY_TARGETS;
const registryDeployTargets = core.REGISTRY_DEPLOY_TARGETS;
const appstoreDeployTargets = core.APPSTORE_DEPLOY_TARGETS;
const baasDeployTarget = core.BAAS_DEPLOY_TARGET;
const complianceOptions = core.COMPLIANCE_OPTIONS;
const availabilityOptions = core.AVAILABILITY_OPTIONS;
const securityCards = core.SECURITY_CARDS;
const testingOptions = core.TESTING_OPTIONS;
const cicdOptions = core.CICD_OPTIONS;
// The web's defaultAnswers (context/chatAnswers.ts), the fields the rules read.
const defaultAnswers = {
  projectCategory: null as core.ProjectCategory | null, projectName: '', projectDescription: '', isNewBuild: true, handle: '', platforms: [] as string[],
  ideAgent: '', languageOverride: '', userTypes: [] as string[], customUserType: '', accessControl: '', specialConsiderations: [] as string[],
  accessibilityNotes: '', scaleTier: '', activeUsers: '', deploymentTargets: [] as string[], buildTimeline: '', teamSize: '', systemPattern: '',
  apiStyle: '', databases: [] as string[], authStrategy: '', realtimeEnabled: false, realtimeTypes: [] as string[], offlineSupport: false,
  localDatabases: [] as string[], dataSyncStrategy: '', integrations: {} as Record<string, string[]>, otherApis: '', nonGoals: '',
  technicalConstraints: [] as string[], constraintDescription: '', compliance: [] as string[], apiResponseTime: '', availability: '',
  securityConcerns: [] as string[], testingStrategy: [] as string[], cicd: [] as string[],
};

// ---- capabilities.test.ts

// TEST-032 (ADR-012/CS-037)
describe('getCapabilities', () => {
  it('falls back to permissive defaults (same as other) for null/unmatched categories', () => {
    expect(getCapabilities(null)).toEqual(getCapabilities('other'))
  })

  it('marks cli/library/extension/static as having no server', () => {
    expect(getCapabilities('cli').hasServer).toBe(false)
    expect(getCapabilities('library').hasServer).toBe(false)
    expect(getCapabilities('extension').hasServer).toBe(false)
    expect(getCapabilities('static').hasServer).toBe(false)
  })

  it('marks saas/api/mobile/ml/other as having a server', () => {
    expect(getCapabilities('saas').hasServer).toBe(true)
    expect(getCapabilities('api').hasServer).toBe(true)
    expect(getCapabilities('mobile').hasServer).toBe(true)
    expect(getCapabilities('ml').hasServer).toBe(true)
  })

  // Inverted by REQ-076 item 5 (audit P1-3): hasServer gates all of Step 5, so the old
  // `false` also skipped the *database* question — where a pipeline reads from and
  // writes to, close to its defining property. Now true, deliberately accepting that
  // pipelines are also asked about API style.
  it('marks pipeline as having a server so it is asked about databases', () => {
    expect(getCapabilities('pipeline').hasServer).toBe(true)
  })

  it('marks only api/cli/library/pipeline/ml/docs as developer-audience categories', () => {
    expect(getCapabilities('api').audienceIsDevelopers).toBe(true)
    expect(getCapabilities('cli').audienceIsDevelopers).toBe(true)
    expect(getCapabilities('library').audienceIsDevelopers).toBe(true)
    expect(getCapabilities('pipeline').audienceIsDevelopers).toBe(true)
    expect(getCapabilities('ml').audienceIsDevelopers).toBe(true)
    expect(getCapabilities('docs').audienceIsDevelopers).toBe(true)
    expect(getCapabilities('extension').audienceIsDevelopers).toBe(false)
    expect(getCapabilities('saas').audienceIsDevelopers).toBe(false)
    expect(getCapabilities('static').audienceIsDevelopers).toBe(false)
  })

  it('assigns registry distribution to cli/library, appstore to extension, hosting to the rest', () => {
    expect(getCapabilities('cli').distribution).toBe('registry')
    expect(getCapabilities('library').distribution).toBe('registry')
    expect(getCapabilities('extension').distribution).toBe('appstore')
    expect(getCapabilities('saas').distribution).toBe('hosting')
    expect(getCapabilities('static').distribution).toBe('hosting')
  })

  it('marks a static site as having a graphical UI (web frontend) but no server, mobile, or dev audience', () => {
    const cap = getCapabilities('static')
    expect(cap.hasWebUI).toBe(true)
    expect(cap.hasGraphicalUI).toBe(true)
    expect(cap.hasMobileUI).toBe(false)
    expect(cap.hasServer).toBe(false)
  })

  it('marks cli/library/api as having no graphical UI', () => {
    expect(getCapabilities('cli').hasGraphicalUI).toBe(false)
    expect(getCapabilities('library').hasGraphicalUI).toBe(false)
    expect(getCapabilities('api').hasGraphicalUI).toBe(false)
  })

  it('marks a browser extension as having a graphical UI despite no server/web/mobile platform', () => {
    const cap = getCapabilities('extension')
    expect(cap.hasGraphicalUI).toBe(true)
    expect(cap.hasServer).toBe(false)
    expect(cap.hasWebUI).toBe(false)
    expect(cap.hasMobileUI).toBe(false)
  })

  it('marks docs as a developer-audience web frontend with no server', () => {
    const cap = getCapabilities('docs')
    expect(cap.hasWebUI).toBe(true)
    expect(cap.hasGraphicalUI).toBe(true)
    expect(cap.hasServer).toBe(false)
    expect(cap.audienceIsDevelopers).toBe(true)
  })
})

// ---- projectOptions.test.ts

// TEST-024 (ADR-011/CS-036)
describe('inferProjectCategory', () => {
  it('maps a starter chip label to its project category', () => {
    expect(inferProjectCategory('Task / Project Manager')).toBe('saas')
    expect(inferProjectCategory('REST API / Backend')).toBe('api')
    expect(inferProjectCategory('CLI Tool')).toBe('cli')
    expect(inferProjectCategory('Data Pipeline')).toBe('pipeline')
    expect(inferProjectCategory('ML / AI Service')).toBe('ml')
  })

  it('maps browser extension labels to the extension category', () => {
    expect(inferProjectCategory('Browser Extension')).toBe('extension')
    expect(inferProjectCategory('Chrome Extension')).toBe('extension')
  })

  it('maps SDK/library labels to the library category', () => {
    expect(inferProjectCategory('SDK / npm Package')).toBe('library')
    expect(inferProjectCategory('Monorepo / Library')).toBe('library')
  })

  it('maps the no-backend static-site labels', () => {
    expect(inferProjectCategory('Static Website')).toBe('static')
    expect(inferProjectCategory('Landing Page')).toBe('static')
    expect(inferProjectCategory('Portfolio Site')).toBe('static')
  })

  it('maps Documentation Site to its own docs category', () => {
    expect(inferProjectCategory('Documentation Site')).toBe('docs')
  })

  it('returns null for free-typed text that does not match a chip label', () => {
    expect(inferProjectCategory('A thing that does stuff')).toBeNull()
    expect(inferProjectCategory('')).toBeNull()
  })
})

// ---- platformOptions.test.ts

describe('togglePlatform', () => {
  // TEST-006
  it('selecting a frontend-bundling Full Stack Bundle (T3/MERN) clears Web Frontend/Backend selections', () => {
    let platforms = togglePlatform([], 'react')
    platforms = togglePlatform(platforms, 'node')
    expect(platforms).toEqual(['react', 'node'])

    platforms = togglePlatform(platforms, 't3')
    expect(platforms).toEqual(['t3'])
  })

  it('selecting Web Frontend clears a selected frontend-bundling bundle (T3/MERN)', () => {
    let platforms = togglePlatform([], 't3')
    platforms = togglePlatform(platforms, 'react')
    expect(platforms).toEqual(['react'])
  })

  it('enforces single-select per group', () => {
    let platforms = togglePlatform([], 'react')
    platforms = togglePlatform(platforms, 'vue')
    expect(platforms).toEqual(['vue'])
  })

  it('deselects an already-selected platform', () => {
    let platforms = togglePlatform([], 'react')
    platforms = togglePlatform(platforms, 'react')
    expect(platforms).toEqual([])
  })

  // TEST-032 (CD-girishr-092 follow-up) — BaaS-only bundles (Supabase/Firebase/Amplify/
  // Appwrite) are frontend-agnostic, unlike T3/MERN — Web Frontend stays a separate choice.
  it('selecting a BaaS-only bundle (Firebase) does not clear an already-selected Web Frontend', () => {
    let platforms = togglePlatform([], 'react')
    platforms = togglePlatform(platforms, 'firebase')
    expect(platforms).toEqual(['react', 'firebase'])
  })

  it('selecting Web Frontend does not clear an already-selected BaaS-only bundle (Firebase)', () => {
    let platforms = togglePlatform([], 'firebase')
    platforms = togglePlatform(platforms, 'react')
    expect(platforms).toEqual(['firebase', 'react'])
  })

  it('a BaaS-only bundle (Firebase) still clears an already-selected Backend framework', () => {
    let platforms = togglePlatform([], 'node')
    platforms = togglePlatform(platforms, 'firebase')
    expect(platforms).toEqual(['firebase'])
  })

  it('selecting a Backend framework still clears an already-selected BaaS-only bundle (Firebase)', () => {
    let platforms = togglePlatform([], 'firebase')
    platforms = togglePlatform(platforms, 'node')
    expect(platforms).toEqual(['node'])
  })
})

describe('getPlatformNote', () => {
  it('flags React Native + web as the best monorepo candidate', () => {
    const note = getPlatformNote(['rn', 'react'])
    expect(note?.tone).toBe('success')
    expect(note?.text).toMatch(/monorepo candidate/)
  })

  it('flags a single shared ecosystem as monorepo-friendly', () => {
    const note = getPlatformNote(['react', 'node'])
    expect(note?.tone).toBe('success')
    expect(note?.text).toMatch(/Monorepo-friendly/)
  })

  it('warns on cross-ecosystem platform combinations', () => {
    const note = getPlatformNote(['ios', 'django'])
    expect(note?.tone).toBe('warn')
    expect(note?.text).toMatch(/Cross-ecosystem/)
  })

  it('warns when mobile is selected with no backend', () => {
    const note = getPlatformNote(['ios'])
    expect(note?.tone).toBe('warn')
    expect(note?.text).toMatch(/data layer/)
  })

  it('returns null when there is nothing to flag', () => {
    expect(getPlatformNote(['node'])).toBeNull()
  })
})

// TEST-032 (ADR-012/CS-037) — capability-derived platform-group visibility,
// supersedes REQ-034/ADR-011's hiddenPlatformGroupsByCategory hide-list.
describe('visiblePlatformGroups', () => {
  // Full Stack Bundles (T3/MERN/Supabase/Firebase/Amplify/Appwrite) all pair a client
  // (web or mobile) with a backend-as-a-service — a pure API/ml project has neither,
  // so only raw backend framework options apply, not the bundles.
  it('shows only Backend for a pure-backend project (API) — no Full Stack Bundles', () => {
    expect(visiblePlatformGroups('api')).toEqual(['BACKEND'])
  })

  it('shows Mobile/Web Frontend/Backend/Full Stack Bundles for broad/ambiguous categories', () => {
    expect(visiblePlatformGroups('saas')).toEqual(['MOBILE', 'WEB FRONTEND', 'BACKEND', 'FULL STACK BUNDLES'])
    expect(visiblePlatformGroups(null)).toEqual(['MOBILE', 'WEB FRONTEND', 'BACKEND', 'FULL STACK BUNDLES'])
  })

  it('shows only Web Frontend for a static site — no backend, no mobile', () => {
    expect(visiblePlatformGroups('static')).toEqual(['WEB FRONTEND'])
  })

  it('shows only CLI Frameworks for a CLI tool', () => {
    expect(visiblePlatformGroups('cli')).toEqual(['CLI FRAMEWORKS'])
  })

  it('shows only Extension Frameworks for a browser extension', () => {
    expect(visiblePlatformGroups('extension')).toEqual(['EXTENSION FRAMEWORKS'])
  })

  it('shows only Language / Package for a library/SDK', () => {
    expect(visiblePlatformGroups('library')).toEqual(['LANGUAGE / PACKAGE'])
  })

  // Full Stack Bundles stays visible for mobile — Supabase/Firebase/Amplify-style
  // backend-as-a-service is a common, legitimate mobile-app backend choice
  // (see getPlatformNote's existing "Supabase Stack is popular for mobile" hint).
  it('shows Mobile/Backend/Full Stack Bundles for a mobile project, no Web Frontend', () => {
    expect(visiblePlatformGroups('mobile')).toEqual(['MOBILE', 'BACKEND', 'FULL STACK BUNDLES'])
  })

  it('shows only Backend for an ML/AI service — no Full Stack Bundles (no client to pair it with)', () => {
    expect(visiblePlatformGroups('ml')).toEqual(['BACKEND'])
  })

  // Knock-on effect of REQ-076 item 5, which flipped pipeline's hasServer to true so the
  // database question stops being skipped: this function gates BACKEND on the same flag,
  // so pipelines now see it too. Defensible on its own terms — an Airflow/Dagster
  // pipeline does run on a server — and still no FULL STACK BUNDLES, which additionally
  // require a web or mobile client the category doesn't have.
  it('shows Backend and Data Pipeline Tools for a data pipeline — but no full stack bundles (no client)', () => {
    expect(visiblePlatformGroups('pipeline')).toEqual(['BACKEND', 'DATA PIPELINE TOOLS'])
  })

  it('shows Web Frontend and Docs Frameworks for a documentation site', () => {
    expect(visiblePlatformGroups('docs')).toEqual(['WEB FRONTEND', 'DOCS FRAMEWORKS'])
  })

  it('Full Stack Bundles includes Firebase, AWS Amplify, and Appwrite alongside T3/MERN/Supabase', () => {
    const bundleIds = platformGroups.find(g => g.group === 'FULL STACK BUNDLES')!.items.map(i => i.id)
    expect(bundleIds).toEqual(['t3', 'mern', 'supabase', 'firebase', 'amplify', 'appwrite'])
  })

  it('only T3 and MERN are marked as bundling their own frontend', () => {
    expect(bundlesIncludeFrontend).toEqual(['t3', 'mern'])
  })
})

// TEST-072 (REQ-077 item 1) — extracted from three inline copies
describe('hasMobilePlatform / hasBaasPlatform', () => {
  it('detects every MOBILE group id', () => {
    for (const id of ['ios', 'android', 'rn', 'flutter', 'kmp']) {
      expect(hasMobilePlatform([id])).toBe(true)
    }
  })

  it('is false for web, backend, and frontend-bundling platforms', () => {
    for (const id of ['react', 'nextjs', 'node', 'django', 't3', 'mern']) {
      expect(hasMobilePlatform([id])).toBe(false)
    }
  })

  it('is false for an empty answer, and true when a mobile id appears alongside others', () => {
    expect(hasMobilePlatform([])).toBe(false)
    expect(hasMobilePlatform(['react', 'node', 'rn'])).toBe(true)
  })

  it('detects the four BaaS bundles and nothing else', () => {
    for (const id of ['supabase', 'firebase', 'amplify', 'appwrite']) {
      expect(hasBaasPlatform([id])).toBe(true)
    }
    for (const id of ['t3', 'mern', 'react', 'node']) {
      expect(hasBaasPlatform([id])).toBe(false)
    }
    expect(hasBaasPlatform([])).toBe(false)
  })

  // getPlatformNote's mobile-without-backend warning is one of the three call sites
  // repointed at the shared helper — confirm it still fires.
  it('still drives getPlatformNote\'s mobile-without-backend warning', () => {
    const note = getPlatformNote(['rn'])
    expect(note?.tone).toBe('warn')
    expect(note?.text).toContain('data layer')
  })
})

// ---- userOptions.test.ts

// TEST-032 (ADR-012/CS-037)
describe('visibleUserTypeGroups', () => {
  it('hides Consumers/Domain groups for developer-audience categories (api/cli/library)', () => {
    for (const category of ['api', 'cli', 'library'] as const) {
      const groups = visibleUserTypeGroups(category).map(g => g.group)
      expect(groups).toEqual(['ENTERPRISE'])
    }
  })

  it('shows every group for consumer/ambiguous categories', () => {
    const groups = visibleUserTypeGroups('saas').map(g => g.group)
    expect(groups).toEqual(['CONSUMERS', 'ENTERPRISE', 'DOMAIN'])
  })

  it('shows every group for a null/unmatched category', () => {
    expect(visibleUserTypeGroups(null).map(g => g.group)).toEqual(['CONSUMERS', 'ENTERPRISE', 'DOMAIN'])
  })

  it('the surviving ENTERPRISE group still includes "Developers"', () => {
    const groups = visibleUserTypeGroups('cli')
    const labels = groups.flatMap(g => g.items.map(i => i.label))
    expect(labels).toContain('Developers')
  })
})

// ---- scaleOptions.test.ts

// TEST-071 (REQ-076 items 1-2 / quality/flow-coherence-audit.md P1-1)
describe('deployTargets', () => {
  const labels = deployTargets.map(t => t.label)

  it('offers a hosting target for every BaaS platform bundle — the reported gap', () => {
    expect(labels).toContain('Supabase')
    expect(labels).toContain('Firebase Hosting')
    expect(labels).toContain('AWS Amplify Hosting')
    expect(labels).toContain('Appwrite Cloud')
  })

  // ComposerMultiSelect only renders an option as a card when it has a `description`,
  // and derives its tab strip from `group`. An entry missing either field silently
  // falls back to a chip below the tabs, which is the most likely regression here —
  // it looks fine until you notice one option isn't in any tab.
  it('gives every target a group and a description so all render as tabbed cards', () => {
    const missingGroup = deployTargets.filter(t => !t.group).map(t => t.label)
    const missingDescription = deployTargets.filter(t => !t.description).map(t => t.label)
    expect(missingGroup).toEqual([])
    expect(missingDescription).toEqual([])
  })

  it('sorts targets into exactly the four intended tabs', () => {
    const groups = [...new Set(deployTargets.map(t => t.group))]
    expect(groups.sort()).toEqual(['BAAS', 'CLOUD', 'MOBILE STORES', 'PLATFORM'])
  })

  it('keeps the mobile store targets available alongside hosting', () => {
    const stores = deployTargets.filter(t => t.group === 'MOBILE STORES').map(t => t.label)
    expect(stores).toEqual(['App Store', 'Google Play'])
  })

  // The registry/appstore lists back cli/library/extension projects, which publish
  // rather than deploy — REQ-076 regrouped only the hosting list, so these are
  // unchanged and still render as chips.
  it('leaves the registry and extension-store lists untouched', () => {
    expect(registryDeployTargets.map(t => t.label)).toEqual(['npm', 'PyPI', 'Homebrew', 'crates.io', 'GitHub Releases', 'Undecided'])
    expect(appstoreDeployTargets.map(t => t.label)).toEqual(['Chrome Web Store', 'Firefox Add-ons', 'Edge Add-ons', 'Undecided'])
  })
})

describe('baasDeployTarget', () => {
  it('maps each BaaS platform id to a target that actually exists in the list', () => {
    const labels = deployTargets.map(t => t.label)
    for (const target of Object.values(baasDeployTarget)) {
      expect(labels).toContain(target)
    }
  })

  it('covers exactly the four backend-as-a-service bundles', () => {
    expect(Object.keys(baasDeployTarget).sort()).toEqual(['amplify', 'appwrite', 'firebase', 'supabase'])
  })

  // T3 bundles Next.js and MERN bundles React — they imply a frontend framework, not a
  // hosting vendor, so seeding a deploy target from them would be a guess.
  it('does not map the frontend-bundling stacks, which imply no hosting vendor', () => {
    expect(baasDeployTarget['t3']).toBeUndefined()
    expect(baasDeployTarget['mern']).toBeUndefined()
  })
})

// ---- architectureOptions.test.ts

describe('getArchBadge', () => {
  // TEST-007
  it('recommends monolith for a solo dev regardless of scale', () => {
    expect(getArchBadge('enterprise', 'solo')).toEqual({ monolith: 'recommended' })
  })

  it('recommends monolith for a small team at prototype/startup scale', () => {
    expect(getArchBadge('prototype', '2-5')).toEqual({ monolith: 'recommended' })
    expect(getArchBadge('startup', '2-5')).toEqual({ monolith: 'recommended' })
  })

  it('recommends both monolith and modular for a small team scaling up', () => {
    expect(getArchBadge('scaleup', '2-5')).toEqual({ monolith: 'recommended', modular: 'recommended' })
  })

  it('recommends modular and flags microservices for a large team at scale', () => {
    expect(getArchBadge('scaleup', '5-15')).toEqual({ modular: 'recommended', microservices: 'flagged' })
    expect(getArchBadge('enterprise', '15+')).toEqual({ modular: 'recommended', microservices: 'flagged' })
  })

  it('falls back to monolith recommended for unrecognized combinations', () => {
    expect(getArchBadge('', '')).toEqual({ monolith: 'recommended' })
  })
})

describe('getApiBadge', () => {
  it('recommends GraphQL at enterprise scale', () => {
    expect(getApiBadge('enterprise')).toEqual({ graphql: 'recommended' })
  })

  it('recommends REST otherwise', () => {
    expect(getApiBadge('startup')).toEqual({ rest: 'recommended' })
    expect(getApiBadge('')).toEqual({ rest: 'recommended' })
  })
})

// TEST-032 (ADR-012/CS-037 follow-up) — AWS Amplify closes the gap where Firebase
// already had a Step 5 presence (Firestore/Firebase Auth) but Amplify had none.
describe('databases/authOptions include AWS Amplify alongside Firebase', () => {
  it('databases includes both Amplify DataStore and Firestore', () => {
    const labels = databases.map(d => d.label)
    expect(labels).toContain('Amplify DataStore')
    expect(labels).toContain('Firestore')
  })

  it('authOptions includes both Amplify Auth and Firebase Auth', () => {
    const labels = authOptions.map(a => a.label)
    expect(labels).toContain('Amplify Auth')
    expect(labels).toContain('Firebase Auth')
  })
})

// TEST-033 (REQ-037/CS-039) — non-expert question clarity pass
describe('non-expert clarity descriptions', () => {
// Left out: the web's API style list (REST, GraphQL, gRPC, tRPC); the App asks the CLI's API paradigm instead.
  

  it('authOptions every option has a non-empty description, except the TODO entry', () => {
    for (const a of authOptions) {
      if (a.label === 'Not sure → TODO') continue
      expect(a.description?.length).toBeGreaterThan(0)
    }
  })

  it('databases every option has a non-empty description, except the new TODO entry', () => {
    for (const d of databases) {
      if (d.label === 'Not sure → TODO') continue
      expect(d.description?.length).toBeGreaterThan(0)
    }
  })

  it('databases includes a "Not sure → TODO" option (previously missing)', () => {
    const todo = databases.find(d => d.label === 'Not sure → TODO')
    expect(todo?.isTodo).toBe(true)
  })

  it('realtimeTypes every option has a non-empty description', () => {
    for (const r of realtimeTypes) expect(r.description?.length).toBeGreaterThan(0)
  })
})

// TEST-037 (REQ-037 round 3) — SQL/NoSQL and Protocol/Managed Service tab groups
describe('database/auth group tags (round 3 tab switcher)', () => {
  it('databases: SQL entries carry group SQL, NoSQL entries carry group NoSQL, TODO entry is ungrouped', () => {
    const sql = ['PostgreSQL', 'MySQL', 'SQLite']
    const nosql = ['MongoDB', 'DynamoDB', 'Firestore', 'Amplify DataStore']
    for (const label of sql) expect(databases.find(d => d.label === label)?.group).toBe('SQL')
    for (const label of nosql) expect(databases.find(d => d.label === label)?.group).toBe('NoSQL')
    expect(databases.find(d => d.label === 'Not sure → TODO')?.group).toBeUndefined()
  })

  it('authOptions: protocol entries carry group PROTOCOL, managed-service entries carry group MANAGED SERVICE, TODO entry is ungrouped and added', () => {
    const protocol = ['JWT', 'OAuth 2.0', 'SAML / SSO']
    const managed = ['Clerk', 'Auth0', 'Firebase Auth', 'Supabase Auth', 'AWS Cognito', 'Amplify Auth']
    for (const label of protocol) expect(authOptions.find(a => a.label === label)?.group).toBe('PROTOCOL')
    for (const label of managed) expect(authOptions.find(a => a.label === label)?.group).toBe('MANAGED SERVICE')
    const todo = authOptions.find(a => a.label === 'Not sure → TODO')
    expect(todo?.isTodo).toBe(true)
    expect(todo?.group).toBeUndefined()
  })
})

// TEST-056 (REQ-059/ADR-022) — new CACHE/KEY-VALUE group + 2 new enterprise SQL
// entries, added while converting primaryDatabase to multi-select databases
describe('databases: new CACHE/KEY-VALUE group and enterprise SQL entries', () => {
  it('Redis, Amazon ElastiCache, Memcached, and Upstash all carry group "CACHE / KEY-VALUE"', () => {
    for (const label of ['Redis', 'Amazon ElastiCache', 'Memcached', 'Upstash']) {
      expect(databases.find(d => d.label === label)?.group).toBe('CACHE / KEY-VALUE')
    }
  })

  it('SQL Server and Oracle carry group "SQL"', () => {
    for (const label of ['SQL Server', 'Oracle']) {
      expect(databases.find(d => d.label === label)?.group).toBe('SQL')
    }
  })

  it('every new entry has a non-empty description (no vendored icon, emoji fallback)', () => {
    for (const label of ['Redis', 'Amazon ElastiCache', 'Memcached', 'Upstash', 'SQL Server', 'Oracle']) {
      const entry = databases.find(d => d.label === label)
      expect(entry?.description?.length).toBeGreaterThan(0)
      expect(entry?.emoji?.length).toBeGreaterThan(0)
      expect((entry as { icon?: string } | undefined)?.icon).toBeUndefined()
    }
  })
})

// TEST-058 (REQ-060 follow-up) — CACHE/KEY-VALUE grew a 4th entry (Amazon
// ElastiCache) so it wraps to 2 grid rows like every other group, matching the
// height ComposerMultiSelect's no-jump minHeight reserves across all 5 tabs —
// with only 3 entries (1 row) it left a large visible gap below the cards.
describe('databases: CACHE/KEY-VALUE has 4 entries, matching other groups\' row count', () => {
  it('CACHE / KEY-VALUE group has exactly 4 entries', () => {
    const cache = databases.filter(d => d.group === 'CACHE / KEY-VALUE')
    expect(cache.length).toBe(4)
  })
})

// TEST-057 (REQ-060/ADR-023) — CockroachDB/PlanetScale removed, MANAGED SQL tab
// split out from SQL (Amazon RDS/Google Cloud SQL/Azure SQL Database new,
// Cloudflare D1/Supabase moved in), fixing Supabase's pre-existing SQL/NoSQL mislabel
describe('databases: MANAGED SQL split (CockroachDB/PlanetScale removed)', () => {
  it('CockroachDB and PlanetScale are no longer present', () => {
    for (const label of ['CockroachDB', 'PlanetScale']) {
      expect(databases.find(d => d.label === label)).toBeUndefined()
    }
  })

  it('Amazon RDS, Google Cloud SQL, and Azure SQL Database all carry group "MANAGED SQL"', () => {
    for (const label of ['Amazon RDS', 'Google Cloud SQL', 'Azure SQL Database']) {
      expect(databases.find(d => d.label === label)?.group).toBe('MANAGED SQL')
    }
  })

  it('Cloudflare D1 moved from SQL to MANAGED SQL', () => {
    expect(databases.find(d => d.label === 'Cloudflare D1')?.group).toBe('MANAGED SQL')
  })

  it('Supabase moved from NoSQL to MANAGED SQL, fixing its pre-existing SQL/NoSQL mislabel', () => {
    const supabase = databases.find(d => d.label === 'Supabase')
    expect(supabase?.group).toBe('MANAGED SQL')
    expect(supabase?.description).toContain('SQL')
  })

  it('SQL group now contains only raw engines: PostgreSQL, MySQL, SQLite, SQL Server, Oracle', () => {
    const sqlLabels = databases.filter(d => d.group === 'SQL').map(d => d.label)
    expect(sqlLabels.sort()).toEqual(['MySQL', 'Oracle', 'PostgreSQL', 'SQL Server', 'SQLite'].sort())
  })

  it('every MANAGED SQL entry has a non-empty description', () => {
    const managed = databases.filter(d => d.group === 'MANAGED SQL')
    expect(managed.length).toBe(5)
    for (const entry of managed) expect(entry.description?.length).toBeGreaterThan(0)
  })
})

// TEST-059 (REQ-062) — mismatch warnings on the databases question
describe('getDatabaseMismatch', () => {
  it('flags every vendor-locked and vector database when nothing is answered yet (nothing confirmed compatible)', () => {
    const result = getDatabaseMismatch(defaultAnswers)
    for (const label of ['Amazon RDS', 'DynamoDB', 'Amazon ElastiCache', 'Amplify DataStore', 'Google Cloud SQL', 'Firestore', 'Azure SQL Database', 'Cloudflare D1', 'Pinecone', 'Weaviate', 'Chroma', 'pgvector (Postgres)']) {
      expect(result[label]).toBeDefined()
    }
  })

  it('never flags vendor-agnostic or self-hostable databases even when nothing is answered yet', () => {
    const result = getDatabaseMismatch(defaultAnswers)
    for (const label of ['PostgreSQL', 'MySQL', 'SQLite', 'Supabase', 'Redis', 'Upstash', 'MongoDB']) {
      expect(result[label]).toBeUndefined()
    }
  })

  it('flags AWS-locked databases when AWS is not a deploy target', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: ['Vercel'] })
    expect(result['Amazon RDS']).toBe('Deploy target is not AWS')
    expect(result['DynamoDB']).toBe('Deploy target is not AWS')
    expect(result['Amazon ElastiCache']).toBe('Deploy target is not AWS')
    expect(result['Amplify DataStore']).toBe('Deploy target is not AWS')
  })

  it('does not flag AWS-locked databases when AWS is a deploy target', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: ['AWS'] })
    expect(result['Amazon RDS']).toBeUndefined()
    expect(result['DynamoDB']).toBeUndefined()
  })

  it('flags GCP-locked databases when GCP is not a deploy target', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: ['AWS'] })
    expect(result['Google Cloud SQL']).toBe('Deploy target is not GCP')
    expect(result['Firestore']).toBe('Deploy target is not GCP')
  })

  it('flags Azure SQL Database when Azure is not a deploy target', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: [] })
    expect(result['Azure SQL Database']).toBe('Deploy target is not Azure')
  })

  it('flags Cloudflare D1 unless Cloudflare Pages or Cloudflare Workers is a deploy target', () => {
    expect(getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: [] })['Cloudflare D1']).toBe('Deploy target is not Cloudflare')
    expect(getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: ['Cloudflare Pages'] })['Cloudflare D1']).toBeUndefined()
    expect(getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: ['Cloudflare Workers'] })['Cloudflare D1']).toBeUndefined()
  })

  it('never flags vendor-agnostic or self-hostable databases regardless of deploy target', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: ['Vercel'] })
    for (const label of ['PostgreSQL', 'MySQL', 'SQLite', 'Supabase', 'Redis', 'Upstash', 'MongoDB']) {
      expect(result[label]).toBeUndefined()
    }
  })

  it('flags the VECTOR group when no AI/LLM integration is selected', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, integrations: {} })
    expect(result['Pinecone']).toBe('No AI/LLM integration selected')
    expect(result['Weaviate']).toBe('No AI/LLM integration selected')
    expect(result['Chroma']).toBe('No AI/LLM integration selected')
    expect(result['pgvector (Postgres)']).toBe('No AI/LLM integration selected')
  })

  it('flags the VECTOR group when the AI/LLM integration category is answered "None"', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, integrations: { ai: ['None'] } })
    expect(result['Pinecone']).toBe('No AI/LLM integration selected')
  })

  it('does not flag the VECTOR group when a real AI/LLM integration is selected', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, integrations: { ai: ['OpenAI'] } })
    expect(result['Pinecone']).toBeUndefined()
    expect(result['Weaviate']).toBeUndefined()
    expect(result['Chroma']).toBeUndefined()
    expect(result['pgvector (Postgres)']).toBeUndefined()
  })

  it('combines deploy-target and AI/LLM signals independently', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, deploymentTargets: ['AWS'], integrations: { ai: ['OpenAI'] } })
    expect(result['Amazon RDS']).toBeUndefined()
    expect(result['Pinecone']).toBeUndefined()
    expect(result['Google Cloud SQL']).toBe('Deploy target is not GCP')
  })
})

// TEST-071 (REQ-076 items 4/6/7 — quality/flow-coherence-audit.md P2-1/P2-2, P1-4, P2-5)
describe('getDatabaseMismatch — ml vector exemption (REQ-076 item 6)', () => {
  // An ML service self-hosting its own models picks no third-party AI vendor at Step 6,
  // yet is the project most likely to need a vector store. Warning it off every vector
  // option was backwards.
  it('does not flag vector databases for an ml project with no AI integration', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, projectCategory: 'ml' })
    expect(result['Pinecone']).toBeUndefined()
    expect(result['Weaviate']).toBeUndefined()
    expect(result['Chroma']).toBeUndefined()
    expect(result['pgvector (Postgres)']).toBeUndefined()
  })

  it('still flags vector databases for a non-ml project with no AI integration', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, projectCategory: 'saas' })
    expect(result['Pinecone']).toBe('No AI/LLM integration selected')
  })

  it('leaves the deploy-target vendor-lock warnings unaffected by category', () => {
    const result = getDatabaseMismatch({ ...defaultAnswers, projectCategory: 'ml', deploymentTargets: ['Vercel'] })
    expect(result['Amazon RDS']).toBe('Deploy target is not AWS')
  })
})

describe('getDatabaseBadge / getAuthBadge (REQ-076 item 4)', () => {
  it('recommends the database and auth service each BaaS platform bundles', () => {
    expect(getDatabaseBadge(['supabase'])).toEqual({ Supabase: 'recommended' })
    expect(getAuthBadge(['supabase'])).toEqual({ 'Supabase Auth': 'recommended' })
    expect(getDatabaseBadge(['firebase'])).toEqual({ Firestore: 'recommended' })
    expect(getAuthBadge(['firebase'])).toEqual({ 'Firebase Auth': 'recommended' })
    expect(getDatabaseBadge(['amplify'])).toEqual({ 'Amplify DataStore': 'recommended' })
    expect(getAuthBadge(['amplify'])).toEqual({ 'Amplify Auth': 'recommended' })
  })

  it('badges nothing when no BaaS platform is selected', () => {
    expect(getDatabaseBadge(['nextjs'])).toEqual({})
    expect(getAuthBadge(['nextjs'])).toEqual({})
    expect(getDatabaseBadge([])).toEqual({})
  })

  // REQ-062's principle: a badge points at an option, it never removes or reorders one.
  it('recommends only options that exist, and never hides the rest', () => {
    const dbLabels = databases.map(d => d.label)
    const authLabels = authOptions.map(a => a.label)
    for (const platform of ['supabase', 'firebase', 'amplify']) {
      expect(dbLabels).toContain(Object.keys(getDatabaseBadge([platform]))[0])
      expect(authLabels).toContain(Object.keys(getAuthBadge([platform]))[0])
    }
    expect(databases.length).toBeGreaterThan(20)
  })
})

describe('getApiBadge — project description signal (REQ-076 item 7)', () => {
  it('recommends GraphQL when the project is described as a GraphQL API', () => {
    expect(getApiBadge('startup', 'GraphQL API')).toEqual({ graphql: 'recommended' })
  })

  it('recommends REST when the project is described as a REST API', () => {
    expect(getApiBadge('enterprise', 'REST API / Backend')).toEqual({ rest: 'recommended' })
  })

  it('falls back to the scale-tier default when the description names no API style', () => {
    expect(getApiBadge('enterprise', 'Task / Project Manager')).toEqual({ graphql: 'recommended' })
    expect(getApiBadge('startup', 'Task / Project Manager')).toEqual({ rest: 'recommended' })
    expect(getApiBadge('startup')).toEqual({ rest: 'recommended' })
  })
})

// TEST-073 (REQ-078 items 2-5 — quality/flow-coherence-audit.md P2-3/P2-4/P2-6/P3-1)
describe('getDeployTargetMismatch (item 2)', () => {
  it('warns serverless hosts when the platform needs a long-running server', () => {
    const r = getDeployTargetMismatch({ ...defaultAnswers, platforms: ['django'] })
    expect(r['Vercel']).toContain('Django')
    expect(r['Cloudflare Pages']).toContain('long-running server')
  })

  it('does not warn for platforms serverless hosts run natively', () => {
    expect(getDeployTargetMismatch({ ...defaultAnswers, platforms: ['nextjs'] })).toEqual({})
    expect(getDeployTargetMismatch({ ...defaultAnswers, platforms: ['node'] })).toEqual({})
  })

  it('warns nothing when the platform question was left unanswered', () => {
    expect(getDeployTargetMismatch({ ...defaultAnswers, platforms: [] })).toEqual({})
  })

  it('never warns the hosts that do run long-lived servers', () => {
    const r = getDeployTargetMismatch({ ...defaultAnswers, platforms: ['laravel'] })
    expect(r['Railway']).toBeUndefined()
    expect(r['Fly.io']).toBeUndefined()
    expect(r['Self-hosted']).toBeUndefined()
    expect(r['AWS']).toBeUndefined()
  })
})

// Left out: getApiStyleMismatch, whose tRPC and gRPC options the CLI's API paradigm does not have.

describe('getRealtimeMismatch (item 5)', () => {
  it('warns WebSockets on hosts that do not hold open connections', () => {
    expect(getRealtimeMismatch({ ...defaultAnswers, deploymentTargets: ['Vercel'] }).WebSockets).toContain('WebSocket')
    expect(getRealtimeMismatch({ ...defaultAnswers, deploymentTargets: ['Cloudflare Pages'] }).WebSockets).toBeDefined()
  })

  it('does not warn on hosts that do — including Cloudflare Workers (Durable Objects)', () => {
    for (const target of ['Cloudflare Workers', 'Railway', 'Fly.io', 'Self-hosted', 'AWS']) {
      expect(getRealtimeMismatch({ ...defaultAnswers, deploymentTargets: [target] })).toEqual({})
    }
  })

  it('never warns SSE or Polling, and warns nothing with no deploy target', () => {
    const r = getRealtimeMismatch({ ...defaultAnswers, deploymentTargets: ['Vercel'] })
    expect(r['Server-Sent Events']).toBeUndefined()
    expect(r['Polling']).toBeUndefined()
    expect(getRealtimeMismatch({ ...defaultAnswers, deploymentTargets: [] })).toEqual({})
  })
})

describe('getActiveUsersMismatch / getTeamSizeMismatch (item 4)', () => {
  it('warns user counts that contradict the chosen tier, naming it', () => {
    const r = getActiveUsersMismatch({ ...defaultAnswers, scaleTier: 'prototype' })
    expect(r['500K+']).toContain('Prototype')
    expect(r['50K–500K']).toBeDefined()
  })

  it('does not warn the ranges that match the tier', () => {
    const r = getActiveUsersMismatch({ ...defaultAnswers, scaleTier: 'enterprise' })
    expect(r['500K+']).toBeUndefined()
    expect(r['50K–500K']).toBeUndefined()
  })

  it('warns team sizes that contradict the tier', () => {
    expect(getTeamSizeMismatch({ ...defaultAnswers, scaleTier: 'prototype' })['15+']).toContain('Prototype')
    expect(getTeamSizeMismatch({ ...defaultAnswers, scaleTier: 'enterprise' })['solo']).toContain('Enterprise')
    expect(getTeamSizeMismatch({ ...defaultAnswers, scaleTier: 'prototype' })['solo']).toBeUndefined()
  })

  it('warns nothing when no scale tier was chosen', () => {
    expect(getActiveUsersMismatch({ ...defaultAnswers, scaleTier: '' })).toEqual({})
    expect(getTeamSizeMismatch({ ...defaultAnswers, scaleTier: '' })).toEqual({})
  })
})

// TEST-086 (REQ-083) — offline support: local-database options derived from platforms
describe('getLocalDatabaseOptions', () => {
  it('returns iOS-native stores for an iOS platform', () => {
    const labels = getLocalDatabaseOptions(['ios']).map(d => d.label)
    expect(labels).toEqual(['Core Data', 'SwiftData', 'Realm', 'SQLite'])
  })

  it('returns Android-native stores for an Android platform', () => {
    const labels = getLocalDatabaseOptions(['android']).map(d => d.label)
    expect(labels).toEqual(['Room', 'DataStore', 'Realm', 'SQLite'])
  })

  it('returns Flutter-native stores for a Flutter platform', () => {
    const labels = getLocalDatabaseOptions(['flutter']).map(d => d.label)
    expect(labels).toEqual(['Hive', 'Isar', 'Drift', 'sqflite'])
  })

  it('returns React Native stores for an rn platform', () => {
    const labels = getLocalDatabaseOptions(['rn']).map(d => d.label)
    expect(labels).toEqual(['WatermelonDB', 'AsyncStorage', 'SQLite (Expo)', 'Realm'])
  })

  it('unions and de-duplicates across multiple mobile platforms (Realm and SQLite each appear once)', () => {
    const labels = getLocalDatabaseOptions(['ios', 'android']).map(d => d.label)
    expect(labels.filter(l => l === 'Realm').length).toBe(1)
    expect(labels.filter(l => l === 'SQLite').length).toBe(1)
    expect(labels).toEqual(['Core Data', 'SwiftData', 'Realm', 'SQLite', 'Room', 'DataStore'])
  })

// Left out: the brand icon files (emoji only in the App).
  

  it('falls back to the server-side list when no platform has a native local store', () => {
    const labels = getLocalDatabaseOptions(['node', 'react']).map(d => d.label)
    expect(labels).toEqual(['SQLite', 'IndexedDB'])
  })

  it('falls back to the server-side list for an empty platforms answer', () => {
    const labels = getLocalDatabaseOptions([]).map(d => d.label)
    expect(labels).toEqual(['SQLite', 'IndexedDB'])
  })
})

describe('dataSyncStrategies', () => {
  it('every option has a non-empty description', () => {
    for (const s of dataSyncStrategies) expect(s.description?.length).toBeGreaterThan(0)
  })

  it('includes the five expected conflict-resolution strategies', () => {
    const ids = dataSyncStrategies.map(s => s.id)
    expect(ids).toEqual(['last-write-wins', 'merge-fields', 'crdt-merge', 'manual-resolution', 'server-authoritative'])
  })

  // Developer feedback: "Field-level merge" only merges non-conflicting fields - there
  // was no option for genuinely keeping both sides' changes on a true conflict.
  it('crdt-merge is distinct from merge-fields: it explicitly covers true conflicts, not just non-conflicting fields', () => {
    const crdt = dataSyncStrategies.find(s => s.id === 'crdt-merge')
    expect(crdt?.description).toContain('true conflicts')
    const fieldMerge = dataSyncStrategies.find(s => s.id === 'merge-fields')
    expect(fieldMerge?.description).toContain('non-conflicting fields')
  })
})

// ---- integrationOptions.test.ts

describe('visibleCategories', () => {
  // TEST-008
  it('shows all categories when no project category is set and a mobile platform is selected', () => {
    expect(visibleCategories(null, true).map(c => c.id)).toContain('payments')
    expect(visibleCategories(null, true)).toHaveLength(8)
  })

  it('hides Payments for a CLI project', () => {
    const ids = visibleCategories('cli').map(c => c.id)
    expect(ids).not.toContain('payments')
    expect(ids).toEqual(['errors', 'ai'])
  })

  it('hides Push Notifications for a saas project', () => {
    const ids = visibleCategories('saas').map(c => c.id)
    expect(ids).not.toContain('push')
  })

  // TEST-024 (ADR-011/CS-036) — mobileOnly is now actually enforced, not just declared
  it('hides Push Notifications for a mobile project until a mobile platform is selected', () => {
    expect(visibleCategories('mobile').map(c => c.id)).not.toContain('push')
    expect(visibleCategories('mobile', false).map(c => c.id)).not.toContain('push')
  })

  it('shows Push Notifications for a mobile project once a mobile platform is selected', () => {
    const ids = visibleCategories('mobile', true).map(c => c.id)
    expect(ids).toContain('push')
  })

  it('scopes integrations for a static-site project to analytics/email', () => {
    expect(visibleCategories('static').map(c => c.id)).toEqual(['email', 'analytics'])
  })

  it('scopes integrations for a docs-site project to analytics only', () => {
    expect(visibleCategories('docs').map(c => c.id)).toEqual(['analytics'])
  })

  it('scopes integrations for a data pipeline to storage/analytics/errors', () => {
    expect(visibleCategories('pipeline').map(c => c.id)).toEqual(['storage', 'analytics', 'errors'])
  })

  it('scopes integrations for an ML/AI service to storage/errors/ai', () => {
    expect(visibleCategories('ml').map(c => c.id)).toEqual(['storage', 'errors', 'ai'])
  })

  it('scopes integrations for a browser extension project to errors/analytics/ai', () => {
    const ids = visibleCategories('extension').map(c => c.id)
    expect(ids).toEqual(['analytics', 'errors', 'ai'])
    expect(ids).not.toContain('payments')
  })

  it('scopes integrations for a library/SDK project to errors/ai only', () => {
    const ids = visibleCategories('library').map(c => c.id)
    expect(ids).toEqual(['errors', 'ai'])
    expect(ids).not.toContain('payments')
  })
})

describe('toggleIntegration', () => {
  it('selecting "None" clears any other selection in that category', () => {
    let integrations = toggleIntegration({}, 'payments', 'Stripe')
    integrations = toggleIntegration(integrations, 'payments', 'None')
    expect(integrations.payments).toEqual(['None'])
  })

  it('selecting a vendor clears a previously selected "None"', () => {
    let integrations = toggleIntegration({}, 'payments', 'None')
    integrations = toggleIntegration(integrations, 'payments', 'Stripe')
    expect(integrations.payments).toEqual(['Stripe'])
  })

  it('supports multiple vendors within one category', () => {
    let integrations = toggleIntegration({}, 'email', 'Resend')
    integrations = toggleIntegration(integrations, 'email', 'Twilio')
    expect(integrations.email).toEqual(['Resend', 'Twilio'])
  })
})

// ---- constraintOptions.test.ts

// TEST-033 (REQ-037/CS-039) — non-expert question clarity pass
describe('non-expert clarity descriptions', () => {
  it('complianceOptions every non-none/unsure option has a situational description', () => {
    for (const c of complianceOptions) {
      if (c.id === 'none' || c.id === 'unsure') continue
      expect(c.description?.length).toBeGreaterThan(0)
    }
  })

  it('availabilityOptions every percentage option has a downtime-per-year description', () => {
    for (const a of availabilityOptions) {
      if (a.id === 'unsure') continue
      expect(a.description).toMatch(/downtime per year/)
    }
  })
})

// TEST-071 (REQ-076 item 8 — quality/flow-coherence-audit.md P3-3/P3-4)
describe('getComplianceBadge', () => {
  const none = { userTypes: [] as string[], special: [] as string[], integrations: {} as Record<string, string[]> }

  it('adds COPPA, which was missing entirely despite Children being a user type', () => {
    expect(complianceOptions.find(c => c.id === 'coppa')?.label).toBe('COPPA')
  })

  it('recommends HIPAA when the users are patients or clinicians', () => {
    expect(getComplianceBadge(['Patients'], none.special, none.integrations).hipaa).toBe('recommended')
    expect(getComplianceBadge(['Doctors / Clinicians'], none.special, none.integrations).hipaa).toBe('recommended')
  })

  it('recommends COPPA when the users are children', () => {
    expect(getComplianceBadge(['Children'], none.special, none.integrations).coppa).toBe('recommended')
  })

  // PCI DSS's own description says "not just via Stripe/etc. checkout" — using a hosted
  // checkout keeps card data off your servers, which is the opposite of its trigger.
  it('flags PCI DSS rather than recommending it when a payment vendor is selected', () => {
    const badges = getComplianceBadge(none.userTypes, none.special, { payments: ['Stripe'] })
    expect(badges.pci).toBe('flagged')
  })

  it('does not flag PCI DSS when the payments category is answered None', () => {
    expect(getComplianceBadge(none.userTypes, none.special, { payments: ['None'] }).pci).toBeUndefined()
  })

  it('nudges the broad personal-data regimes on high data sensitivity', () => {
    const badges = getComplianceBadge(none.userTypes, ['sensitive'], none.integrations)
    expect(badges.gdpr).toBe('recommended')
    expect(badges.ccpa).toBe('recommended')
  })

  it('badges nothing when no signal was collected', () => {
    expect(getComplianceBadge(none.userTypes, none.special, none.integrations)).toEqual({})
  })

  // REQ-062: advisory only. Every option stays selectable regardless of badge state.
  it('never removes an option from the list', () => {
    const before = complianceOptions.length
    getComplianceBadge(['Patients', 'Children'], ['sensitive'], { payments: ['Stripe'] })
    expect(complianceOptions.length).toBe(before)
  })
})

// ---- securityOptions.test.ts

// TEST-033 (REQ-037/CS-039) — non-expert question clarity pass
describe('non-expert clarity descriptions', () => {
  it('securityCards every option has a non-empty description', () => {
    for (const s of securityCards) expect(s.description?.length).toBeGreaterThan(0)
  })

  it('testingOptions E2E has a description explaining what it means', () => {
    const e2e = testingOptions.find(t => t.id === 'e2e')
    expect(e2e?.description?.length).toBeGreaterThan(0)
  })

  // TEST-037 (REQ-037 round 3) — extends description coverage beyond E2E
  it('testingOptions unit/integration/load/security each have a non-empty description, none/unsure stay bare', () => {
    for (const id of ['unit', 'integration', 'load', 'security']) {
      expect(testingOptions.find(t => t.id === id)?.description?.length).toBeGreaterThan(0)
    }
    expect(testingOptions.find(t => t.id === 'none')?.description).toBeUndefined()
    expect(testingOptions.find(t => t.id === 'unsure')?.description).toBeUndefined()
  })
})

// TEST-073 (REQ-078 item 6 — quality/flow-coherence-audit.md P3-5)
describe('cicdOptions platform-CI entries', () => {
  const ids = cicdOptions.map(o => o.id)

  it('offers the built-in pipelines that were missing', () => {
    expect(ids).toContain('vercel')
    expect(ids).toContain('netlify')
    expect(ids).toContain('railway')
  })

  // Developer decision: add and relabel, remove nothing (REQ-062).
  it('keeps Cloudflare Pages, relabelled rather than removed', () => {
    const cf = cicdOptions.find(o => o.id === 'cloudflare')
    expect(cf).toBeDefined()
    expect(cf?.label).toBe('Cloudflare Pages (built-in)')
  })

  it('still offers the standalone CI providers and both escape hatches', () => {
    for (const id of ['github', 'gitlab', 'circle', 'none', 'unsure']) {
      expect(ids).toContain(id)
    }
  })
})

describe('getCicdBadge (item 6)', () => {
  it('recommends the pipeline matching the chosen deploy target', () => {
    expect(getCicdBadge(['Vercel'])).toEqual({ vercel: 'recommended' })
    expect(getCicdBadge(['Netlify'])).toEqual({ netlify: 'recommended' })
    expect(getCicdBadge(['Railway'])).toEqual({ railway: 'recommended' })
    expect(getCicdBadge(['Cloudflare Workers'])).toEqual({ cloudflare: 'recommended' })
  })

  it('badges nothing for a target with no built-in pipeline, or none chosen', () => {
    expect(getCicdBadge(['AWS'])).toEqual({})
    expect(getCicdBadge(['Self-hosted'])).toEqual({})
    expect(getCicdBadge([])).toEqual({})
  })

  it('never removes an option — the list length is unaffected by badging', () => {
    const before = cicdOptions.length
    getCicdBadge(['Vercel'])
    expect(cicdOptions.length).toBe(before)
  })
})
