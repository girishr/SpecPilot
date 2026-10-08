import { createHash, randomBytes } from 'crypto';
import { basename, dirname, join } from 'path';
import { chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'fs';
import { writeNew } from './ideConfigGenerator';
import { SlashCommand, SLASH_COMMANDS, resolveTarget } from '../core/slashCommands';

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
  ],
  '.agent/workflows/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
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
  ],
  '.claude/commands/specpilot-archive.md': [
    '37bfbac4c2632512de5d0e3e3a68e0904d8cce8cdd9925f53432cdb3066dbe51',
    '3f3e121a9da5cda256f0fcbf3bbd92590cc211d3e67ee59a834c58d6abb589ef',
    '82fa25d0986ba33c240a8817670d5733b353cdc19c0a102b4b29245c348634e0',
    '4ece400213565ec40fdce7e4767f984ee352ddb08cafac35cdaf4731edffcbe7',
    'c456c0067f69c7ec4300bdbe7fed3727734d7df8b44f56bda77d6ac4f7eece10',
  ],
  '.claude/commands/specpilot-backfill.md': [
    '16c9c26b3e63b6e77067dab0037cb49d51d344e9bf392a431f09f7918ee3c813',
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
  ],
  '.codex/prompts/specpilot-archive.md': [
    'dea17f5a6cc488bc95be76413f9ce602082a112835e9395be4aee1e8e463164b',
    'c4ebcf051279e98525351ecb08452f71e28eef173311605908939a0b993fc726',
    '50beaa5de3eaf5a9960ee775e5b9e694998902886d488c30bbdcd252e189214a',
    '4828517e26559b39ec143269a1ddcdd2909eeb2044a97824396a6b91d8ad23c1',
    'dcb3f3baa3fad300e0cf813e9c21c25d7c20dd362857e0aaf34f283536ab6497',
  ],
  '.codex/prompts/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
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
  ],
  '.cursor/commands/specpilot-archive.md': [
    'dea17f5a6cc488bc95be76413f9ce602082a112835e9395be4aee1e8e463164b',
    'c4ebcf051279e98525351ecb08452f71e28eef173311605908939a0b993fc726',
    '50beaa5de3eaf5a9960ee775e5b9e694998902886d488c30bbdcd252e189214a',
    '4828517e26559b39ec143269a1ddcdd2909eeb2044a97824396a6b91d8ad23c1',
    'dcb3f3baa3fad300e0cf813e9c21c25d7c20dd362857e0aaf34f283536ab6497',
  ],
  '.cursor/commands/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
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
  ],
  '.github/prompts/specpilot-archive.prompt.md': [
    '3b669bfe482b6e36bde07eee44d018ba1f66a5996a6069df4180ff8d367c2046',
    '9e75008c25a6820a7be150732e59ab2fa207594a50e98c5dfcaa8c03dc087094',
    '12345bb6d2367a65bc9f2547b85403e781f3f81af664aa51743e96ca6894bac7',
    '6dc00a9bce104395f819bde397978154aadc8716a8258ad3f5bf23559f94f834',
    'd04af73d7f467f888a44e310b669361f6f8863fe325702fe639f51751634e2f2',
  ],
  '.github/prompts/specpilot-backfill.prompt.md': [
    'df986c946846ce107888b4b21e197fb2c8498c6a32925d2d79e92d3dd39298dc',
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
  ],
  '.windsurf/workflows/specpilot-archive.md': [
    'dea17f5a6cc488bc95be76413f9ce602082a112835e9395be4aee1e8e463164b',
    'c4ebcf051279e98525351ecb08452f71e28eef173311605908939a0b993fc726',
    '50beaa5de3eaf5a9960ee775e5b9e694998902886d488c30bbdcd252e189214a',
    '4828517e26559b39ec143269a1ddcdd2909eeb2044a97824396a6b91d8ad23c1',
    'dcb3f3baa3fad300e0cf813e9c21c25d7c20dd362857e0aaf34f283536ab6497',
  ],
  '.windsurf/workflows/specpilot-backfill.md': [
    '1ea360060ab8356bc58e5cde5415ddbf0e3825162f58d1f7c7b7476d894a8737',
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
