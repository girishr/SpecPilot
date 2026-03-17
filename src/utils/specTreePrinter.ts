import chalk from 'chalk';

const SPEC_ENTRIES: Array<{ path: string; description: string }> = [
  { path: 'README.md',                    description: 'project overview and onboarding guide' },
  { path: 'project/project.yaml',         description: 'configuration, rules, AI context' },
  { path: 'project/requirements.md',      description: 'functional and non-functional requirements' },
  { path: 'architecture/architecture.md', description: 'system design and decisions' },
  { path: 'architecture/api.yaml',        description: 'API/CLI interface specification' },
  { path: 'planning/tasks.md',            description: 'sprint tracker (BL/CS/CD ID convention)' },
  { path: 'planning/roadmap.md',          description: 'release milestones and goals' },
  { path: 'quality/tests.md',             description: 'test strategy and coverage targets' },
  { path: 'development/context.md',       description: 'project decisions and background' },
  { path: 'development/docs.md',          description: 'documentation standards and checklists' },
  { path: 'development/prompts.md',       description: 'AI onboarding prompt and archive policy' },
  { path: 'security/threat-model.md',     description: 'threat model and attack surface analysis' },
  { path: 'security/security-decisions.md', description: 'security ADR log (mitigations and rationale)' },
];

const COLUMN_WIDTH = 32; // wide enough for 'architecture/architecture.md' + margin

/**
 * Returns chalk-formatted lines for a .specs/ folder tree with one-line
 * descriptions. Descriptions are hardcoded — not read from disk.
 *
 * @param specsName  Name of the specs folder (e.g. '.specs')
 */
export function getSpecTreeLines(specsName: string): string[] {
  const lines: string[] = [chalk.yellow.bold(`  📂 ${specsName}/`)];
  for (const { path, description } of SPEC_ENTRIES) {
    const padded = path.padEnd(COLUMN_WIDTH);
    lines.push(`     ${chalk.white(padded)}${chalk.dim('—')} ${chalk.gray(description)}`);
  }
  return lines;
}
