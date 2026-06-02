# 单次 LLM 到 Agent Tool 调用流程测试方案

生成时间：2026-06-02 19:21:13 +0800

## 目标

本文基于根目录 `测试情况预览.md` 和当前 Agent tool registry，定义一套只验证“单次 `LLM -> Agent tool` 调用”的手动黑盒测试流程。

这里的“单次”只指一次模型决策：

1. 测试脚本为目标 tool 准备必要资源。
2. LLM 只请求一次，必须返回一个 JSON `call_tool` decision。
3. 该 decision 只能选择当前 case 的 `targetTool`。
4. 测试脚本只执行这个目标 tool 一次。
5. 报告只判断本次模型决策、目标 tool 入参 schema、目标 tool 执行结果和输出合同。

本流程的目的不是验证一次 Agent run 能否串起多个 tool，而是逐个验证已有 Agent tool 本身是否可被 LLM 正确调用、是否能用真实服务端上下文正常执行。

## 不覆盖范围

- 不走 `/api/chat` Route Handler。
- 不执行完整 `runAgentOrchestrator()` 循环。
- 不验证一次 Agent run 的多 tool 依赖编排。
- 不验证多轮会话连续性。
- 不验证前端渲染、按钮交互或真实页面视觉效果。
- 不评价训练方案质量、动作排序或回复文案自然度。
- 不把本流程合入普通 `npm run test`；真实模型测试仍保持独立入口。

## 与现有黑盒测试的关系

现有 `测试情况预览.md` 面向首页聊天真实用户流程，每个 flow 通常包含多轮对话和完整 `/api/chat` Agent run。它适合回答“用户体验链路是否符合预期”。

本流程只回答一个更窄的问题：

> 对某一个已注册 Agent tool，LLM 能不能产出符合该 tool 契约的单个 `call_tool`，并且这个 tool 在真实服务端上下文中能不能执行成功。

因此本流程不会复用 `manual-tests/llm/blackbox-runner.ts`。它直接使用 `createToolFirstAgentToolRegistry()` 获取当前真实 registry，按 case 创建隔离用户、会话和依赖资源，再调用目标 tool 的 `inputSchema` 和 `execute()`。

## 测试执行流程

1. 读取 `manual-tests/llm/agent-tool-fixtures.ts` 中的单工具 fixture。
2. 按 `--ids`、`--group`、`--tool` 或 `--failed-from-report` 筛选 case。
3. 执行 preflight：检查 `DEEPSEEK_API_KEY`、数据库配置、artifact 表和 Exercise seed 数据。
4. 为每个 case 创建隔离用户、`sessionId`、`runId` 和 `AgentToolRegistry`。
5. 按 case 的 `setup` 列表执行 deterministic setup，得到目标 tool 所需资源。
6. 组装一次 LLM 请求，要求模型只返回一个 JSON `call_tool`。
7. 使用 `parseAgentJsonObject()` 和 `parseAgentToolDecision()` 解析模型输出。
8. 用目标 tool 的 `inputSchema.safeParse()` 校验 LLM 输出的 `input`。
9. 只有当 `toolName` 等于目标 tool 且 schema 通过时，执行目标 tool 一次。
10. 断言输出合同并写入 `docs/manual-llm-agent-tool-call-latest-report.md`。

## setup 与 targetTool 的边界

`setupTools` 是测试脚本为了让目标 tool 可执行而准备资源的确定性步骤，不属于本 case 的 LLM 调用结果。

例如 `validateRoutineDraft` 需要一个已存在的 `draftId`，脚本会先直接执行 `searchExercises` 和 `generateRoutineDraft` 得到资源。case 真正要测试的是：

- LLM 是否调用 `validateRoutineDraft`。
- LLM 是否传入正确的 `draftId`、`candidateSetId`、`candidateExerciseIds` 和 `intent`。
- `validateRoutineDraft` 是否执行成功并输出 `validationId`。

报告中会分别展示：

- `setupTools`：脚本预置资源时执行过的 tool。
- `targetTool`：本 case 要求 LLM 调用且脚本实际执行一次的 tool。

## 用例结构

```ts
type AgentSingleToolCase = {
  id: string;
  toolName: string;
  group:
    | "readonly"
    | "planning"
    | "generation"
    | "validation"
    | "policy"
    | "persistence"
    | "clarification";
  scenario: string;
  setup: string[];
  expectedOutputFields: string[];
  buildExpectedInput(resources: AgentSingleToolResources): unknown;
  note: string;
};
```

## 当前用例覆盖

当前 fixture 覆盖 `createToolFirstAgentToolRegistry()` 中已注册的 18 个 Agent tool。

| ID | targetTool | group | setup | 主要验收 |
|---|---|---|---|---|
| TOOL01 | `listRecentArtifacts` | readonly | `artifact` | 能列出当前会话 artifact，并返回 `candidateSetId`。 |
| TOOL02 | `searchArtifacts` | readonly | `artifact` | 能按结构化条件检索当前用户当前会话 artifact。 |
| TOOL03 | `resolveArtifactReference` | readonly | `artifact` | 能解析唯一 artifact 引用并输出 `artifactReferenceId`。 |
| TOOL04 | `getArtifactPayload` | readonly | `artifact` | 能读取允许范围内的 artifact payload。 |
| TOOL05 | `getExerciseById` | readonly | `exercise` | 能读取真实动作库记录。 |
| TOOL06 | `searchExercises` | readonly | 无 | 能用结构化条件生成动作候选集合。 |
| TOOL07 | `getUserMemory` | readonly | `memory` | 能读取当前用户画像和记忆快照。 |
| TOOL08 | `queryUserMemory` | readonly | `memory` | 能按确定性字段查询用户记忆。 |
| TOOL09 | `proposeWorkoutEditPlan` | planning | `artifactPayload` | 能基于 artifact payload 生成 edit plan。 |
| TOOL10 | `generateRoutineDraft` | generation | `candidateSet` | 能用候选集合生成 routine draft。 |
| TOOL11 | `generatePlanDraft` | generation | `candidateSet` | 能用候选集合和 strategy 生成 plan draft。 |
| TOOL12 | `proposeWorkoutPatch` | planning | `editPlan,candidateSet` | 能基于 edit plan 和候选集合生成 patch。 |
| TOOL13 | `askClarification` | clarification | 无 | 能输出结构化澄清问题。 |
| TOOL14 | `validateRoutineDraft` | validation | `routineDraft` | 能校验 routine draft 并输出 `validationId`。 |
| TOOL15 | `validatePlanDraft` | validation | `planDraft` | 能校验 plan draft 并输出 `validationId`。 |
| TOOL16 | `validateWorkoutPatch` | validation | `patch` | 能校验 patch 并输出 `validationId`。 |
| TOOL17 | `evaluatePolicy` | policy | `routineDraft` | 能对 draft 写入行为输出 policy decision。 |
| TOOL18 | `saveConversationArtifactRevision` | persistence | `routineValidation,policyDecision` | 能保存已校验且 policy 允许的 revision。 |

## 断言分层

### P0：LLM 决策

- LLM 输出非空。
- LLM 输出能解析为 `AgentToolDecision`。
- `action` 必须是 `call_tool`。
- `toolName` 必须等于当前 case 的 `targetTool`。
- 不允许返回 `final_result`。
- 不允许调用其他 tool。

### P1：输入 Schema 与目标执行

- LLM 输出的 `input` 必须通过目标 tool 的 `inputSchema`。
- schema 通过且 toolName 正确后，只执行目标 tool 一次。
- 目标 tool 执行结果必须 `ok=true`。

### P2：输出合同

- 成功结果必须包含 `toolResultId`。
- 成功结果必须包含 `modelSummary`。
- 成功结果必须包含 fixture 声明的 `expectedOutputFields`。
- 报告必须展示目标 tool 产出的关键资源 id。

### P3：人工复核

- 仅用于后续人工判断 prompt 是否过度喂答案。
- P3 不让测试失败。

## 报告要求

当前报告路径：

`docs/manual-llm-agent-tool-call-latest-report.md`

报告至少包含：

- 生成时间，使用上海时间 ISO `+08:00`。
- 模型名称。
- 运行命令。
- `dryRun` 状态。
- 本次筛选参数。
- preflight 状态。
- 用例总数、单次 LLM 请求数、目标 tool 执行数、通过、失败、跳过、需复核。
- 预计 token 和实际 token。
- 每个 case 的 `setupTools`、`targetTool`、`expectedInput` 摘要、模型原始输出摘要、解析后的 action/toolName、schema 断言、执行断言和输出合同断言。
- 失败分类：`llm_decision_invalid`、`wrong_tool`、`input_schema_invalid`、`tool_execution_failed`、`output_contract_invalid`、`setup_failed`。

## 脚本参数

当前独立入口脚本：

`scripts/run-manual-agent-tool-tests.mjs`

当前命令入口：

`npm run test:llm:agent-tool`

脚本参数只描述可配置能力，不绑定某一次运行：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `--ids` | CSV | `all` | 只运行指定单工具 case，例如 `TOOL01,TOOL06`。 |
| `--group` | CSV | `all` | 按 case group 过滤，例如 `readonly,validation`。 |
| `--tool` | CSV | `all` | 只运行指定 Agent tool，例如 `searchExercises`。 |
| `--failed-from-report` | path | `none` | 从上一份报告中提取失败 case 重跑。 |
| `--concurrency` | integer | `1` | 并发数；真实模型和数据库写入测试默认保持 1。 |
| `--report` | path | `docs/manual-llm-agent-tool-call-latest-report.md` | 输出报告路径。 |
| `--dry-run` | boolean | `false` | 只输出筛选后的 case 和 token 预估，不请求真实模型、不执行 targetTool。 |

对应环境变量：

| 环境变量 | 对应参数 |
|---|---|
| `MANUAL_LLM_AGENT_TOOL_IDS` | `--ids` |
| `MANUAL_LLM_AGENT_TOOL_GROUPS` | `--group` |
| `MANUAL_LLM_AGENT_TOOL_NAMES` | `--tool` |
| `MANUAL_LLM_AGENT_TOOL_FAILED_FROM_REPORT` | `--failed-from-report` |
| `MANUAL_LLM_AGENT_TOOL_CONCURRENCY` | `--concurrency` |
| `MANUAL_LLM_AGENT_TOOL_REPORT_PATH` | `--report` |
| `MANUAL_LLM_AGENT_TOOL_DRY_RUN` | `--dry-run` |

## 当前参数

当前实现默认覆盖全部已注册 Agent tool。为了避免误耗费真实模型 token，本次验证优先使用 dry-run 生成完整覆盖报告。

| 项 | 当前值 |
|---|---|
| ids | `all` |
| group | `all` |
| tool | `all` |
| failed-from-report | `none` |
| concurrency | `1` |
| report | `docs/manual-llm-agent-tool-call-latest-report.md` |
| dry-run | `true` |

当前验证命令：

```bash
npm run test:llm:agent-tool -- --dry-run --concurrency=1 --report=docs/manual-llm-agent-tool-call-latest-report.md
```

真实模型执行全量 18 个 tool 时使用：

```bash
npm run test:llm:agent-tool -- --concurrency=1 --report=docs/manual-llm-agent-tool-call-latest-report.md
```

单独验证某个 tool 时使用：

```bash
npm run test:llm:agent-tool -- --tool=searchExercises --concurrency=1
```

只重跑上一份报告中的失败 case 时使用：

```bash
npm run test:llm:agent-tool -- --failed-from-report=docs/manual-llm-agent-tool-call-latest-report.md --concurrency=1
```

## 当前实现落点

1. `manual-tests/llm/agent-tool-fixtures.ts`：18 个单工具 case。
2. `manual-tests/llm/agent-tool-selection.ts`：`id/group/tool/failed-from-report` 筛选。
3. `manual-tests/llm/agent-tool-assertions.ts`：LLM 决策、schema、目标 tool 执行和输出合同断言。
4. `manual-tests/llm/agent-tool-call.test.ts`：独立 Vitest 执行与报告生成。
5. `scripts/run-manual-agent-tool-tests.mjs`：命令行入口。
6. `vitest.llm-agent-tool.config.ts`：只匹配单次 Agent tool 测试。

## 验收标准

- 不影响现有 `npm run test:llm` 和普通自动化测试。
- 缺少 `DEEPSEEK_API_KEY` 时生成跳过报告，不使用 mock。
- 每个 case 最多请求一次 LLM。
- 每个 case 最多执行一次 `targetTool`。
- 报告明确区分 `setupTools` 和 `targetTool`。
- 报告能定位“LLM 输出无效”“LLM 调错 tool”“input schema 不合法”“目标 tool 执行失败”“目标 tool 输出合同不完整”和“setup 失败”。
