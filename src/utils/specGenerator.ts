import { dirname, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { render, RenderOptions, targetsInSpecs, targetsOutsideSpecs } from '../core/render';
import { GITATTRIBUTES_FILE } from '../core/ideConfig';
import { IdeConfigGenerator, writeNew } from './ideConfigGenerator';

export interface SpecGeneratorOptions extends RenderOptions {
  targetDir: string;
  specsName: string;
}

/**
 * The writer over the core's `render()` (BL-032): every file content comes from `src/core/`; this
 * class only puts it on disk, the way `init`, `add-specs`, `refine --update` and `serve` always did.
 */
export class SpecGenerator {
  private ideConfigGenerator = new IdeConfigGenerator();

  /**
   * Writes `.specs/` and the IDE files. Inside `.specs/` a file is written as it is rendered (replaced
   * when present, which `refine --update` relies on). Outside `.specs/` a file that already exists is
   * never changed (BL-073): `kept` lists those paths in generator order; `appended` counts lines added
   * to `.gitattributes`, which is the one file merged rather than created (REQ-002.B.8).
   */
  async generateSpecs(options: SpecGeneratorOptions): Promise<{ onboardingPrompt: string; kept: string[]; appended: number }> {
    const { files, onboardingPrompt } = render(options);
    const kept: string[] = [];
    let appended = 0;
    for (const file of files) {
      const target = join(options.targetDir, ...file.path.split('/'));
      if (file.path === GITATTRIBUTES_FILE) {
        appended = this.ideConfigGenerator.generateGitAttributes(options.targetDir);
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      if (file.path.startsWith(`${options.specsName}/`)) writeFileSync(target, file.content);
      else if (!writeNew(target, file.content)) kept.push(file.path);
    }
    return { onboardingPrompt, kept, appended };
  }

  /**
   * The project-relative files `generateSpecs()` writes under `.specs/` for an API paradigm, in the
   * order it writes them (BL-PM-004); `api.yaml` is absent for `none`.
   */
  targetsInSpecs(apiParadigm: string, specsName = '.specs'): string[] {
    return targetsInSpecs(apiParadigm, specsName);
  }

  /**
   * The project-relative files `generateSpecs()` writes outside `.specs/` for an IDE choice, in the
   * order it writes them (BL-055): read from the same tables the renders use, and pinned to the real
   * output by a test, so `specpilot serve` can say which existing files it will keep before it runs.
   */
  targetsOutsideSpecs(ide = 'vscode'): string[] {
    return targetsOutsideSpecs(ide);
  }
}

/** What `init`, `add-specs` and `refine --update` print about existing files outside `.specs/` (BL-073). */
export function keepReport({ kept, appended }: { kept: string[]; appended: number }): string[] {
  const lines: string[] = [];
  if (kept.length) lines.push(`Kept as they were: ${kept.join(', ')}. Run specpilot backfill to add missing SpecPilot sections to the instruction and command files.`);
  if (appended) lines.push(`Appended ${appended} line${appended === 1 ? '' : 's'} to ${GITATTRIBUTES_FILE}`);
  return lines;
}
