import { answerMcp, MCP_TOOLS, MCP_VERSIONS, ToolRefusal } from '../utils/mcpLocal';

// BL-PM-007: the protocol of POST /mcp without a server. The tools are stubbed; specServer.test.ts runs the real ones.
const calls: Array<[string, Record<string, unknown>]> = [];
const call = async (name: string, args: Record<string, unknown>) => {
  calls.push([name, args]);
  if (args.refuse) throw new ToolRefusal('refused as the page would');
  if (args.crash) throw new Error('boom');
  return name === 'specpilot_read_spec' ? { text: 'raw text' } : { text: '{"ok":true}', data: { ok: true } };
};
const ask = (msg: unknown, header?: string, tools = MCP_TOOLS) => answerMcp(msg, header, tools, '9.9.9', call);
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
