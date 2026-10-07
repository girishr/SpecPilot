import { OPTIONAL_FIELDS, OptionalFields, present, TemplateEngine, TemplateContext } from './templateEngine';
import { renderSpecFiles, specTargets } from './specFiles';
import { aiContextFile, aiContextTarget, gitAttributesContent, GITATTRIBUTES_FILE, settingsFiles, settingsTargets } from './ideConfig';
import { agentFile, agentTargets } from './agentConfig';
import { commandFiles } from './slashCommands';

// The pure half of the generation stack (BL-032, phase 1): answers in, file contents out, nothing
// written. `SpecGenerator.generateSpecs()` writes what `render()` returns; `specpilot serve` and,
// in phase 3, `init.specpilot.dev` read it without a disk.

/** What the generator needs to know, minus where to write (`targetDir` is the writer's). */
export interface RenderOptions extends OptionalFields {
  projectName: string;
  language: string;
  framework?: string;
  /** The specs folder's name; `.specs` when absent. */
  specsName?: string;
  author?: string;
  description?: string;
  ide?: string;
  mode?: 'new' | 'existing';
  projectType?: 'greenfield' | 'brownfield';
  apiParadigm?: 'rest' | 'cli' | 'graphql' | 'none';
  projectContext?: {
    whatItDoes: string;
    targetUsers: string;
    expectedScale: string;
    constraints: string;
  };
  analysis?: {
    todos: Array<{ file: string; line: number; text: string; type: string }>;
    tests: {
      framework?: string;
      testFiles: string[];
      testCount: number;
      hasE2E: boolean;
      hasUnit: boolean;
      hasIntegration: boolean;
    };
    architecture: {
      components: string[];
      directories: string;
      fileTypes: Record<string, number>;
    };
  };
  /** The date every generated file carries (`YYYY-MM-DD`); today when absent. */
  date?: string;
}

/** One generated file: its project-relative, `/`-joined path and its content. */
export interface RenderedFile {
  path: string;
  content: string;
}

export interface RenderResult {
  /** Every file the generator writes, in write order: the `.specs/` files, then the files outside. */
  files: RenderedFile[];
  /** The onboarding prompt `init` and `add-specs` print (the body of `development/onboarding.md`). */
  onboardingPrompt: string;
}

/** The IDE choices that get an agent file instead of the settings pair. */
export const AGENT_IDES = new Set(['claude-code', 'codex']);

const REST_FRAMEWORKS = new Set(['express', 'fastapi', 'django', 'flask', 'next', 'nest', 'spring', 'ktor', 'vapor']);
const NO_API_FRAMEWORKS = new Set(['react', 'vue', 'angular', 'android', 'ios', 'swiftui', 'compose', 'streamlit']);

export function inferApiParadigm(framework?: string): 'rest' | 'cli' | 'graphql' | 'none' {
  if (!framework) return 'rest';
  const f = framework.toLowerCase();
  if (REST_FRAMEWORKS.has(f)) return 'rest';
  if (NO_API_FRAMEWORKS.has(f)) return 'none';
  return 'rest';
}

const today = () => new Date().toISOString().split('T')[0];

/**
 * The optional fields of `options` that are present (REQ-002.I.4): a blank string, an empty list, a
 * list of blanks, an empty map or a map whose lists are all empty is absent, so a template `{{#if}}`
 * on the field is the one rule.
 */
export function presentFields(options: OptionalFields): OptionalFields {
  const out: Record<string, unknown> = {};
  for (const key of OPTIONAL_FIELDS) {
    let value: unknown = options[key];
    if (Array.isArray(value)) value = value.filter(item => typeof item === 'string' && item.trim() !== '');
    else if (value && typeof value === 'object') {
      value = Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => [k, Array.isArray(v) ? v.filter(item => typeof item === 'string' && item.trim() !== '') : []] as const)
          .filter(([, v]) => v.length > 0),
      );
    }
    if (present(value)) out[key] = value;
  }
  return out as OptionalFields;
}

/** The template context `generateSpecs()` built until BL-032, with the date passed in and the present optional fields. */
export function toContext(options: RenderOptions): TemplateContext {
  return {
    ...presentFields(options),
    projectName: options.projectName,
    language: options.language,
    framework: options.framework,
    author: options.author || 'Your Name',
    description: options.description || ('A ' + options.language + ' project' + (options.framework ? ' using ' + options.framework : '')),
    lastUpdated: options.date ?? today(),
    contributors: [options.author || 'Your Name'],
    architecture: options.analysis && options.analysis.architecture,
    ide: options.ide || 'vscode',
    mode: options.mode || 'new',
    projectType: options.projectType ?? (options.mode === 'existing' ? 'brownfield' : 'greenfield'),
    apiParadigm: options.apiParadigm ?? inferApiParadigm(options.framework),
    projectContext: options.projectContext,
  };
}

/** The project-relative files under the specs folder for an API paradigm, in write order (BL-PM-004). */
export function targetsInSpecs(apiParadigm: string, specsName = '.specs'): string[] {
  return specTargets(apiParadigm).map(rel => `${specsName}/${rel}`);
}

/** The project-relative files outside the specs folder for an IDE choice, in write order (BL-055). */
export function targetsOutsideSpecs(ide = 'vscode'): string[] {
  const key = ide.toLowerCase();
  return [...(AGENT_IDES.has(key) ? agentTargets(key) : settingsTargets(key)), aiContextTarget(key), ...commandFiles(key).map(f => f.path), GITATTRIBUTES_FILE];
}

/** Renders every file for `options` without writing anything. */
export function render(options: RenderOptions): RenderResult {
  const engine = new TemplateEngine();
  const context = toContext(options);
  const ide = options.ide || 'vscode';
  const key = ide.toLowerCase();
  const { files, onboardingPrompt } = renderSpecFiles(engine, context, options.specsName ?? '.specs');
  if (AGENT_IDES.has(key)) {
    const agent = agentFile(engine, context, key);
    if (agent) files.push(agent);
  } else {
    files.push(...settingsFiles(context, ide));
  }
  files.push(aiContextFile(context, key));
  files.push(...commandFiles(key));
  files.push({ path: GITATTRIBUTES_FILE, content: gitAttributesContent() });
  return { files, onboardingPrompt };
}
