# SpecPilot Specifications

This folder contains structured documentation for your project.

## 🚀 Quick Start: Generate Your Specs with AI

Your spec files have been scaffolded with placeholders. An onboarding prompt has been saved to [`development/onboarding.md`](development/onboarding.md).

1. Open `development/onboarding.md` and copy the prompt inside it.
2. Paste it into your AI agent (VS Code, Cursor, etc.).
3. The AI will draft all spec files based on your project description.
4. Review each file, refine as needed, then **delete `onboarding.md`**.

Run `specpilot validate` to check consistency at any time.

## 📁 File Structure
- `project/`: Metadata and requirements
- `architecture/`: Design and APIs
- `planning/`: Tasks and roadmap
- `quality/`: Testing
- `development/`: Docs and prompts

## 🛠️ Commands
\`\`\`bash
# Validate your specs
specpilot validate

# Add specs to an existing project later
specpilot add-specs
\`\`\`

For AI guidelines and prompt history, see [`development/prompts.md`](development/prompts.md).