---
mode: agent
description: Run the Spec-First review gate: classify the change, update specs, then wait for confirmation before coding
---

Formalize the Spec-First review gate (mandate 8) for the pending change.

1. Classify the pending change as trivial, feature, or architectural:
   - Trivial: no spec update required.
   - Feature: touches `project/requirements.md` and `planning/tasks.md`.
   - Architectural: touches all affected spec files plus `CHANGELOG.md`.
2. Read the relevant `.specs/` files per the Context routing table (session start → `project/project.yaml`; feature/bug → + `project/requirements.md`, `planning/tasks.md`; architecture → + `architecture/architecture.md`; tests → + `quality/tests.md`; security → + `security/threat-model.md`, `security/security-decisions.md`; planning → + `planning/tasks.md`, `planning/roadmap.md`).
3. Update the affected spec files first — before writing any code.
4. Present a Spec Report: classification, files touched, what changed in each, and what the specs now say.
5. Wait for the user's literal `yes, proceed` before writing or editing any code or non-spec file. An ambiguous "ok" or "sure" is not sufficient for an architectural-tier change — ask for the explicit phrase if it wasn't given.