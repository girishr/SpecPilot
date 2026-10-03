import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import * as os from 'os';
import {
  checkOpenPath, MAX_REGISTRY_ENTRIES, pathShapeError, readRegistry, RegistryEntry, registryPath, removeEntry, sortEntries, upsertEntry, writeRegistry,
} from '../utils/projectRegistry';

// Every test here works under a temp HOME (BL-067): the real ~/.specpilot is never read or written.

const REAL_HOME = os.homedir();
let home: string;
let file: string;
const entry = (path: string, lastOpened: string, pinned = false): RegistryEntry => ({ path, lastOpened, pinned });
const valid = (entries: RegistryEntry[]) => JSON.stringify({ version: 1, projects: entries }, null, 2) + '\n';
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const tmpFiles = () => (existsSync(join(home, '.specpilot')) ? readdirSync(join(home, '.specpilot')).filter(n => n.endsWith('.tmp')) : []);

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-home-')));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  file = registryPath();
  if (file.startsWith(REAL_HOME + '/') || file === registryPath(REAL_HOME)) throw new Error('the registry path would be the real one');
});
afterEach(() => {
  process.env.HOME = REAL_HOME;
  process.env.USERPROFILE = REAL_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe('registryPath', () => {
  it('is under the temp HOME, never the real one', () => {
    expect(file).toBe(join(home, '.specpilot', 'projects.json'));
    expect(file.startsWith(REAL_HOME + '/')).toBe(false);
  });
});

describe('readRegistry', () => {
  it('treats a missing file as an empty registry and creates nothing', () => {
    expect(readRegistry(file)).toEqual({ entries: [], exists: false, error: null });
    expect(existsSync(join(home, '.specpilot'))).toBe(false);
  });

  it('returns the entries of a valid file as written', () => {
    const entries = [entry('/a', '2026-10-01T10:00:00.000Z'), entry('/b', '2026-10-02T10:00:00.000Z', true)];
    mkdirSync(join(home, '.specpilot'));
    writeFileSync(file, valid(entries));
    expect(readRegistry(file)).toEqual({ entries, exists: true, error: null });
  });

  it.each([
    ['invalid JSON', '{not json'],
    ['a JSON array', '[]'],
    ['version 2', JSON.stringify({ version: 2, projects: [] })],
    ['projects not an array', JSON.stringify({ version: 1, projects: {} })],
    ['an entry missing a field', JSON.stringify({ version: 1, projects: [{ path: '/a', lastOpened: '2026-10-01T10:00:00.000Z' }] })],
    ['an entry with an extra field', JSON.stringify({ version: 1, projects: [{ path: '/a', lastOpened: '2026-10-01T10:00:00.000Z', pinned: false, name: 'x' }] })],
    ['a relative path', JSON.stringify({ version: 1, projects: [{ path: 'a', lastOpened: '2026-10-01T10:00:00.000Z', pinned: false }] })],
    ['a non-string path', JSON.stringify({ version: 1, projects: [{ path: 1, lastOpened: '2026-10-01T10:00:00.000Z', pinned: false }] })],
    ['two entries with one path', valid([entry('/a', '2026-10-01T10:00:00.000Z'), entry('/a', '2026-10-02T10:00:00.000Z')])],
    ['a non-boolean pinned', JSON.stringify({ version: 1, projects: [{ path: '/a', lastOpened: '2026-10-01T10:00:00.000Z', pinned: 'yes' }] })],
    ['a non-string lastOpened', JSON.stringify({ version: 1, projects: [{ path: '/a', lastOpened: 5, pinned: false }] })],
    ['a lastOpened Date.parse rejects', JSON.stringify({ version: 1, projects: [{ path: '/a', lastOpened: 'yesterday-ish', pinned: false }] })],
  ])('refuses %s with a reason, leaves the file byte-identical and writes nothing', (_name, text) => {
    mkdirSync(join(home, '.specpilot'));
    writeFileSync(file, text);
    const before = sha(file);
    const read = readRegistry(file);
    expect(read.error).toMatch(/could not be used|not valid JSON/);
    expect(read.entries).toBeNull();
    expect(() => writeRegistry(file, [])).toThrow();
    expect(sha(file)).toBe(before);
    expect(tmpFiles()).toEqual([]);
  });

  it('refuses projects.json that is a symbolic link and never touches its target', () => {
    const target = join(home, 'elsewhere.json');
    writeFileSync(target, valid([entry('/a', '2026-10-01T10:00:00.000Z')]));
    mkdirSync(join(home, '.specpilot'));
    symlinkSync(target, file);
    const before = sha(target);
    expect(readRegistry(file).error).toMatch(/symbolic link/);
    expect(() => writeRegistry(file, [])).toThrow(/symbolic link/);
    expect(lstatSync(file).isSymbolicLink()).toBe(true);
    expect(sha(target)).toBe(before);
  });

  it('refuses ~/.specpilot that is a regular file, byte-identical afterwards', () => {
    writeFileSync(join(home, '.specpilot'), 'a file\n');
    expect(readRegistry(file).error).toMatch(/not a folder/);
    expect(() => writeRegistry(file, [])).toThrow(/not a folder/);
    expect(readFileSync(join(home, '.specpilot'), 'utf-8')).toBe('a file\n');
  });

  it('refuses ~/.specpilot that is a link to a folder elsewhere and writes nothing there', () => {
    const other = join(home, 'other');
    mkdirSync(other);
    symlinkSync(other, join(home, '.specpilot'));
    expect(readRegistry(file).error).toMatch(/symbolic link/);
    expect(() => writeRegistry(file, [])).toThrow(/symbolic link/);
    expect(readdirSync(other)).toEqual([]);
  });

  it('refuses a file it cannot read', () => {
    if (process.getuid && process.getuid() === 0) return; // root reads anything
    mkdirSync(join(home, '.specpilot'));
    writeFileSync(file, valid([]));
    chmodSync(file, 0o000);
    try {
      expect(readRegistry(file).error).toMatch(/could not be read \(EACCES\)/);
      expect(() => writeRegistry(file, [])).toThrow(/could not be read/);
    } finally {
      chmodSync(file, 0o600);
    }
  });
});

describe('writeRegistry', () => {
  it('creates the folder with mode 0700 and the file with mode 0600, no temp file left, content round-trips', () => {
    const entries = [entry('/a', '2026-10-01T10:00:00.000Z')];
    writeRegistry(file, entries);
    expect(statSync(join(home, '.specpilot')).mode & 0o777).toBe(0o700);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(tmpFiles()).toEqual([]);
    expect(readRegistry(file)).toEqual({ entries, exists: true, error: null });
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ version: 1, projects: entries });
  });

  it('replaces atomically on a second write: new inode, mode kept, no temp file', () => {
    writeRegistry(file, [entry('/a', '2026-10-01T10:00:00.000Z')]);
    const ino = statSync(file).ino;
    writeRegistry(file, [entry('/b', '2026-10-02T10:00:00.000Z')]);
    expect(statSync(file).ino).not.toBe(ino);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(tmpFiles()).toEqual([]);
    expect(readRegistry(file).entries).toEqual([entry('/b', '2026-10-02T10:00:00.000Z')]);
  });
});

describe('upsertEntry, removeEntry, sortEntries', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');

  it('refreshes lastOpened in place and appends a new entry with pinned false', () => {
    const entries = [entry('/a', '2026-10-01T10:00:00.000Z', true), entry('/b', '2026-10-02T10:00:00.000Z')];
    expect(upsertEntry(entries, '/a', now)).toEqual([entry('/a', now.toISOString(), true), entries[1]]);
    expect(upsertEntry(entries, '/c', now)).toEqual([...entries, entry('/c', now.toISOString())]);
    expect(entries).toHaveLength(2); // input untouched
  });

  it('drops the oldest unpinned entry past the cap, pinned ones last', () => {
    const many: RegistryEntry[] = [];
    for (let i = 0; i < MAX_REGISTRY_ENTRIES; i++) many.push(entry(`/p${i}`, new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), i === 0));
    const next = upsertEntry(many, '/new', now);
    expect(next).toHaveLength(MAX_REGISTRY_ENTRIES);
    expect(next.some(e => e.path === '/p0')).toBe(true); // oldest, but pinned
    expect(next.some(e => e.path === '/p1')).toBe(false); // oldest unpinned
    expect(next.some(e => e.path === '/new')).toBe(true);
    const allPinned = many.map(e => ({ ...e, pinned: true }));
    const next2 = upsertEntry(allPinned, '/new', now);
    expect(next2.some(e => e.path === '/p0')).toBe(false); // no unpinned left: the oldest pinned goes
    expect(next2.some(e => e.path === '/new')).toBe(true); // never the one just opened
  });

  it('removes by exact stored path only', () => {
    const entries = [entry('/a/b', '2026-10-01T10:00:00.000Z')];
    expect(removeEntry(entries, '/a/b')).toEqual([]);
    expect(removeEntry(entries, '/a/b/')).toBeNull();
    expect(removeEntry(entries, '~/b')).toBeNull();
  });

  it('sorts pinned first, then newest first', () => {
    const a = entry('/a', '2026-10-01T10:00:00.000Z'), b = entry('/b', '2026-10-03T10:00:00.000Z'), c = entry('/c', '2026-10-02T10:00:00.000Z', true);
    expect(sortEntries([a, b, c])).toEqual([c, b, a]);
  });
});

describe('pathShapeError', () => {
  it.each([
    [null], [[]], ['x'], [{}], [{ path: '/a', extra: 1 }], [{ path: 1 }], [{ path: '' }], [{ path: 'a'.repeat(4097) }], [{ path: '/a\0b' }],
  ])('refuses %p', body => expect(pathShapeError(body)).not.toBeNull());
  it('accepts {path}', () => expect(pathShapeError({ path: '/a' })).toBeNull());
});

describe('checkOpenPath', () => {
  let base: string;
  beforeEach(() => (base = realpathSync(mkdtempSync(join(os.tmpdir(), 'specpilot-open-')))));
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('expands ~ and ~/ against the given home only, and not ~name', () => {
    mkdirSync(join(home, 'proj'));
    expect(checkOpenPath('~/proj', [], home)).toEqual({ root: join(home, 'proj') });
    expect(checkOpenPath('~', [], home)).toMatchObject({ status: 422, error: expect.stringMatching(/home folder/) });
    expect(checkOpenPath('~user/proj', [], home)).toMatchObject({ status: 422, error: expect.stringMatching(/must be absolute/) });
  });

  it('refuses a relative path', () => {
    expect(checkOpenPath('proj', [], home)).toMatchObject({ status: 422, error: 'The path must be absolute, e.g. /Users/you/project or ~/project.' });
  });

  it('refuses a missing folder and a symbolic-link loop, naming the input', () => {
    expect(checkOpenPath(join(base, 'nope'), [], home)).toEqual({ status: 422, error: `Folder not found: ${join(base, 'nope')}` });
    symlinkSync(join(base, 'loop'), join(base, 'loop'));
    expect(checkOpenPath(join(base, 'loop'), [], home)).toEqual({ status: 422, error: `Folder not found: ${join(base, 'loop')}` });
  });

  it('refuses a file', () => {
    writeFileSync(join(base, 'f'), 'x');
    expect(checkOpenPath(join(base, 'f'), [], home)).toEqual({ status: 422, error: `Not a folder: ${join(base, 'f')}` });
  });

  it('refuses the home folder, also through a link, and a file-system root', () => {
    const msg = 'SpecPilot does not open your home folder or the root of a drive.';
    expect(checkOpenPath(home, [], home)).toEqual({ status: 422, error: msg });
    symlinkSync(home, join(base, 'tohome'));
    expect(checkOpenPath(join(base, 'tohome'), [], home)).toEqual({ status: 422, error: msg });
    expect(checkOpenPath('/', [], home)).toEqual({ status: 422, error: msg });
  });

  it('refuses a served root with its index, also via a link or a trailing slash', () => {
    const a = join(base, 'a'), b = join(base, 'b');
    mkdirSync(a);
    mkdirSync(b);
    symlinkSync(b, join(base, 'tob'));
    expect(checkOpenPath(b, [a, b], home)).toEqual({ status: 409, error: `${b} is already open as project 1.`, project: 1 });
    expect(checkOpenPath(join(base, 'tob'), [a, b], home)).toMatchObject({ status: 409, project: 1 });
    expect(checkOpenPath(a + '/', [a, b], home)).toMatchObject({ status: 409, project: 0 });
  });

  it('returns the real path of a folder with or without .specs/', () => {
    const a = join(base, 'a');
    mkdirSync(join(a, '.specs'), { recursive: true });
    mkdirSync(join(base, 'b'));
    expect(checkOpenPath(a, [], home)).toEqual({ root: a });
    expect(checkOpenPath(join(base, 'b'), [], home)).toEqual({ root: join(base, 'b') });
  });
});
