import { createHash, randomBytes } from 'crypto';
import { basename, dirname, join } from 'path';
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'fs';
import { writeNew } from './ideConfigGenerator';
import { SlashCommand, SLASH_COMMANDS, resolveTarget } from '../core/slashCommands';
import * as yaml from 'js-yaml';
import { agentFile, agentTargets, fillReleasedSkill, KNOWN_SKILL_TEMPLATES, skillValue } from '../core/agentConfig';
import { TemplateContext, TemplateEngine } from '../core/templateEngine';
import { resolveAllowedPath } from './specPaths';

export { SLASH_COMMANDS };
export type { SlashCommand };


/** A command file `refreshCommands()` left as it was, and why. */
export interface KeptCommand {
  name: string;
  path: string;
  reason:
    | 'modified'
    | 'CRLF line endings'
    | 'symbolic link'
    | 'not a regular file'
    | 'folder is a symbolic link or not a folder'
    | `could not be written: ${string}`;
}

/** What `refreshSkill()` did (or, in dry-run, would do) with the Claude Code skill (BL-PM-012). */
export interface SkillRefresh {
  path: string;
  action: 'added' | 'updated' | 'current' | 'kept';
  reason?:
    | Exclude<KeptCommand['reason'], 'modified'>
    | "does not match SpecPilot's render of project.yaml"
    | 'project.yaml could not be read'
    | 'project.yaml has no usable name or language';
}

/** The skill's context from `<specsName>/project/project.yaml` (REQ-002.H.40), or the reason it cannot be used. */
export function readSkillContext(projectDir: string, specsName: string): TemplateContext | NonNullable<SkillRefresh['reason']> {
  const rel = `${specsName}/project/project.yaml`;
  const file = resolveAllowedPath(projectDir, rel, [rel]); // exactly this path: a link resolves elsewhere and is refused
  let doc: unknown;
  try {
    doc = file && yaml.load(readFileSync(file, 'utf-8'));
  } catch {
    doc = null;
  }
  if (!doc || typeof doc !== 'object') return 'project.yaml could not be read';
  const d = doc as Record<string, unknown>;
  const build = d.build && typeof d.build === 'object' ? (d.build as Record<string, unknown>) : {};
  const projectName = skillValue(d.name);
  const language = skillValue(d.language);
  if (!projectName || !language) return 'project.yaml has no usable name or language';
  const platforms = Array.isArray(d.platforms) ? d.platforms.map(skillValue) : [];
  return {
    projectName,
    language,
    framework: skillValue(d.framework),
    ...(platforms.length && platforms.every(Boolean) ? { platforms: platforms as string[] } : {}),
    packageManager: skillValue(build.packageManager),
    testFramework: skillValue(build.testFramework),
    repository: skillValue(d.repository),
    license: skillValue(d.license),
  };
}

/** What `refreshCommands()` did (or, in dry-run, would do) for one IDE. */
export interface CommandRefresh {
  added: string[];
  updated: string[];
  kept: KeptCommand[];
}


/**
 * SHA-256 of every command file a released SpecPilot generated, per target path, oldest first.
 * v2.2.0 was the first release to write command files. `refreshCommands()` replaces a file only when
 * its bytes hash to one of these (BL-058). Regenerate with `node scripts/command-hashes.js` whenever
 * a command changes; a test fails if the current content of any target is missing.
 */
export const KNOWN_COMMAND_HASHES: Record<string, string[]> = {
  '.agent/workflows/specpilot-archive.md': [
    'dea17f5a6cc488bc95be76413f9ce602082a112835e9395be4aee1e8e463164b',
    'c4ebcf051279e98525351ecb08452f71e28eef173311605908939a0b993fc726',
    '50beaa5de3eaf5a9960ee775e5b9e694998902886d488c30bbdcd252e189214a',
    '4828517e26559b39ec143269a1ddcdd2909eeb2044a97824396a6b91d8ad23c1',
    'dcb3f3baa3fad300e0cf813e9c21c25d7c20dd362857e0aaf34f283536ab6497',
    '909f1fba21874031d256faa5cd883ce540e448367197448fd2b06a929f742890',
  ],
  '.agent/workflows/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
    'dfa92eee86a0056e2b81edb41e9ed20c89e391ae9c2b0191c3b6d31d46ba8609',
  ],
  '.agent/workflows/specpilot-reanchor.md': [
    'd1f606a725e98f320735b6fa87991a9b2c8cad7ecca750b44e054f079f746b49',
  ],
  '.agent/workflows/specpilot-refine.md': [
    '08d7e7a6491f7928b6511322039e05d4d1b594075753f1e9046518dfa5b20596',
  ],
  '.agent/workflows/specpilot-report.md': [
    'ba699b927c96fc7b4e9714a4021837a8bdb39cf5fdeb38c03749ae7ee92a4af1',
  ],
  '.agent/workflows/specpilot-status.md': [
    '5e5b17110956ad9b061910450ed10337dc82032fbf319e90c63a0884f1d89102',
  ],
  '.agent/workflows/specpilot-sync.md': [
    '1da5cdd9a0ec55d48c675434751bd60a874627c5954e9708925a388d9b5fe366',
  ],
  '.agent/workflows/specpilot-validate.md': [
    '13094f8c85dfa06fdcc12ee1ae0ee795a1145f2d4aa8e7bff3ba289c0f6b2721',
    'b047cf646dc581b021c79f88e4aaa8fb29e60397ba5ec20d11f4faf67d7c45a0',
  ],
  '.claude/commands/specpilot-archive.md': [
    '37bfbac4c2632512de5d0e3e3a68e0904d8cce8cdd9925f53432cdb3066dbe51',
    '3f3e121a9da5cda256f0fcbf3bbd92590cc211d3e67ee59a834c58d6abb589ef',
    '82fa25d0986ba33c240a8817670d5733b353cdc19c0a102b4b29245c348634e0',
    '4ece400213565ec40fdce7e4767f984ee352ddb08cafac35cdaf4731edffcbe7',
    'c456c0067f69c7ec4300bdbe7fed3727734d7df8b44f56bda77d6ac4f7eece10',
    '3ae2d75ada7b2864f941025e4074f64ea58461d5eac026603cd4bce09e9c16f2',
  ],
  '.claude/commands/specpilot-backfill.md': [
    '16c9c26b3e63b6e77067dab0037cb49d51d344e9bf392a431f09f7918ee3c813',
    '14848ce3ddedac11c2422736e48bf289047a11d4aa04b20a670d24b558e0af01',
  ],
  '.claude/commands/specpilot-reanchor.md': [
    'd1f606a725e98f320735b6fa87991a9b2c8cad7ecca750b44e054f079f746b49',
  ],
  '.claude/commands/specpilot-refine.md': [
    'acd266d3c551a42b8a68ab90cef561de58b3ec0fe3a37ebbbd734298d320b471',
  ],
  '.claude/commands/specpilot-report.md': [
    'ba699b927c96fc7b4e9714a4021837a8bdb39cf5fdeb38c03749ae7ee92a4af1',
  ],
  '.claude/commands/specpilot-status.md': [
    '5e5b17110956ad9b061910450ed10337dc82032fbf319e90c63a0884f1d89102',
  ],
  '.claude/commands/specpilot-sync.md': [
    '1da5cdd9a0ec55d48c675434751bd60a874627c5954e9708925a388d9b5fe366',
  ],
  '.claude/commands/specpilot-validate.md': [
    'c4bc7798f2eef780257a6b91652c4222db3e6b4566da85fc1c2d4552032db269',
    'bc05b32520d372d79482c979f8209217e82c12168cf1c38e3e8e20b6c991794c',
  ],
  '.codex/prompts/specpilot-archive.md': [
    'dea17f5a6cc488bc95be76413f9ce602082a112835e9395be4aee1e8e463164b',
    'c4ebcf051279e98525351ecb08452f71e28eef173311605908939a0b993fc726',
    '50beaa5de3eaf5a9960ee775e5b9e694998902886d488c30bbdcd252e189214a',
    '4828517e26559b39ec143269a1ddcdd2909eeb2044a97824396a6b91d8ad23c1',
    'dcb3f3baa3fad300e0cf813e9c21c25d7c20dd362857e0aaf34f283536ab6497',
    '909f1fba21874031d256faa5cd883ce540e448367197448fd2b06a929f742890',
  ],
  '.codex/prompts/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
    'dfa92eee86a0056e2b81edb41e9ed20c89e391ae9c2b0191c3b6d31d46ba8609',
  ],
  '.codex/prompts/specpilot-reanchor.md': [
    'd1f606a725e98f320735b6fa87991a9b2c8cad7ecca750b44e054f079f746b49',
  ],
  '.codex/prompts/specpilot-refine.md': [
    '08d7e7a6491f7928b6511322039e05d4d1b594075753f1e9046518dfa5b20596',
  ],
  '.codex/prompts/specpilot-report.md': [
    'ba699b927c96fc7b4e9714a4021837a8bdb39cf5fdeb38c03749ae7ee92a4af1',
  ],
  '.codex/prompts/specpilot-status.md': [
    '5e5b17110956ad9b061910450ed10337dc82032fbf319e90c63a0884f1d89102',
  ],
  '.codex/prompts/specpilot-sync.md': [
    '1da5cdd9a0ec55d48c675434751bd60a874627c5954e9708925a388d9b5fe366',
  ],
  '.codex/prompts/specpilot-validate.md': [
    '13094f8c85dfa06fdcc12ee1ae0ee795a1145f2d4aa8e7bff3ba289c0f6b2721',
    'b047cf646dc581b021c79f88e4aaa8fb29e60397ba5ec20d11f4faf67d7c45a0',
  ],
  '.cursor/commands/specpilot-archive.md': [
    'dea17f5a6cc488bc95be76413f9ce602082a112835e9395be4aee1e8e463164b',
    'c4ebcf051279e98525351ecb08452f71e28eef173311605908939a0b993fc726',
    '50beaa5de3eaf5a9960ee775e5b9e694998902886d488c30bbdcd252e189214a',
    '4828517e26559b39ec143269a1ddcdd2909eeb2044a97824396a6b91d8ad23c1',
    'dcb3f3baa3fad300e0cf813e9c21c25d7c20dd362857e0aaf34f283536ab6497',
    '909f1fba21874031d256faa5cd883ce540e448367197448fd2b06a929f742890',
  ],
  '.cursor/commands/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
    'dfa92eee86a0056e2b81edb41e9ed20c89e391ae9c2b0191c3b6d31d46ba8609',
  ],
  '.cursor/commands/specpilot-reanchor.md': [
    'd1f606a725e98f320735b6fa87991a9b2c8cad7ecca750b44e054f079f746b49',
  ],
  '.cursor/commands/specpilot-refine.md': [
    '08d7e7a6491f7928b6511322039e05d4d1b594075753f1e9046518dfa5b20596',
  ],
  '.cursor/commands/specpilot-report.md': [
    'ba699b927c96fc7b4e9714a4021837a8bdb39cf5fdeb38c03749ae7ee92a4af1',
  ],
  '.cursor/commands/specpilot-status.md': [
    '5e5b17110956ad9b061910450ed10337dc82032fbf319e90c63a0884f1d89102',
  ],
  '.cursor/commands/specpilot-sync.md': [
    '1da5cdd9a0ec55d48c675434751bd60a874627c5954e9708925a388d9b5fe366',
  ],
  '.cursor/commands/specpilot-validate.md': [
    '13094f8c85dfa06fdcc12ee1ae0ee795a1145f2d4aa8e7bff3ba289c0f6b2721',
    'b047cf646dc581b021c79f88e4aaa8fb29e60397ba5ec20d11f4faf67d7c45a0',
  ],
  '.github/prompts/specpilot-archive.prompt.md': [
    '3b669bfe482b6e36bde07eee44d018ba1f66a5996a6069df4180ff8d367c2046',
    '9e75008c25a6820a7be150732e59ab2fa207594a50e98c5dfcaa8c03dc087094',
    '12345bb6d2367a65bc9f2547b85403e781f3f81af664aa51743e96ca6894bac7',
    '6dc00a9bce104395f819bde397978154aadc8716a8258ad3f5bf23559f94f834',
    'd04af73d7f467f888a44e310b669361f6f8863fe325702fe639f51751634e2f2',
    '9dc54381e45e0a1b29f9be41cc5666c6ca7ffaa615655aa7137c80c0af6fed58',
  ],
  '.github/prompts/specpilot-backfill.prompt.md': [
    'df986c946846ce107888b4b21e197fb2c8498c6a32925d2d79e92d3dd39298dc',
    '0845b5f0c35044f190644a78e3dc097383f8af57efa91543a19ddc70d12d46d5',
  ],
  '.github/prompts/specpilot-reanchor.prompt.md': [
    '30f915e1a37a02fe01650a99fd214401d035ad2544207766762b90ab8ede70cf',
  ],
  '.github/prompts/specpilot-refine.prompt.md': [
    '2489f0176dbbb452163e2588f5ef7ce8ce397b5032c8989731837f24f1955cb6',
  ],
  '.github/prompts/specpilot-report.prompt.md': [
    '6e72be94c576ac7000896d68e1509d21f4218e1a917ce90b1debd252fdfaddd5',
  ],
  '.github/prompts/specpilot-status.prompt.md': [
    '4620467bfeb8ee2cd31b0b2f45564c41290746332804a2b6de6daa1b25519a1d',
  ],
  '.github/prompts/specpilot-sync.prompt.md': [
    'ef134e6db6cdfb1adcde442c2f4221503e73fbdd2d48172f5ee0f7e3929eee83',
  ],
  '.github/prompts/specpilot-validate.prompt.md': [
    '265ac29d8c2cdf8688dfbfac6b67c266ef1a477ffb608e5222679595bff8d32a',
    '643800dbd14bae0d6507c8b85d452beb9f72e30e39936330dc751c4fc93da3bb',
  ],
  '.windsurf/workflows/specpilot-archive.md': [
    'dea17f5a6cc488bc95be76413f9ce602082a112835e9395be4aee1e8e463164b',
    'c4ebcf051279e98525351ecb08452f71e28eef173311605908939a0b993fc726',
    '50beaa5de3eaf5a9960ee775e5b9e694998902886d488c30bbdcd252e189214a',
    '4828517e26559b39ec143269a1ddcdd2909eeb2044a97824396a6b91d8ad23c1',
    'dcb3f3baa3fad300e0cf813e9c21c25d7c20dd362857e0aaf34f283536ab6497',
    '909f1fba21874031d256faa5cd883ce540e448367197448fd2b06a929f742890',
  ],
  '.windsurf/workflows/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
    'dfa92eee86a0056e2b81edb41e9ed20c89e391ae9c2b0191c3b6d31d46ba8609',
  ],
  '.windsurf/workflows/specpilot-reanchor.md': [
    'd1f606a725e98f320735b6fa87991a9b2c8cad7ecca750b44e054f079f746b49',
  ],
  '.windsurf/workflows/specpilot-refine.md': [
    '08d7e7a6491f7928b6511322039e05d4d1b594075753f1e9046518dfa5b20596',
  ],
  '.windsurf/workflows/specpilot-report.md': [
    'ba699b927c96fc7b4e9714a4021837a8bdb39cf5fdeb38c03749ae7ee92a4af1',
  ],
  '.windsurf/workflows/specpilot-status.md': [
    '5e5b17110956ad9b061910450ed10337dc82032fbf319e90c63a0884f1d89102',
  ],
  '.windsurf/workflows/specpilot-sync.md': [
    '1da5cdd9a0ec55d48c675434751bd60a874627c5954e9708925a388d9b5fe366',
  ],
  '.windsurf/workflows/specpilot-validate.md': [
    '13094f8c85dfa06fdcc12ee1ae0ee795a1145f2d4aa8e7bff3ba289c0f6b2721',
    'b047cf646dc581b021c79f88e4aaa8fb29e60397ba5ec20d11f4faf67d7c45a0',
  ],
};

/**
 * What `init` and `add-specs` print after generating for Codex (BL-055 moved it out of `generate()`,
 * so `specpilot serve` can return the same text to the page instead of printing it in its terminal).
 */
export const CODEX_PROMPTS_NOTICE =
  '⚠️  SpecPilot slash commands were written to .codex/prompts/ for reference.\n' +
  '   Codex only auto-discovers prompts from ~/.codex/prompts/ — copy them there manually:\n' +
  '   cp .codex/prompts/specpilot-*.md ~/.codex/prompts/';

/**
 * Generates per-IDE slash/workflow command files from SLASH_COMMANDS.
 * Parallel to IdeConfigGenerator — each IDE gets its own directory, file
 * naming, and frontmatter format for the same shared command definitions.
 */
export class SlashCommandGenerator {
  /** Creates the missing command files; an existing one is kept (BL-073) and returned, project-relative. */
  generate(projectDir: string, ide: string, commands: SlashCommand[] = SLASH_COMMANDS): string[] {
    const key = ide.toLowerCase();
    const kept: string[] = [];
    for (const command of commands) {
      const target = resolveTarget(key, command);
      if (!this.write(projectDir, target.dir, target.fileName, target.content)) kept.push(`${target.dir}/${target.fileName}`);
    }
    return kept;
  }

  /** The files `generate()` writes for this IDE, project-relative, in order (BL-055). */
  targets(ide: string, commands: SlashCommand[] = SLASH_COMMANDS): string[] {
    const key = ide.toLowerCase();
    return commands.map(command => {
      const target = resolveTarget(key, command);
      return `${target.dir}/${target.fileName}`;
    });
  }

  /**
   * Brings an existing project's command files for the given IDE up to date (BL-058): adds missing
   * files, replaces files whose bytes match a known SpecPilot version, and keeps everything else
   * untouched. In dry-run, reports the same outcomes and writes nothing.
   */
  refreshCommands(
    projectDir: string,
    ide: string,
    dryRun: boolean,
    commands: SlashCommand[] = SLASH_COMMANDS,
    known: Record<string, string[]> = KNOWN_COMMAND_HASHES,
  ): CommandRefresh {
    const key = ide.toLowerCase();
    const result: CommandRefresh = { added: [], updated: [], kept: [] };
    for (const command of commands) {
      const target = resolveTarget(key, command);
      const path = `${target.dir}/${target.fileName}`;
      const filePath = join(projectDir, ...target.dir.split('/'), target.fileName);
      const linkedFolder = () => result.kept.push({ name: command.name, path, reason: 'folder is a symbolic link or not a folder' });
      // One file failing to write is reported and the rest go on (BL-PM-006).
      try {
        const folders = checkFolders(projectDir, target.dir, false);
        if (folders === 'bad') {
          linkedFolder();
          continue;
        }
        let st = null;
        if (folders === 'ok') {
          try {
            st = lstatSync(filePath);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
          }
        }
        if (!st) {
          if (!dryRun) {
            if (checkFolders(projectDir, target.dir, true) !== 'ok') {
              linkedFolder();
              continue;
            }
            writeFileSync(filePath, target.content, { flag: 'wx' });
          }
          result.added.push(command.name);
          continue;
        }
        if (!st.isFile()) {
          result.kept.push({ name: command.name, path, reason: st.isSymbolicLink() ? 'symbolic link' : 'not a regular file' });
          continue;
        }
        const bytes = readFileSync(filePath);
        if (bytes.equals(Buffer.from(target.content, 'utf-8'))) continue;
        const hashes = known[path] ?? [];
        if (hashes.includes(sha256(bytes))) {
          if (dryRun || this.replace(filePath, st.mode, bytes, target.content)) {
            result.updated.push(command.name);
          } else {
            result.kept.push({ name: command.name, path, reason: 'modified' });
          }
          continue;
        }
        // latin1 maps each byte to one char, so only CR LF pairs change
        const lf = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
        const crlf = !lf.equals(bytes) && hashes.includes(sha256(lf));
        result.kept.push({ name: command.name, path, reason: crlf ? 'CRLF line endings' : 'modified' });
      } catch (err) {
        result.kept.push({ name: command.name, path, reason: `could not be written: ${(err as NodeJS.ErrnoException).code ?? 'unknown error'}` });
      }
    }
    return result;
  }

  /**
   * The Claude Code skill by the commands' rule (BL-PM-012, REQ-002.H.40): while `CLAUDE.md` is present, add a
   * missing skill, replace one whose bytes are SpecPilot's render of `project.yaml` (a released template or the
   * current one), keep anything else with its reason. Null without `CLAUDE.md`. In dry-run, writes nothing.
   */
  refreshSkill(projectDir: string, specsName: string, dryRun: boolean): SkillRefresh | null {
    try {
      if (!lstatSync(join(projectDir, 'CLAUDE.md')).isFile()) return null;
    } catch {
      return null;
    }
    const path = agentTargets('claude-code')[0];
    const dir = path.slice(0, path.lastIndexOf('/'));
    const filePath = join(projectDir, ...path.split('/'));
    const kept = (reason: SkillRefresh['reason']): SkillRefresh => ({ path, action: 'kept', reason });
    const context = readSkillContext(projectDir, specsName);
    if (typeof context === 'string') return kept(context);
    const content = agentFile(new TemplateEngine(), context, 'claude-code')!.content;
    try {
      const folders = checkFolders(projectDir, dir, false);
      if (folders === 'bad') return kept('folder is a symbolic link or not a folder');
      let st = null;
      if (folders === 'ok') {
        try {
          st = lstatSync(filePath);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
      }
      if (!st) {
        if (!dryRun) {
          if (checkFolders(projectDir, dir, true) !== 'ok') return kept('folder is a symbolic link or not a folder');
          writeFileSync(filePath, content, { flag: 'wx' });
        }
        return { path, action: 'added' };
      }
      if (!st.isFile()) return kept(st.isSymbolicLink() ? 'symbolic link' : 'not a regular file');
      const bytes = readFileSync(filePath);
      if (bytes.equals(Buffer.from(content, 'utf-8'))) return { path, action: 'current' };
      const renders = KNOWN_SKILL_TEMPLATES.map(t => Buffer.from(fillReleasedSkill(t, context), 'utf-8'));
      if (renders.some(r => r.equals(bytes))) {
        return dryRun || this.replace(filePath, st.mode, bytes, content) ? { path, action: 'updated' } : kept("does not match SpecPilot's render of project.yaml");
      }
      const lf = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
      const crlf = !lf.equals(bytes) && [...renders, Buffer.from(content, 'utf-8')].some(r => r.equals(lf));
      return kept(crlf ? 'CRLF line endings' : "does not match SpecPilot's render of project.yaml");
    } catch (err) {
      return kept(`could not be written: ${(err as NodeJS.ErrnoException).code ?? 'unknown error'}`);
    }
  }

  /**
   * Replaces `filePath` with `content`: temp file in the same folder, fsync, same mode, rename.
   * Returns false, writing nothing, if the file no longer holds `before` (an editor saved meanwhile).
   */
  private replace(filePath: string, mode: number, before: Buffer, content: string): boolean {
    const tmp = join(dirname(filePath), `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      const fd = openSync(tmp, 'wx', mode & 0o777);
      try {
        writeSync(fd, content);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      chmodSync(tmp, mode & 0o7777);
      if (!readFileSync(filePath).equals(before)) {
        unlinkSync(tmp);
        return false;
      }
      renameSync(tmp, filePath);
      return true;
    } catch (err) {
      try {
        unlinkSync(tmp);
      } catch {
        /* never created, or already renamed */
      }
      throw err;
    }
  }

  private write(projectDir: string, dir: string, fileName: string, content: string): boolean {
    const fullDir = join(projectDir, ...dir.split('/'));
    mkdirSync(fullDir, { recursive: true });
    return writeNew(join(fullDir, fileName), content);
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Walks the folders from `projectDir` down to `dir` (project-relative, `/`-joined) with `lstat`, one level
 * at a time: 'bad' at a symbolic link or a non-folder, 'missing' at the first absent level, else 'ok'.
 * With `create`, an absent level is made with a non-recursive `mkdir` and checked again (BL-PM-006).
 */
function checkFolders(projectDir: string, dir: string, create: boolean): 'ok' | 'missing' | 'bad' {
  let at = projectDir;
  for (const segment of dir.split('/')) {
    at = join(at, segment);
    let st;
    try {
      st = lstatSync(at);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      if (!create) return 'missing';
      mkdirSync(at);
      st = lstatSync(at);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) return 'bad';
  }
  return 'ok';
}

/**
 * Whether the Claude Code skill is SpecPilot's own: no linked folder on the way, a regular file, bytes equal to
 * the current render or a released template's for `.specs/project/project.yaml`. The serve page's "From SpecPilot"
 * group for it (BL-PM-012); anything else is "Yours".
 */
export function isSpecPilotSkill(projectDir: string): boolean {
  const path = agentTargets('claude-code')[0];
  const context = readSkillContext(projectDir, '.specs');
  if (typeof context === 'string') return false;
  try {
    if (checkFolders(projectDir, path.slice(0, path.lastIndexOf('/')), false) !== 'ok') return false;
    const file = join(projectDir, ...path.split('/'));
    if (!lstatSync(file).isFile()) return false;
    const bytes = readFileSync(file);
    const renders = [agentFile(new TemplateEngine(), context, 'claude-code')!.content, ...KNOWN_SKILL_TEMPLATES.map(t => fillReleasedSkill(t, context))];
    return renders.some(r => bytes.equals(Buffer.from(r, 'utf-8')));
  } catch {
    return false;
  }
}

/**
 * Whether `path` (project-relative) is a command file `refreshCommands()` leaves current or may replace:
 * no linked folder on the way, a regular file, bytes hashing to a known version for that path. The serve
 * page's "From SpecPilot" group (BL-PM-006); everything else there is "Yours".
 */
export function isSpecPilotCommand(projectDir: string, path: string, known: Record<string, string[]> = KNOWN_COMMAND_HASHES): boolean {
  const hashes = known[path];
  if (!hashes) return false;
  try {
    if (checkFolders(projectDir, path.slice(0, path.lastIndexOf('/')), false) !== 'ok') return false;
    const file = join(projectDir, ...path.split('/'));
    return lstatSync(file).isFile() && hashes.includes(sha256(readFileSync(file)));
  } catch {
    return false;
  }
}
