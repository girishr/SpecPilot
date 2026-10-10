import { answerMcp, McpHeaders, MCP_ALL_VERSIONS, MCP_TOOLS, MCP_VERSIONS, mirroredHeaders, ToolRefusal } from '../utils/mcpLocal';

// BL-PM-007: the protocol of POST /mcp without a server. The tools are stubbed; specServer.test.ts runs the real ones.
const calls: Array<[string, Record<string, unknown>]> = [];
const call = async (name: string, args: Record<string, unknown>) => {
  calls.push([name, args]);
  if (args.refuse) throw new ToolRefusal('refused as the page would');
  if (args.crash) throw new Error('boom');
  return name === 'specpilot_read_spec' ? { text: 'raw text' } : { text: '{"ok":true}', data: { ok: true } };
};
const ask = (msg: unknown, header?: string, tools = MCP_TOOLS) =>
  answerMcp(msg, { 'mcp-protocol-version': header === undefined ? [] : [header], 'mcp-method': [], 'mcp-name': [] }, tools, '9.9.9', call);
const req = (method: string, params?: unknown, id: unknown = 1) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });

beforeEach(() => (calls.length = 0));

describe('initialize', () => {
  it('serves the two initialize-based revisions without batches, newest first', () => {
    expect(MCP_VERSIONS).toEqual(['2025-11-25', '2025-06-18']);
  });

  it.each([['2025-11-25'], ['2025-06-18']])('echoes a supported version: %s', async v => {
    const r = await ask(req('initialize', { protocolVersion: v, capabilities: {}, clientInfo: { name: 't', version: '1' } }));
    expect(r).toEqual({
      status: 200,
      body: { jsonrpc: '2.0', id: 1, result: { protocolVersion: v, capabilities: { tools: {} }, serverInfo: { name: 'specpilot-local', version: '9.9.9' } } },
    });
  });

  it.each([['2025-03-26'], ['2024-11-05'], ['2026-07-28'], [undefined]])('answers the newest for another version: %s', async v => {
    const r = await ask(req('initialize', { protocolVersion: v }));
    expect((r.body as any).result.protocolVersion).toBe('2025-11-25');
  });

  it('ignores the version header on initialize itself', async () => {
    expect((await ask(req('initialize', { protocolVersion: '2025-06-18' }), '1999-01-01')).status).toBe(200);
  });
});

describe('the MCP-Protocol-Version header after initialize', () => {
  it.each([['2025-11-25'], ['2025-06-18'], [undefined]])('serves %s', async h => {
    expect((await ask(req('ping'), h)).status).toBe(200);
  });

  it.each([['2026-07-28'], ['2025-03-26'], ['garbage'], ['']])('refuses %j with 400, as the SDK servers do', async h => {
    const r = await ask(req('tools/list'), h);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: `Bad Request: Unsupported protocol version: ${h} (supported versions: 2025-11-25, 2025-06-18)` } });
  });

  it('refuses the 2026-07-28 discovery probe, so a dual-era client falls back to initialize', async () => {
    expect((await ask(req('server/discover', {}), '2026-07-28')).status).toBe(400);
  });
});

describe('messages', () => {
  it.each([['notifications/initialized'], ['notifications/cancelled'], ['notifications/anything']])('accepts the notification %s with 202 and no body', async method => {
    expect(await ask({ jsonrpc: '2.0', method })).toEqual({ status: 202 });
  });

  it('answers ping', async () => {
    expect(await ask(req('ping', undefined, 'p'))).toEqual({ status: 200, body: { jsonrpc: '2.0', id: 'p', result: {} } });
  });

  it('answers an unknown method with -32601', async () => {
    expect(await ask(req('resources/list'))).toEqual({ status: 200, body: { jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found: resources/list' } } });
  });

  it('refuses a batch with -32600', async () => {
    const r = await ask([req('ping'), req('ping', undefined, 2)]);
    expect(r.status).toBe(400);
    expect((r.body as any).error.code).toBe(-32600);
  });

  it.each([[null], ['ping'], [{ id: 1, method: 'ping' }], [{ jsonrpc: '1.0', id: 1, method: 'ping' }], [{ jsonrpc: '2.0', id: 1 }], [{ jsonrpc: '2.0', id: 1, method: 5 }]])(
    'refuses %j with -32600',
    async msg => {
      const r = await ask(msg);
      expect(r.status).toBe(400);
      expect((r.body as any).error.code).toBe(-32600);
    },
  );
});

describe('tools', () => {
  it('lists the seven tools with the hosted server naming, titles, schemas and annotations, and nothing internal', async () => {
    const tools = ((await ask(req('tools/list'))).body as any).result.tools;
    expect(tools.map((t: any) => t.name)).toEqual([
      'specpilot_list_projects',
      'specpilot_read_spec',
      'specpilot_list_tasks',
      'specpilot_new_task',
      'specpilot_move_task',
      'specpilot_validate_specs',
      'specpilot_regenerate_commands',
    ]);
    for (const t of tools) {
      expect(Object.keys(t)).toEqual(['name', 'title', 'description', 'inputSchema', 'annotations']);
      expect(t.title).toMatch(/^SpecPilot: /);
      expect(t.inputSchema.type).toBe('object');
      expect(t.annotations.openWorldHint).toBe(false);
    }
    const ro = Object.fromEntries(tools.map((t: any) => [t.name, t.annotations.readOnlyHint]));
    expect(ro).toEqual({
      specpilot_list_projects: true,
      specpilot_read_spec: true,
      specpilot_list_tasks: true,
      specpilot_new_task: false,
      specpilot_move_task: false,
      specpilot_validate_specs: true,
      specpilot_regenerate_commands: false,
    });
    expect(tools.find((t: any) => t.name === 'specpilot_new_task').inputSchema.required).toEqual(['description', 'section', 'sha256']);
    expect(tools.find((t: any) => t.name === 'specpilot_move_task').inputSchema.required).toEqual(['id', 'toSection', 'toIndex', 'sha256']);
  });

  it('lists only the tools it is given (the server drops the writes with --read-only)', async () => {
    const reads = MCP_TOOLS.filter(t => !t.writes);
    expect(reads).toHaveLength(4);
    expect(((await ask(req('tools/list'), undefined, reads)).body as any).result.tools).toHaveLength(4);
    const r = await ask(req('tools/call', { name: 'specpilot_new_task', arguments: {} }), undefined, reads);
    expect(r.body).toEqual({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown tool: specpilot_new_task' } });
    expect(calls).toEqual([]);
  });

  it('returns a JSON result as text and structuredContent, and a file as text only', async () => {
    expect((await ask(req('tools/call', { name: 'specpilot_list_tasks', arguments: { project: 1 } }))).body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: '{"ok":true}' }], structuredContent: { ok: true } },
    });
    expect(((await ask(req('tools/call', { name: 'specpilot_read_spec', arguments: { path: 'x' } }))).body as any).result).toEqual({ content: [{ type: 'text', text: 'raw text' }] });
    expect(calls).toEqual([
      ['specpilot_list_tasks', { project: 1 }],
      ['specpilot_read_spec', { path: 'x' }],
    ]);
  });

  it('passes no arguments as {}', async () => {
    await ask(req('tools/call', { name: 'specpilot_list_projects' }));
    expect(calls).toEqual([['specpilot_list_projects', {}]]);
  });

  it('returns a refusal as a tool result with isError, the reason as its text', async () => {
    expect(((await ask(req('tools/call', { name: 'specpilot_move_task', arguments: { refuse: true } }))).body as any).result).toEqual({
      content: [{ type: 'text', text: 'refused as the page would' }],
      isError: true,
    });
  });

  it('lets an unexpected error through to the server (500)', async () => {
    await expect(ask(req('tools/call', { name: 'specpilot_move_task', arguments: { crash: true } }))).rejects.toThrow('boom');
  });

  it.each([[null], [[1]], ['x']])('refuses arguments %j that are not an object with -32602', async args => {
    expect(((await ask(req('tools/call', { name: 'specpilot_list_tasks', arguments: args }))).body as any).error.code).toBe(-32602);
    expect(calls).toEqual([]);
  });

  it('refuses an unknown tool with -32602', async () => {
    expect(((await ask(req('tools/call', { name: 'rm_rf', arguments: {} }))).body as any).error).toEqual({ code: -32602, message: 'Unknown tool: rm_rf' });
  });
});

// BL-089 (REQ-002.H.33, SEC-004.21): revision 2026-07-28 beside the initialize-based ones.
describe('revision 2026-07-28', () => {
  const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 't', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
  const modern = (method: string, params: Record<string, unknown> = {}, meta: Record<string, unknown> = META) => req(method, { ...params, _meta: meta });
  /** The headers a conforming client sends for `msg`; `over` replaces or (with undefined) drops one. */
  const hdrs = (msg: any, over: Partial<Record<keyof McpHeaders, string[]>> = {}): McpHeaders => ({
    'mcp-protocol-version': [String(msg.params._meta['io.modelcontextprotocol/protocolVersion'])],
    'mcp-method': [msg.method],
    'mcp-name': msg.method === 'tools/call' ? [String(msg.params.name)] : [],
    ...over,
  });
  const send = (msg: any, over: Partial<Record<keyof McpHeaders, string[]>> = {}, tools = MCP_TOOLS) => answerMcp(msg, hdrs(msg, over), tools, '9.9.9', call);
  const serverInfo = { 'io.modelcontextprotocol/serverInfo': { name: 'specpilot-local', version: '9.9.9' } };

  it('lists every revision newest first, the initialize-based list unchanged', () => {
    expect(MCP_ALL_VERSIONS).toEqual(['2026-07-28', '2025-11-25', '2025-06-18']);
    expect(MCP_VERSIONS).toEqual(['2025-11-25', '2025-06-18']);
  });

  it('answers server/discover', async () => {
    expect(await send(modern('server/discover'))).toEqual({
      status: 200,
      body: {
        jsonrpc: '2.0',
        id: 1,
        result: { resultType: 'complete', supportedVersions: ['2026-07-28', '2025-11-25', '2025-06-18'], capabilities: { tools: {} }, ttlMs: 0, cacheScope: 'private', _meta: serverInfo },
      },
    });
  });

  it('lists the same tools with the result fields, four with --read-only', async () => {
    const r = (await send(modern('tools/list'))).body as any;
    const legacy = ((await ask(req('tools/list'))).body as any).result;
    expect(r.result).toEqual({ resultType: 'complete', tools: legacy.tools, ttlMs: 0, cacheScope: 'private', _meta: serverInfo });
    const reads = MCP_TOOLS.filter(t => !t.writes);
    expect(((await send(modern('tools/list'), {}, reads)).body as any).result.tools).toHaveLength(4);
    const w = await send(modern('tools/call', { name: 'specpilot_new_task', arguments: {} }), {}, reads);
    expect(w).toEqual({ status: 200, body: { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown tool: specpilot_new_task' } } });
    expect(calls).toEqual([]);
  });

  it('calls a tool: result, text-only result and refusal carry resultType and serverInfo', async () => {
    expect((await send(modern('tools/call', { name: 'specpilot_list_tasks', arguments: { project: 1 } }))).body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { resultType: 'complete', content: [{ type: 'text', text: '{"ok":true}' }], structuredContent: { ok: true }, _meta: serverInfo },
    });
    expect(((await send(modern('tools/call', { name: 'specpilot_read_spec', arguments: { path: 'x' } }))).body as any).result).toEqual({
      resultType: 'complete',
      content: [{ type: 'text', text: 'raw text' }],
      _meta: serverInfo,
    });
    expect(((await send(modern('tools/call', { name: 'specpilot_move_task', arguments: { refuse: true } }))).body as any).result).toEqual({
      resultType: 'complete',
      content: [{ type: 'text', text: 'refused as the page would' }],
      isError: true,
      _meta: serverInfo,
    });
    expect(calls.map(c => c[0])).toEqual(['specpilot_list_tasks', 'specpilot_read_spec', 'specpilot_move_task']);
  });

  it('keeps an unknown tool and arguments that are not an object at -32602 with HTTP 200', async () => {
    expect(await send(modern('tools/call', { name: 'rm_rf', arguments: {} }))).toEqual({ status: 200, body: { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown tool: rm_rf' } } });
    const r = await send(modern('tools/call', { name: 'specpilot_list_tasks', arguments: [1] }));
    expect(r.status).toBe(200);
    expect((r.body as any).error.code).toBe(-32602);
    expect(calls).toEqual([]);
  });

  it.each([['2025-11-25'], ['2027-01-01'], [5], ['']])('refuses the _meta version %j with -32022 and the supported list', async v => {
    const msg = modern('tools/list', {}, { ...META, 'io.modelcontextprotocol/protocolVersion': v });
    expect(await send(msg)).toEqual({
      status: 400,
      body: { jsonrpc: '2.0', id: 1, error: { code: -32022, message: 'Unsupported protocol version', data: { supported: ['2026-07-28', '2025-11-25', '2025-06-18'], requested: v } } },
    });
  });

  it.each<[string, Partial<Record<keyof McpHeaders, string[]>>, string]>([
    ['version missing', { 'mcp-protocol-version': [] }, 'Header mismatch: MCP-Protocol-Version header is missing'],
    ['version different', { 'mcp-protocol-version': ['2025-11-25'] }, "Header mismatch: MCP-Protocol-Version header value '2025-11-25' does not match body value '2026-07-28'"],
    ['version sent twice', { 'mcp-protocol-version': ['2026-07-28', '2026-07-28'] }, 'Header mismatch: MCP-Protocol-Version header was sent 2 times'],
    ['method missing', { 'mcp-method': [] }, 'Header mismatch: Mcp-Method header is missing'],
    ['method in another case', { 'mcp-method': ['Tools/List'] }, "Header mismatch: Mcp-Method header value 'Tools/List' does not match body value 'tools/list'"],
    ['method sent twice', { 'mcp-method': ['tools/list', 'tools/list'] }, 'Header mismatch: Mcp-Method header was sent 2 times'],
  ])('refuses tools/list with the %s with -32020', async (_why, over, message) => {
    expect(await send(modern('tools/list'), over)).toEqual({ status: 400, body: { jsonrpc: '2.0', id: 1, error: { code: -32020, message } } });
  });

  it('wants Mcp-Name on tools/call only, equal to params.name', async () => {
    expect((await send(modern('tools/list'), { 'mcp-name': [] })).status).toBe(200);
    const call1 = modern('tools/call', { name: 'specpilot_list_tasks' });
    expect(((await send(call1, { 'mcp-name': [] })).body as any).error).toEqual({ code: -32020, message: 'Header mismatch: Mcp-Name header is missing' });
    expect(((await send(call1, { 'mcp-name': ['specpilot_read_spec'] })).body as any).error.code).toBe(-32020);
    expect(((await send(call1, { 'mcp-name': ['a', 'b'] })).body as any).error.code).toBe(-32020);
    expect(calls).toEqual([]);
  });

  it.each([[undefined], [5]])('refuses a tools/call whose params.name is %j with -32020', async name => {
    const r = await send(modern('tools/call', { name }), { 'mcp-name': ['specpilot_list_tasks'] });
    expect(r.status).toBe(400);
    expect((r.body as any).error.code).toBe(-32020);
  });

  it('decodes an Mcp-Name sent as =?base64?…?= and refuses one that does not decode', async () => {
    const msg = modern('tools/call', { name: 'specpilot_list_tasks' });
    const b64 = Buffer.from('specpilot_list_tasks').toString('base64');
    expect((await send(msg, { 'mcp-name': [`=?base64?${b64}?=`] })).status).toBe(200);
    expect(((await send(msg, { 'mcp-name': ['=?base64?not base64!?='] })).body as any).error).toEqual({
      code: -32020,
      message: "Header mismatch: Mcp-Name header value '=?base64?not base64!?=' could not be decoded",
    });
    const badUtf8 = Buffer.from([0xff, 0xfe]).toString('base64');
    expect(((await send(msg, { 'mcp-name': [`=?base64?${badUtf8}?=`] })).body as any).error.code).toBe(-32020);
  });

  it.each([['missing', undefined], ['null', null], ['an array', []]])('refuses clientCapabilities %s with -32602 and 400', async (_why, caps) => {
    const meta: Record<string, unknown> = { ...META, 'io.modelcontextprotocol/clientCapabilities': caps };
    if (caps === undefined) delete meta['io.modelcontextprotocol/clientCapabilities'];
    expect(await send(modern('tools/list', {}, meta))).toEqual({
      status: 400,
      body: { jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Invalid params: _meta io.modelcontextprotocol/clientCapabilities is required.' } },
    });
  });

  it('checks the version, then the headers, then the capabilities', async () => {
    const both = modern('tools/list', {}, { ...META, 'io.modelcontextprotocol/protocolVersion': '2027-01-01' });
    expect(((await send(both, { 'mcp-method': [] })).body as any).error.code).toBe(-32022);
    const noCaps = modern('tools/list', {}, { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' });
    expect(((await send(noCaps, { 'mcp-method': [] })).body as any).error.code).toBe(-32020);
  });

  it.each([['initialize'], ['ping'], ['subscriptions/listen'], ['resources/list']])('answers %s with 404 and -32601', async method => {
    expect(await send(modern(method))).toEqual({ status: 404, body: { jsonrpc: '2.0', id: 1, error: { code: -32601, message: `Method not found: ${method}` } } });
  });

  it('accepts a notification with _meta with 202 and no checks', async () => {
    expect(await answerMcp({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { _meta: META } }, hdrs(modern('x'), { 'mcp-method': [] }), MCP_TOOLS, '9.9.9', call)).toEqual({ status: 202 });
  });

  it('keeps a 2026-07-28 header without _meta on the initialize-based path, so a dual-era client falls back', async () => {
    const r = await answerMcp(req('server/discover', {}), { 'mcp-protocol-version': ['2026-07-28'], 'mcp-method': ['server/discover'], 'mcp-name': [] }, MCP_TOOLS, '9.9.9', call);
    expect(r).toEqual({ status: 400, body: { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Bad Request: Unsupported protocol version: 2026-07-28 (supported versions: 2025-11-25, 2025-06-18)' } } });
  });

  it('joins a repeated version header on the initialize-based path, as Node did', async () => {
    const r = await answerMcp(req('ping'), { 'mcp-protocol-version': ['2025-11-25', '2025-11-25'], 'mcp-method': [], 'mcp-name': [] }, MCP_TOOLS, '9.9.9', call);
    expect((r.body as any).error.message).toBe('Bad Request: Unsupported protocol version: 2025-11-25, 2025-11-25 (supported versions: 2025-11-25, 2025-06-18)');
  });
});

describe('mirroredHeaders', () => {
  it('keeps every value of the three headers, any case, and ignores the rest (Mcp-Param-* included)', () => {
    expect(mirroredHeaders(['Host', 'x', 'MCP-Protocol-Version', '2026-07-28', 'mcp-method', 'tools/call', 'Mcp-Method', 'ping', 'Mcp-Param-Region', 'eu', 'Mcp-Name', 'n'])).toEqual({
      'mcp-protocol-version': ['2026-07-28'],
      'mcp-method': ['tools/call', 'ping'],
      'mcp-name': ['n'],
    });
  });
});
