// The pure spec core (BL-032): nothing in this folder imports a Node API (REQ-002.I.2).
export { render, toContext, inferApiParadigm, targetsInSpecs, targetsOutsideSpecs, AGENT_IDES } from './render';
export type { RenderOptions, RenderedFile, RenderResult } from './render';
export { TemplateEngine } from './templateEngine';
export type { TemplateContext, ProjectContext } from './templateEngine';
export { SLASH_COMMANDS, commandFiles, resolveTarget } from './slashCommands';
export type { SlashCommand } from './slashCommands';
export { GITATTRIBUTES_FILE, GITATTRIBUTES_LINES, buildCopilotInstructions } from './ideConfig';
