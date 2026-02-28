import { TemplateEngine, TemplateContext } from '../utils/templateEngine';

const BASE: TemplateContext = { projectName: 'TestApp', language: 'typescript' };

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  // ─── renderFromString ──────────────────────────────────────────────────────

  describe('renderFromString', () => {
    it('substitutes projectName and language from context', () => {
      expect(engine.renderFromString('{{projectName}}/{{language}}', BASE)).toBe('TestApp/typescript');
    });

    it('renders optional framework when present', () => {
      const ctx = { ...BASE, framework: 'react' };
      expect(engine.renderFromString('{{framework}}', ctx)).toBe('react');
    });

    it('renders empty string for missing optional field', () => {
      expect(engine.renderFromString('{{framework}}', BASE)).toBe('');
    });

    it('handles multi-line template strings', () => {
      const tmpl = 'name: {{projectName}}\nlanguage: {{language}}';
      expect(engine.renderFromString(tmpl, BASE)).toBe('name: TestApp\nlanguage: typescript');
    });
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  describe('uppercase helper', () => {
    it('uppercases a string', () => {
      expect(engine.renderFromString('{{uppercase language}}', { ...BASE, language: 'typescript' })).toBe('TYPESCRIPT');
    });

    it('uppercases a mixed-case project name', () => {
      expect(engine.renderFromString('{{uppercase projectName}}', { ...BASE, projectName: 'myApp' })).toBe('MYAPP');
    });
  });

  describe('lowercase helper', () => {
    it('lowercases a string', () => {
      expect(engine.renderFromString('{{lowercase projectName}}', { ...BASE, projectName: 'MyAPP' })).toBe('myapp');
    });
  });

  describe('capitalize helper', () => {
    it('capitalises the first character', () => {
      expect(engine.renderFromString('{{capitalize projectName}}', { ...BASE, projectName: 'hello world' })).toBe('Hello world');
    });

    it('leaves already-capitalised string unchanged', () => {
      expect(engine.renderFromString('{{capitalize projectName}}', { ...BASE, projectName: 'Hello' })).toBe('Hello');
    });
  });

  describe('currentDate helper', () => {
    it('returns a yyyy-mm-dd formatted date', () => {
      const result = engine.renderFromString('{{currentDate}}', BASE);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('matches today\'s date', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(engine.renderFromString('{{currentDate}}', BASE)).toBe(today);
    });
  });

  describe('currentYear helper', () => {
    it('returns a four-digit year string', () => {
      const result = engine.renderFromString('{{currentYear}}', BASE);
      expect(result).toMatch(/^\d{4}$/);
    });

    it('matches the actual current year', () => {
      const result = engine.renderFromString('{{currentYear}}', BASE);
      expect(Number(result)).toBe(new Date().getFullYear());
    });
  });

  describe('join helper', () => {
    it('joins an array with the given separator', () => {
      const ctx: TemplateContext = { ...BASE, items: ['alpha', 'beta', 'gamma'] };
      expect(engine.renderFromString('{{join items ", "}}', ctx)).toBe('alpha, beta, gamma');
    });

    it('joins with a different separator', () => {
      const ctx: TemplateContext = { ...BASE, items: ['a', 'b'] };
      expect(engine.renderFromString('{{join items " | "}}', ctx)).toBe('a | b');
    });

    it('returns empty string when value is not an array', () => {
      // projectName is a string, not an array
      expect(engine.renderFromString('{{join projectName ", "}}', BASE)).toBe('');
    });

    it('returns empty string for an empty array', () => {
      const ctx: TemplateContext = { ...BASE, items: [] };
      expect(engine.renderFromString('{{join items ", "}}', ctx)).toBe('');
    });
  });

  // ─── getBuiltinTemplate ───────────────────────────────────────────────────

  describe('getBuiltinTemplate', () => {
    it('returns non-empty content for typescript project.yaml', () => {
      const result = engine.getBuiltinTemplate('typescript', undefined, 'project.yaml');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('typescript');
    });

    it('returns non-empty content for python project.yaml', () => {
      const result = engine.getBuiltinTemplate('python', undefined, 'project.yaml');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('python');
    });

    it('returns non-empty content for typescript architecture.md', () => {
      const result = engine.getBuiltinTemplate('typescript', undefined, 'architecture.md');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns framework-specific content for typescript + react project.yaml', () => {
      const result = engine.getBuiltinTemplate('typescript', 'react', 'project.yaml');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('react');
    });

    it('falls back to language-only template for unknown single-word framework', () => {
      // The fallback strips the framework segment; this works when the framework
      // name is one token separated by a single hyphen (e.g. 'cli', 'vue').
      const generic = engine.getBuiltinTemplate('typescript', undefined, 'project.yaml');
      const custom  = engine.getBuiltinTemplate('typescript', 'cli', 'project.yaml');
      expect(custom).toBe(generic);
    });

    it('returns empty string for a completely unknown language/file combo', () => {
      expect(engine.getBuiltinTemplate('cobol', 'unknown', 'program.cob')).toBe('');
    });

    it('returns empty string for unknown file type in known language', () => {
      expect(engine.getBuiltinTemplate('typescript', undefined, 'nonexistent.html')).toBe('');
    });
  });
});
