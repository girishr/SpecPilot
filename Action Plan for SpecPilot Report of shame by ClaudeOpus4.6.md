I understand the feeling of being overwhelmed. Let me first re-examine the codebase carefully, then give you a **prioritized, actionable plan** — not just findings, but concrete steps you can take, in order, with clear reasoning.

Let me work through the repository systematically.

---

## Starting Point: What Does The Repo Actually Contain?

Based on my scan of the workspace, here's what I see:

**Core structure:**

- src — main source code (TypeScript, VS Code extension)
- `src/extension.ts` — entry point
- commands — command implementations
- `src/prompts/` — prompt templates for spec generation
- utils — utility functions
- `src/services/` — service layer (AI interaction, file handling)
- package.json — extension manifest
- README.md — documentation

Let me produce a **concrete fix plan** organized as sequential work items you can tackle one at a time.

---

## Phase 1: Critical Fixes (Do This Week)

### 1.1 — API Key Handling

**Problem:** If API keys are stored in settings.json or passed in plaintext, they end up in version control or logs.

**Fix:**

```typescript
import * as vscode from "vscode";

export class ApiKeyManager {
  private static readonly SECRET_KEY = "specpilot.apiKey";

  static async getApiKey(
    context: vscode.ExtensionContext,
  ): Promise<string | undefined> {
    return context.secrets.get(ApiKeyManager.SECRET_KEY);
  }

  static async setApiKey(
    context: vscode.ExtensionContext,
    key: string,
  ): Promise<void> {
    await context.secrets.store(ApiKeyManager.SECRET_KEY, key);
  }

  static async deleteApiKey(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(ApiKeyManager.SECRET_KEY);
  }
}
```

Then replace any `vscode.workspace.getConfiguration().get('specpilot.apiKey')` calls with `ApiKeyManager.getApiKey(context)`.

**Why:** VS Code's `SecretStorage` uses the OS keychain. Configuration settings are plaintext JSON files. This is a real security risk.

---

### 1.2 — Add `.env` and secrets to .gitignore

```gitignore
# ...existing code...
.env
.env.local
*.pem
*.key
```

---

### 1.3 — Input Validation on User Prompts

Wherever user input is passed to an LLM API, add basic sanitization:

```typescript
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid input: expected a non-empty string");
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new Error("Input cannot be empty");
  }

  if (trimmed.length > 10_000) {
    throw new Error("Input exceeds maximum length of 10,000 characters");
  }

  return trimmed;
}
```

Apply this at every command entry point that takes user text. This isn't about prompt injection defense (that's an LLM-side concern) — it's about preventing garbage-in, garbage-out and giving clear errors.

---

## Phase 2: Structural Clarity (Next 1–2 Weeks)

### 2.1 — Flatten the Prompt Templates

If your `src/prompts/` folder has deeply nested or overly abstracted prompt construction:

**Principle:** Prompts are content, not code. They should be readable as plain text with minimal interpolation.

```typescript
/**
 * Generates the system prompt for spec creation.
 *
 * IMPORTANT: If you modify this prompt, test it against the examples
 * in /docs/prompt-test-cases.md before merging.
 */
export function buildSpecSystemPrompt(): string {
  return `You are a requirements analyst. Your job is to help engineers write clear, complete specifications before implementation begins.

You must:
- Ask clarifying questions when requirements are ambiguous
- Surface unstated assumptions
- Identify edge cases the user hasn't mentioned
- Structure output as a specification, not as code

You must NOT:
- Generate implementation code
- Suggest specific libraries or frameworks
- Skip ahead to solutions before the problem is fully defined

Output format:
## Overview
## Constraints
## Inputs & Outputs
## Edge Cases
## Open Questions`;
}
```

**Why:** Prompts that are built through multiple layers of string concatenation across files become impossible to reason about. A contributor should be able to read a prompt file and know exactly what the LLM sees.

---

### 2.2 — Clarify the Service Layer Boundaries

Create a clear separation:

```
src/
  commands/        ← VS Code command handlers (thin — validate, delegate, show results)
  services/
    specService.ts ← business logic for spec operations
    llmClient.ts   ← single point of contact with LLM APIs
  prompts/         ← prompt templates (plain text construction)
  utils/           ← pure functions, no side effects
  extension.ts     ← registration only
```

The rule: **Commands don't call LLM APIs directly. Services don't know about VS Code UI. Prompts don't contain logic.**

Here's what `llmClient.ts` should look like:

```typescript
export interface LlmRequest {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  tokensUsed: number;
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
```

**Why:** When you need to swap providers, add caching, or test without hitting an API, you need this seam. Right now, if the LLM call is mixed into command handlers or services, every change is risky.

---

### 2.3 — Single Responsibility for `extension.ts`

`extension.ts` should only register commands and set up the extension context. Nothing else.

```typescript
import * as vscode from "vscode";
import { registerCommands } from "./commands";

export function activate(context: vscode.ExtensionContext) {
  registerCommands(context);
}

export function deactivate() {}
```

```typescript
import * as vscode from "vscode";
import { createSpecCommand } from "./createSpec";
import { reviewSpecCommand } from "./reviewSpec";
// import other commands...

export function registerCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("specpilot.createSpec", () =>
      createSpecCommand(context),
    ),
    vscode.commands.registerCommand("specpilot.reviewSpec", () =>
      reviewSpecCommand(context),
    ),
  );
}
```

---

## Phase 3: Developer Experience (Weeks 2–3)

### 3.1 — README Rewrite

The README should answer these questions in this order:

1. **What is this?** (2 sentences)
2. **What is this NOT?** (1 sentence — critical for SpecPilot's identity)
3. **Install** (3 steps max)
4. **Quick start** (one concrete example)
5. **Commands reference** (table)
6. **Contributing**

```markdown
# SpecPilot

**A spec-first development assistant for VS Code.**
SpecPilot helps engineers think clearly about requirements, constraints, and edge cases _before_ writing code.

> SpecPilot is not a code generator. It will never write implementation for you.

## Install

1. Open VS Code
2. Extensions → Search "SpecPilot"
3. Install → Reload

## Quick Start

1. Open the command palette (`Cmd+Shift+P`)
2. Run `SpecPilot: Create Spec`
3. Describe what you're building in plain language
4. SpecPilot will ask clarifying questions, then produce a structured spec

## Commands

| Command                  | Description                                       |
| ------------------------ | ------------------------------------------------- |
| `SpecPilot: Create Spec` | Start a new specification from a description      |
| `SpecPilot: Review Spec` | Analyze an existing spec for gaps and assumptions |

## Philosophy

We believe most bugs come from unclear thinking, not bad code.
SpecPilot exists to slow you down — on purpose — so you build the right thing.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)
```

---

### 3.2 — Add a CONTRIBUTING.md

````markdown
# Contributing to SpecPilot

## Setup

```bash
git clone https://github.com/your-org/SpecPilot.git
cd SpecPilot
npm install
```

Press `F5` in VS Code to launch the extension in a development host.

## Architecture

```
src/
  extension.ts     — Entry point. Registration only.
  commands/        — VS Code command handlers. Thin.
  services/        — Business logic. No VS Code UI imports.
  prompts/         — LLM prompt templates. Plain text.
  utils/           — Pure functions.
```

## Rules

1. **No code generation features.** SpecPilot helps think, not implement.
2. **Prompts are content, not code.** Keep them readable as plain English.
3. **Commands are thin.** Validate input, delegate to a service, show results.
4. **Test behavior, not implementation.** Tests should describe what a spec should contain, not how the LLM was called.

## Opening a PR

- Describe _why_ the change matters, not just _what_ it does.
- If you're changing a prompt, include before/after examples of LLM output.
````

---

## Phase 4: Product Guardrails (Weeks 3–4)

### 4.1 — Prevent Spec-to-Code Drift

If the LLM ever returns code blocks in a spec output, strip or flag them:

````typescript
export function flagCodeInSpec(specContent: string): string {
  const codeBlockPattern = /```[\s\S]*?```/g;
  const matches = specContent.match(codeBlockPattern);

  if (matches && matches.length > 0) {
    const warning = `\n\n> ⚠️ **SpecPilot Warning:** This spec contains ${matches.length} code block(s). Specs should describe *what* and *why*, not *how*. Consider replacing code with behavioral descriptions.\n`;
    return warning + specContent;
  }

  return specContent;
}
````

**Why:** This directly enforces the spec-first philosophy. Without this, LLMs will naturally drift toward generating code, and users will start expecting it.

---

### 4.2 — Add an "Open Questions" Section to Every Spec

Modify your spec prompt to always end with open questions:

```typescript
// ...existing code...

// Add to the end of the system prompt:
`
IMPORTANT: Every specification MUST end with an "## Open Questions" section.
This section must contain at least 3 genuine questions that remain unanswered.
If you cannot think of open questions, you have not thought deeply enough.
Never produce a spec with zero open questions.
`;
```

**Why:** This is the single highest-impact feature for encouraging actual thinking. A spec with no open questions is a spec nobody scrutinized.

---

## Phase 5: Testing (Ongoing)

### 5.1 — Add Prompt Regression Tests

You don't need to call the LLM in tests. Test that prompt construction produces expected strings:

```typescript
import { buildSpecSystemPrompt } from "../specPrompt";

describe("buildSpecSystemPrompt", () => {
  it("should instruct the LLM not to generate code", () => {
    const prompt = buildSpecSystemPrompt();
    expect(prompt).toContain("must NOT");
    expect(prompt).toContain("Generate implementation code");
  });

  it("should require an Open Questions section", () => {
    const prompt = buildSpecSystemPrompt();
    expect(prompt).toContain("Open Questions");
  });

  it("should require edge case identification", () => {
    const prompt = buildSpecSystemPrompt();
    expect(prompt).toContain("Edge Cases");
  });
});
```

### 5.2 — Add Utility Unit Tests

````typescript
import { flagCodeInSpec } from "../specGuard";

describe("flagCodeInSpec", () => {
  it("should pass through specs without code blocks", () => {
    const spec = "## Overview\nA user login system";
    expect(flagCodeInSpec(spec)).toBe(spec);
  });

  it("should add a warning when code blocks are present", () => {
    const spec = '## Overview\n```javascript\nconsole.log("hello")\n```';
    const result = flagCodeInSpec(spec);
    expect(result).toContain("⚠️ **SpecPilot Warning:**");
    expect(result).toContain("1 code block(s)");
  });
});
````

---

## Execution Summary

Here's your exact order of operations:

| Priority | Task                                 | Effort  | Risk if Skipped        |
| -------- | ------------------------------------ | ------- | ---------------------- |
| **P0**   | Move API keys to SecretStorage       | 2 hours | Security leak          |
| **P0**   | Add input validation                 | 1 hour  | Crashes, bad UX        |
| **P1**   | Flatten prompt templates             | 3 hours | Unmaintainable prompts |
| **P1**   | Separate service/command layers      | 4 hours | Spaghetti coupling     |
| **P1**   | Slim down `extension.ts`             | 1 hour  | Hard onboarding        |
| **P2**   | Rewrite README                       | 2 hours | Contributors bounce    |
| **P2**   | Add CONTRIBUTING.md                  | 1 hour  | Inconsistent PRs       |
| **P2**   | Add specGuard (code-in-spec warning) | 1 hour  | Philosophy drift       |
| **P2**   | Force "Open Questions" in specs      | 30 min  | Shallow specs          |
| **P3**   | Add prompt regression tests          | 2 hours | Silent prompt breakage |
| **P3**   | Add utility unit tests               | 2 hours | Unnoticed regressions  |

---

## My Recommendation: Start With Just Three Things

If you're overwhelmed, **do only these three things this week:**

1. **`ApiKeyManager`** — move secrets out of config (P0, 2 hours)
2. **Flatten one prompt file** — make it readable as plain text (P1, 1 hour)
3. **Add the "Open Questions" requirement to your spec prompt** (P2, 30 minutes)

These three changes dramatically improve security, maintainability, and product quality with under 4 hours of work.

Everything else can wait. Ship these, then come back to this list.

---

**Want me to implement any of these specific changes in full?** I can produce complete, copy-paste-ready code for any item on this list. Just tell me which one to start with.
