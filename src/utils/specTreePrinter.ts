import chalk from 'chalk';

type FolderEntry = {
  folder: string;
  files: Array<{ name: string; description: string }>;
};

const SPEC_FOLDERS: FolderEntry[] = [
  {
    folder: 'architecture',
    files: [
      { name: 'api.yaml',        description: 'CLI / REST API / GraphQL interface spec' },
      { name: 'architecture.md', description: 'system design decisions and patterns' },
    ],
  },
  {
    folder: 'development',
    files: [
      { name: 'context.md', description: 'development memory, decisions, learnings' },
      { name: 'docs.md',    description: 'dev guidelines, spec conventions, checklist' },
      { name: 'prompts.md', description: 'AI interaction log — MANDATED, update every session' },
    ],
  },
  {
    folder: 'planning',
    files: [
      { name: 'roadmap.md', description: 'release milestones and objectives' },
      { name: 'tasks.md',   description: 'sprint tracker (backlog / current / completed)' },
    ],
  },
  {
    folder: 'project',
    files: [
      { name: 'project.yaml',    description: 'project config, rules, AI context (MANDATED)' },
      { name: 'requirements.md', description: 'functional and non-functional requirements' },
    ],
  },
  {
    folder: 'quality',
    files: [
      { name: 'tests.md', description: 'test strategy and coverage targets' },
    ],
  },
  {
    folder: 'security',
    files: [
      { name: 'security-decisions.md', description: 'security ADR log (mitigations and rationale)' },
      { name: 'threat-model.md',       description: 'threat model and attack surface analysis' },
    ],
  },
];

const FILE_COL_WIDTH = 22; // wide enough for 'security-decisions.md' + margin

/**
 * Returns chalk-formatted lines for a .specs/ folder tree that mirrors
 * the Project Structure in README.md. Descriptions are hardcoded — not
 * read from disk.
 *
 * @param specsName  Name of the specs folder (e.g. '.specs')
 */
export function getSpecTreeLines(specsName: string): string[] {
  const lines: string[] = [chalk.yellow.bold(`  📂 ${specsName}/`)];
  const lastFolderIdx = SPEC_FOLDERS.length - 1;

  for (let fi = 0; fi < SPEC_FOLDERS.length; fi++) {
    const { folder, files } = SPEC_FOLDERS[fi];
    const isLastFolder = fi === lastFolderIdx;
    const folderBranch = isLastFolder ? '└──' : '├──';
    const childIndent  = isLastFolder ? '    ' : '│   ';

    lines.push(`  ${folderBranch} ${chalk.cyan.bold(folder + '/')}`);

    const lastFileIdx = files.length - 1;
    for (let i = 0; i < files.length; i++) {
      const { name, description } = files[i];
      const fileBranch = i === lastFileIdx ? '└──' : '├──';
      const padded = name.padEnd(FILE_COL_WIDTH);
      lines.push(`  ${childIndent}${fileBranch} ${chalk.white(padded)} ${chalk.dim('—')} ${chalk.gray(description)}`);
    }
  }

  return lines;
}
