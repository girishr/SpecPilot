// BL-203 (REQ-002.A.20, ARCH-004.83): requirements are rewritten in place, originals archived. Pure functions only.
import { createHash } from 'crypto';
import { putBack } from '../utils/contextCompactor';
import { droppedTokens, parseRequirementsPlan, planRequirements, requirementItems } from '../utils/requirementsCompactor';

const TS = '2026-11-26 10:20:30';

const LONG = '- `specpilot archive` moves the Completed section past 25 lines (`40 until BL-123`), keeping 10; it prints `Moved N lines`; the developer asked on 2026-09-01 and the Spec Report said so (BL-061, REQ-002.H.5). [REQ-002.A.8]';
const MULTI = [
  '- Platforms map to CLI languages, as the developer decided after a long discussion on 2026-10-01 (BL-150):',
  '  | Platform | Language |',
  '  |---|---|',
  '  | `ios` | swift | [REQ-002.B.9]',
];
const REQS = [
  '---',
  'title: Requirements',
  '- not an item: front matter',
  '---',
  '',
  '# Requirements',
  '',
  '## Core [REQ-002.A]',
  '',
  LONG,
  '- Short one. [REQ-002.A.9]',
  '- A free-form requirement with no tag.',
  '',
  '### Init [REQ-002.B]',
  '',
  ...MULTI,
  '- After a blank-free list. [REQ-002.B.10]',
  '',
].join('\n');

const sha8 = (lines: string[]) => createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 8);
const block = (key: string, sha: string, reason: string, item: string[]) =>
  [`### ${key} ${sha}`, '', `Reason: ${reason}`, '', '```text', ...item, '```', ''].join('\n');
const plan = (...blocks: string[]) => `# Requirements plan\n\n${blocks.join('\n')}`;
const SHORT_A8 = '- `specpilot archive` moves the Completed section past 25 lines, keeping 10; it prints `Moved N lines` (BL-061). [REQ-002.A.8]';
const SHORT_B9 = ['- Platforms map to CLI languages (BL-150):', '  | Platform | Language |', '  |---|---|', '  | `ios` | swift | [REQ-002.B.9]'];

describe('requirementItems()', () => {
  const items = requirementItems(REQS.split('\n'));

  test('top-level items under a heading, keyed by their trailing tag; nothing before the first heading', () => {
    expect(items.map((i) => i.key)).toEqual(['REQ-002.A.8', 'REQ-002.A.9', null, 'REQ-002.B.9', 'REQ-002.B.10']);
    expect(items.some((i) => REQS.split('\n')[i.start].includes('front matter'))).toBe(false);
  });

  test('indented continuation lines (a nested table) belong to the item; the sha8 is of its bytes', () => {
    const b9 = items.find((i) => i.key === 'REQ-002.B.9')!;
    expect(REQS.split('\n').slice(b9.start, b9.end)).toEqual(MULTI);
    expect(b9.sha8).toBe(sha8(MULTI));
  });

  test('a blank or unindented line ends an item', () => {
    const lines = ['## H', '- First [X-1]', '', '  orphan indented', '- Second [X-2]', 'plain', '  more'];
    expect(requirementItems(lines).map((i) => [i.key, i.start, i.end])).toEqual([['X-1', 1, 2], ['X-2', 4, 5]]);
  });
});

describe('droppedTokens()', () => {
  test('backticked strings and [...] IDs of the original missing from the rewrite', () => {
    expect(droppedTokens('- `a` and `b` [SEC-1] x [REQ-1]', '- `a` x [REQ-1]')).toEqual(['`b`', '[SEC-1]']);
    expect(droppedTokens(LONG, SHORT_A8)).toEqual(['`40 until BL-123`']);
    expect(droppedTokens('- `serve --no-mcp` [X-1]', '- `specpilot serve --no-mcp` [X-1]')).toEqual([]);
  });
});

describe('parseRequirementsPlan()', () => {
  test('### <key> <sha> blocks with a Reason line and a text fence', () => {
    const p = parseRequirementsPlan(plan(block('REQ-002.A.8', 'abcdef12', 'history', [SHORT_A8])));
    expect(p).toEqual({ blocks: [{ key: 'REQ-002.A.8', sha: 'abcdef12', reason: 'history', lines: [SHORT_A8] }] });
  });

  test('a malformed ### heading is refused, not skipped, so the whole plan is refused', () => {
    const p = parseRequirementsPlan(plan(block('REQ-002.A.8', 'abcdef12', 'x', [SHORT_A8]), block('REQ-002.A.9', 'abcdef1', 'x', ['- S. [REQ-002.A.9]'])));
    expect(p).toEqual({ refuse: ['Requirements block 2: the heading "### REQ-002.A.9 abcdef1" is not "### <key> <sha>".'] });
  });

  test('no blocks, or a block with no fence, is refused', () => {
    expect(parseRequirementsPlan('# nothing\n')).toEqual({ refuse: ['The requirements plan has no ### <key> <sha> blocks.'] });
    const r = parseRequirementsPlan('### REQ-1 abcdef12\n\nReason: x\n\nno fence\n');
    expect('refuse' in r && r.refuse[0]).toMatch(/block 1 \(REQ-1\): no ```text fence/);
  });
});

describe('planRequirements()', () => {
  const items = requirementItems(REQS.split('\n'));
  const shaOf = (key: string) => items.find((i) => i.key === key)!.sha8;
  const run = (p: string, text = REQS) => planRequirements(text, p, TS);

  test('rewrites in place, archives the original byte for byte with its reason, every other byte kept', () => {
    const r = run(plan(block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'dropped who asked and the old limit', [SHORT_A8])));
    if (!('newRequirements' in r)) throw new Error(JSON.stringify(r));
    expect(r.rewritten).toBe(1);
    expect(r.saved).toBe(Buffer.byteLength(LONG) - Buffer.byteLength(SHORT_A8));
    expect(r.newRequirements).toBe(REQS.replace(LONG, SHORT_A8));
    expect(r.archiveBlock).toBe(['## Archived on 2026-11-26 10:20:30', '', '### REQ-002.A.8', '', 'Reason: dropped who asked and the old limit', '', LONG, '', '---', '', ''].join('\n'));
    expect(putBack(r.newRequirements, r.moves)).toBe(REQS);
  });

  test('a multi-line rewrite round-trips through putBack() with count', () => {
    const r = run(plan(block('REQ-002.B.9', shaOf('REQ-002.B.9'), 'narration', SHORT_B9)));
    if (!('newRequirements' in r)) throw new Error(JSON.stringify(r));
    expect(r.moves[0].count).toBe(SHORT_B9.length);
    expect(putBack(r.newRequirements, r.moves)).toBe(REQS);
  });

  test('CRLF is kept', () => {
    const crlf = REQS.replace(/\n/g, '\r\n');
    const r = run(plan(block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'x', [SHORT_A8])), crlf);
    if (!('newRequirements' in r)) throw new Error(JSON.stringify(r));
    expect(r.newRequirements).toBe(crlf.replace(LONG, SHORT_A8));
    expect(r.archiveBlock.replace(/\r\n/g, '')).not.toContain('\n');
  });

  test('a rewrite that drops `40 until BL-123` applies with no refusal', () => {
    expect(LONG).toContain('`40 until BL-123`');
    const r = run(plan(block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'x', [SHORT_A8])));
    expect('newRequirements' in r).toBe(true);
  });

  test.each([
    ['a key with no match', () => block('REQ-9.9', 'abcdef12', 'x', ['- y [REQ-9.9]']), /block 1: no item has the key REQ-9\.9/],
    ['a stale sha', () => block('REQ-002.A.8', '00000000', 'x', [SHORT_A8]), /block 1: REQ-002\.A\.8 changed since the plan \(sha 00000000, now [0-9a-f]{8}\)/],
    ['an empty reason', () => block('REQ-002.A.8', shaOf('REQ-002.A.8'), '', [SHORT_A8]), /block 1: REQ-002\.A\.8 needs a reason/],
    ['a new item that does not start with "- "', () => block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'x', ['Text [REQ-002.A.8]']), /does not start with "- "/],
    ['a blank line in the new item', () => block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'x', ['- a', '', '  b [REQ-002.A.8]']), /line 2 of the new item is blank, unindented or a heading/],
    ['an unindented line in the new item', () => block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'x', ['- a', 'b [REQ-002.A.8]']), /line 2 of the new item is blank, unindented or a heading/],
    ['a different key at the end', () => block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'x', ['- a [REQ-002.A.80]']), /does not end with \[REQ-002\.A\.8\]/],
    ['a rewrite not shorter', () => block('REQ-002.A.9', shaOf('REQ-002.A.9'), 'x', ['- Short two. [REQ-002.A.9]']), /REQ-002\.A\.9 is not shorter \(26 bytes, was 26\)/],
  ])('refuses %s, nothing to write', (_name, b, message) => {
    const r = run(plan(b()));
    expect('refuse' in r && r.refuse.join('\n')).toMatch(message);
  });

  test('refuses a key named twice and a key that matches two items', () => {
    const b = block('REQ-002.A.8', shaOf('REQ-002.A.8'), 'x', [SHORT_A8]);
    expect(run(plan(b, b))).toEqual({ refuse: ['Requirements block 2: REQ-002.A.8 is already in block 1.'] });
    const twice = REQS.replace('- Short one. [REQ-002.A.9]', '- Short one. [REQ-002.A.9]\n- Again. [REQ-002.A.9]');
    expect(run(plan(block('REQ-002.A.9', 'abcdef12', 'x', ['- S. [REQ-002.A.9]'])), twice)).toEqual({ refuse: ['Requirements block 1: 2 items have the key REQ-002.A.9.'] });
  });

  test('every problem is reported at once', () => {
    const r = run(plan(block('REQ-9.9', 'abcdef12', 'x', ['- y [REQ-9.9]']), block('REQ-002.A.8', '00000000', '', [SHORT_A8])));
    expect('refuse' in r && r.refuse.length).toBeGreaterThanOrEqual(3);
  });
});
