## Why

当前 Agent 修复任务经常来自某个具体 trace、用户原话、tool result 或模型输出失败。没有独立门禁时，修复方案容易把 case 证据、具体业务 tool 名或短句组合升格成通用 prompt、runtime 或服务端生产规则，违反“模型能力优先，服务端只管契约”的项目边界。

本 change 新增一个项目级 Codex Skill，在开始实现 Agent / prompt / tool 修复或审查某个 OpenSpec change 前，专门检查“Agent 修复方案抽象层级门禁”。

## What Changes

- 新增 `.codex/skills/agent-fix-abstraction-gate/SKILL.md`，用于审查 Agent 修复方案是否把失败证据、业务实例或测试样例错误升格成通用生产规则。
- 新增 `.codex/skills/agent-fix-abstraction-gate/agents/openai.yaml`，提供 Codex UI 可见的 display name、short description 和 default prompt。
- 新增 OpenSpec capability `agent-fix-abstraction-gate`，固化后续使用该 Skill 的触发条件、暂停条件和输出格式。
- 本 change 不修改 Agent runtime、生产 prompt、tool manifest、`/api/chat`、数据库、API 契约或用户可见业务流程。

## Capabilities

### New Capabilities

- `agent-fix-abstraction-gate`: 定义 Agent 修复方案抽象层级门禁 Skill 的触发场景、审查维度、违规暂停输出和通过输出要求。

### Modified Capabilities

- 无。

## Impact

- 影响项目级 Codex Skill：`.codex/skills/agent-fix-abstraction-gate/SKILL.md`。
- 影响 Codex Skill UI metadata：`.codex/skills/agent-fix-abstraction-gate/agents/openai.yaml`。
- 影响 OpenSpec 治理文档：`openspec/changes/add-agent-fix-abstraction-gate-skill/*`。
- 影响项目演变记录：`docs/方案变更历史/*`、`docs/项目演变历程.md`。
- 不影响 TypeScript、React、Prisma、Agent runtime、模型实际输入或生产聊天链路。
