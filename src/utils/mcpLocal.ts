// The local MCP endpoint of `specpilot serve --mcp` (BL-PM-007, REQ-002.H.33, ARCH-004.50, SEC-004.20):
// the protocol only. Stateless Streamable HTTP, JSON answers, written by hand so no SDK or schema library
// is added (SEC-004.4). The tools run the page's own functions; specServer.ts supplies them as `call`.
// Revision 2026-07-28 (BL-089, SEC-004.21) is served beside them: a request whose `_meta` names a protocol
// version is answered by its rules, every other message as before.

/** Protocol revisions served, newest first: the initialize-based ones without JSON-RPC batches. */
export const MCP_VERSIONS = ['2025-11-25', '2025-06-18'];
/** The handshake-free revision: version, client and capabilities in every request's `_meta`. */
export const MCP_MODERN = '2026-07-28';
/** Every revision served, newest first, as `server/discover` and -32022 list them. */
export const MCP_ALL_VERSIONS = [MCP_MODERN, ...MCP_VERSIONS];
const META = 'io.modelcontextprotocol/';

/** The request headers 2026-07-28 mirrors from the body, every value sent (Node joins repeats in `req.headers`). */
export type McpHeaders = Record<'mcp-protocol-version' | 'mcp-method' | 'mcp-name', string[]>;

export function mirroredHeaders(rawHeaders: string[]): McpHeaders {
  const out: McpHeaders = { 'mcp-protocol-version': [], 'mcp-method': [], 'mcp-name': [] };
  for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase();
    if (name in out) out[name as keyof McpHeaders].push(rawHeaders[i + 1]);
  }
  return out;
}

/** An `Mcp-Name` value: `=?base64?…?=` decoded as UTF-8, undefined when that cannot be done exactly. */
function decodeName(value: string): string | undefined {
  const m = /^=\?base64\?(.*)\?=$/.exec(value);
  if (!m) return value;
  if (Buffer.from(m[1], 'base64').toString('base64') !== m[1]) return undefined;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(m[1], 'base64'));
  } catch {
    return undefined;
  }
}

/** Why a mirrored header does not stand for the body's value, or undefined when it does. */
function headerMismatch(header: string, sent: string[], body: unknown, decode = (v: string): string | undefined => v): string | undefined {
  if (sent.length === 0) return `Header mismatch: ${header} header is missing`;
  if (sent.length > 1) return `Header mismatch: ${header} header was sent ${sent.length} times`;
  const value = decode(sent[0]);
  if (value === undefined) return `Header mismatch: ${header} header value '${sent[0]}' could not be decoded`;
  if (value !== body) return `Header mismatch: ${header} header value '${sent[0]}' does not match body value '${String(body)}'`;
  return undefined;
}

/** A refused tool call: shown to the agent as a tool result with `isError: true`. */
export class ToolRefusal extends Error {}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  /** Writes a file: absent with `--read-only`. */
  writes: boolean;
}

const project = { type: 'integer', minimum: 0, description: 'Index of the served project, as specpilot_list_projects gives it. Default 0.' };
const sha256 = { type: 'string', description: 'The tasks.md hash specpilot_list_tasks returned. A stale hash is refused and nothing is written.' };
const section = { type: 'string', enum: ['backlog', 'currentSprint'] };
const READ = { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, idempotentHint: false, destructiveHint: false, openWorldHint: false };
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties: { project, ...properties }, required, additionalProperties: false });

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'specpilot_list_projects',
    title: 'SpecPilot: list served projects',
    description: 'The projects this specpilot serve shows: index, name, folder, git branch, whether .specs/ exists, and the spec file paths specpilot_read_spec accepts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ,
    writes: false,
  },
  {
    name: 'specpilot_read_spec',
    title: 'SpecPilot: read a spec file',
    description: 'The text of one file, verbatim: a .specs/ file, or an instruction, command or skill file the page also shows (e.g. CLAUDE.md).',
    inputSchema: schema({ path: { type: 'string', description: 'Project-relative path, e.g. .specs/project/requirements.md' } }, ['path']),
    annotations: READ,
    writes: false,
  },
  {
    name: 'specpilot_list_tasks',
    title: 'SpecPilot: list tasks',
    description: 'The rows of .specs/planning/tasks.md by section (Backlog, Current Sprint, Completed), verbatim, and the file hash (sha256) the task writes need.',
    inputSchema: schema({}),
    annotations: READ,
    writes: false,
  },
  {
    name: 'specpilot_new_task',
    title: 'SpecPilot: add a task',
    description: 'Add one row to Backlog (BL-###) or Current Sprint (CS-###) in .specs/planning/tasks.md, with the next free ID. The description is one line, without |.',
    inputSchema: schema({ description: { type: 'string' }, section, sha256 }, ['description', 'section', 'sha256']),
    annotations: WRITE,
    writes: true,
  },
  {
    name: 'specpilot_move_task',
    title: 'SpecPilot: move a task',
    description: 'Move one row of .specs/planning/tasks.md to Backlog or Current Sprint at a 0-based position. The row itself is not changed.',
    inputSchema: schema({ id: { type: 'string' }, toSection: section, toIndex: { type: 'integer', minimum: 0 }, sha256 }, ['id', 'toSection', 'toIndex', 'sha256']),
    annotations: WRITE,
    writes: true,
  },
  {
    name: 'specpilot_validate_specs',
    title: 'SpecPilot: validate specs',
    description: 'The checks of specpilot validate, without --fix: errors and warnings as it words them. Writes nothing.',
    inputSchema: schema({}),
    annotations: READ,
    writes: false,
  },
  {
    name: 'specpilot_regenerate_commands',
    title: 'SpecPilot: regenerate commands',
    description: "specpilot backfill's command step: adds missing specpilot-* command files and updates unedited ones for each IDE in use; everything else is kept and listed.",
    inputSchema: schema({}),
    annotations: WRITE,
    writes: true,
  },
];

export interface McpReply {
  /** HTTP status; 202 has no body. */
  status: number;
  body?: unknown;
}

export const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

type Call = (name: string, args: Record<string, unknown>) => Promise<{ text: string; data?: Record<string, unknown> }>;

const listTools = (tools: McpTool[]) => tools.map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations }));

/** tools/call, the same in both eras: an unknown tool or arguments that are not an object are -32602 with 200. */
async function runTool(id: unknown, params: Record<string, unknown>, tools: McpTool[], call: Call): Promise<McpReply> {
  const ok = (result: unknown): McpReply => ({ status: 200, body: { jsonrpc: '2.0', id, result } });
  const tool = tools.find(t => t.name === params.name);
  if (!tool) return { status: 200, body: rpcError(id, -32602, `Unknown tool: ${String(params.name)}`) };
  const args = params.arguments === undefined ? {} : params.arguments;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return { status: 200, body: rpcError(id, -32602, 'Tool arguments must be an object.') };
  try {
    const out = await call(tool.name, args as Record<string, unknown>);
    return ok({ content: [{ type: 'text', text: out.text }], ...(out.data ? { structuredContent: out.data } : {}) });
  } catch (err) {
    if (err instanceof ToolRefusal) return ok({ content: [{ type: 'text', text: err.message }], isError: true });
    throw err;
  }
}

/**
 * Answer one parsed JSON-RPC message. `headers` are the mirrored request headers, every value sent;
 * `call` runs a tool and returns what it found, or throws ToolRefusal with the reason.
 */
export async function answerMcp(msg: unknown, headers: McpHeaders, tools: McpTool[], version: string, call: Call): Promise<McpReply> {
  if (Array.isArray(msg)) return { status: 400, body: rpcError(null, -32600, 'Batches are not supported: send one JSON-RPC message per request.') };
  const m = msg as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown } | null;
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return { status: 400, body: rpcError(m && typeof m === 'object' ? m.id : null, -32600, 'Not a JSON-RPC 2.0 request.') };
  }
  const params = (m.params && typeof m.params === 'object' ? m.params : {}) as Record<string, unknown>;
  const meta = params._meta && typeof params._meta === 'object' ? (params._meta as Record<string, unknown>) : {};
  if (`${META}protocolVersion` in meta) {
    if (m.id === undefined) return { status: 202 }; // 2026-07-28 defines no client notification over HTTP
    return answerModern(m.id, m.method, params, meta, headers, tools, version, call);
  }
  // After initialize the client names the agreed revision on every request; a missing header is the
  // spec's backwards-compatible case and is served the same way.
  const sent = headers['mcp-protocol-version'];
  const header = sent.length ? sent.join(', ') : undefined;
  if (m.method !== 'initialize' && header !== undefined && !MCP_VERSIONS.includes(header)) {
    return { status: 400, body: rpcError(m.id, -32000, `Bad Request: Unsupported protocol version: ${header} (supported versions: ${MCP_VERSIONS.join(', ')})`) };
  }
  if (m.id === undefined) return { status: 202 }; // a notification, e.g. notifications/initialized
  const ok = (result: unknown): McpReply => ({ status: 200, body: { jsonrpc: '2.0', id: m.id, result } });

  if (m.method === 'initialize') {
    const asked = params.protocolVersion;
    return ok({
      protocolVersion: typeof asked === 'string' && MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
      capabilities: { tools: {} },
      serverInfo: { name: 'specpilot-local', version },
    });
  }
  if (m.method === 'ping') return ok({});
  if (m.method === 'tools/list') return ok({ tools: listTools(tools) });
  if (m.method === 'tools/call') return runTool(m.id, params, tools, call);
  return { status: 200, body: rpcError(m.id, -32601, `Method not found: ${m.method}`) };
}

/** A 2026-07-28 request: version, mirrored headers and capabilities checked, in that order, before any dispatch. */
async function answerModern(
  id: unknown,
  method: string,
  params: Record<string, unknown>,
  meta: Record<string, unknown>,
  headers: McpHeaders,
  tools: McpTool[],
  version: string,
  call: Call,
): Promise<McpReply> {
  const fail = (status: number, code: number, message: string, data?: unknown): McpReply => ({
    status,
    body: { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } },
  });
  const asked = meta[`${META}protocolVersion`];
  if (asked !== MCP_MODERN) return fail(400, -32022, 'Unsupported protocol version', { supported: MCP_ALL_VERSIONS, requested: asked });
  const mismatch =
    headerMismatch('MCP-Protocol-Version', headers['mcp-protocol-version'], asked) ??
    headerMismatch('Mcp-Method', headers['mcp-method'], method) ??
    (method === 'tools/call' ? headerMismatch('Mcp-Name', headers['mcp-name'], params.name, decodeName) : undefined);
  if (mismatch) return fail(400, -32020, mismatch);
  const caps = meta[`${META}clientCapabilities`];
  if (!caps || typeof caps !== 'object' || Array.isArray(caps)) return fail(400, -32602, `Invalid params: _meta ${META}clientCapabilities is required.`);

  const serverInfo = { [`${META}serverInfo`]: { name: 'specpilot-local', version } };
  // ttlMs 0 and private: the list holds for one run of serve only, and comes from a token-guarded endpoint.
  const cache = { ttlMs: 0, cacheScope: 'private' };
  const ok = (result: Record<string, unknown>): McpReply => ({ status: 200, body: { jsonrpc: '2.0', id, result: { resultType: 'complete', ...result, _meta: serverInfo } } });
  if (method === 'server/discover') return ok({ supportedVersions: MCP_ALL_VERSIONS, capabilities: { tools: {} }, ...cache });
  if (method === 'tools/list') return ok({ tools: listTools(tools), ...cache });
  if (method === 'tools/call') {
    const reply = await runTool(id, params, tools, call);
    const body = reply.body as { result?: Record<string, unknown> };
    return body.result ? ok(body.result) : reply;
  }
  return fail(404, -32601, `Method not found: ${method}`);
}
