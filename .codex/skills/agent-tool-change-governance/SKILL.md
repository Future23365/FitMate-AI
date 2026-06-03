---
name: agent-tool-change-governance
description: Govern Agent tool changes in AITest before implementation. Use when Codex needs to add a new Agent tool, fix an Agent tool bug, change Agent core contracts, touch PlannerPort, Executor, Policy Guard, ResourceStore, Resource Contract Validator, Response Renderer, trace/replay, or connect Agent tools to /api/chat production chat flow.
---

# Agent Tool Change Governance

## Preflight

1. Read `docs/agent-tool-orchestrator-design.md` sections 24, 25, and 26 before proposing or editing implementation.
2. Check the active OpenSpec change with `openspec status --change <change> --json` and read its proposal, design, spec, and tasks before editing non-trivial behavior.
3. Check `git status --short` before changing files. If unrelated user changes exist, keep them out of the current diff and commit.
4. Classify the task as exactly one primary class: new business tool, Agent tool bug fix, core contract change, or production integration change.
5. Before implementation, state the root cause or product need, design direction, affected modules, and trade-offs.

## Task Classes

### New Business Tool

Default to adding only the tool bundle and its local wiring:

- tool file
- `inputSchema`
- `outputSchema`
- policy metadata
- `resourceContract` when needed
- handler
- optional `toModelObservation`
- optional `toUserProjection`
- optional `traceProjection` or trace summary if the current core exposes it
- `ToolRegistry` registration
- focused tool contract tests

Do not modify Agent core to make one business tool work unless the OpenSpec design explicitly justifies a core contract change.

### Agent Tool Bug Fix

Start from evidence, not surface symptoms:

- Read `codex_logs/ai_trace_log.js` unless the user explicitly says not to or the file does not exist.
- Inspect the real Zod or JSON Schema for the tool.
- Inspect the model-visible manifest or schema summary.
- Inspect runtime validation, `ResourceStore`, `Policy Guard`, projection, response rendering, and trace records relevant to the failure.
- Classify the root cause as LLM parameter error, missing model-visible contract, tool capability gap, missing or unusable resource, policy or confirmation boundary, projection or redaction leak, final grounding gap, or production integration issue.

Do not fix natural-language understanding failures with server-side keywords, regex, synonym lists, phrase templates, or business `toolName` special cases.

### Core Contract Change

Escalate to a core contract design only when the need is genuinely shared:

- If only one tool needs it, first change that tool's contract.
- If two or more unrelated tools need it, design a generic core extension point and add core contract tests.
- If the issue involves security, permissions, resources, trace, replay, stream, or confirmation, return to the core contract and do not open a business exception.

### Production Integration Change

Treat `/api/chat` and equivalent production entrypoints as high-risk boundaries:

- Keep production routing inside the Agent loop rather than adding business keyword routing.
- Do not bypass `ToolRegistry`, `Policy Guard`, `ResourceStore`, `Resource Contract Validator`, or `Response Renderer`.
- Prove the route does not register fixture tools, hidden business services, or ad hoc natural-language dispatch unless the OpenSpec change explicitly scopes that production capability.

## Forbidden By Default

Do not default to changing these modules for a new business tool or ordinary tool bug:

- orchestrator main loop
- `PlannerPort`
- Executor main flow
- `Policy Guard`
- `Resource Contract Validator`
- `Response Renderer`
- `/api/chat` main route or chat production chain
- Agent core branches on concrete business `toolName`
- service-side keyword, regex, synonym, or natural-language template routing
- handler-side confirmation, permission, or resource registration bypasses

If a change must touch one of these areas, stop and ensure the OpenSpec design names the task class, allowed modules, forbidden modules, validation plan, and core contract rationale.

## OpenSpec Requirements

For non-copy Agent tool changes, ensure `proposal.md`, `design.md`, and `tasks.md` state:

- task class
- allowed modules
- forbidden modules
- whether core contract changes are in scope
- validation plan
- remaining risks when validation cannot run

For a new business tool, include checklist items for tool bundle, `ToolRegistry` registration, schema, policy, `resourceContract`, model projection, user projection, trace projection or trace summary, and contract tests.

For an Agent tool bug fix, include checklist items for `codex_logs/ai_trace_log.js`, real schema, model-visible manifest or schema summary, `ResourceStore`, `Policy Guard`, projection, response rendering, and trace.

Every non-copy Agent tool `tasks.md` must include `openspec validate <change> --strict`, relevant automated tests, architecture scan when core or production boundaries are touched, and a final diff check.

## Validation

Run the narrowest relevant checks first:

- OpenSpec: `openspec validate <change> --strict`
- Architecture boundary: `npm test -- tests/agent-core/architecture-boundary.test.ts`
- Tool contract helper: `npm test -- tests/agent-core/contract-helper.test.ts`
- Runtime safety and projection tests when policy, resource, confirmation, renderer, trace, or production integration changes
- `npm run typecheck` after TypeScript, React, API, schema, AI orchestration, or shared business logic changes

Finish by summarizing what changed, why the design is better than a local patch, how it was verified, and any remaining risk.
