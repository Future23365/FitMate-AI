# 单次 LLM 到 Agent Tool 调用流程测试方案

生成时间：2026-06-02 18:43:49 +0800

## 目标

本文基于根目录 `测试情况预览.md` 和现有首页聊天黑盒测试，定义一套只验证单次 `LLM -> Agent tool` 调用链路的测试流程。

这里的“单次”指一次用户输入触发一次 `/api/chat` Agent run。一次 Agent run 内可以有多个 tool decision 和 tool result，但测试不继续执行第 2 轮、第 3 轮对话，也不以多轮用户体验为主要验收目标。

核心问题只有一个：LLM 在当前输入和可用上下文下，是否选择了符合预期的 Agent tool、传入了符合契约的参数，并产出了可被后续响应投影和持久化使用的结构化结果。

## 不覆盖范围

- 不验证 3 轮多轮会话连续性。
- 不验证前端渲染、按钮交互或真实页面视觉效果。
- 不验证训练动作排序、文案质量、训练强度是否最优。
- 不通过服务端关键词规则判断用户自然语言语义是否正确。
- 不把本流程合入普通 `npm run test`；真实模型测试仍保持独立入口。

## 与现有黑盒测试的关系

现有 `测试情况预览.md` 把每个用例设计成 3 轮流程：

- 第 1 轮验证单轮基础能力。
- 第 2 轮验证上下文继承、补齐或升级。
- 第 3 轮验证继续修改、引用或边界收束。

本流程只抽取其中适合验证 tool 调用的单轮输入，必要时通过固定的 `stateFixture` 准备最近 artifact、会话摘要或用户记忆，而不是继续跑前序自然语言轮次。

现有 `manual-tests/llm/blackbox-runner.ts` 已经走真实 `/api/chat` Route Handler，并能从 stream 中收集：

- `AgentExecutionResult`
- `dependencyGraph`
- `toolNames`
- `toolResultIds`
- `candidateSetIds`
- `validationIds`
- `policyDecisionIds`
- `revisionIds`
- `legacyPathSkip`

因此首版实现应复用现有 runner 的真实执行面，新增独立 fixture、筛选参数和报告路径。

## 测试执行流程

1. 读取单次 tool flow fixture。
2. 根据用例的 `stateFixture` 初始化会话状态。
3. 使用现有 local anonymous auth 创建隔离用户。
4. 通过 `/api/chat` Route Handler 发起一次真实请求。
5. 消费 NDJSON stream，收集 assistant 文本、Agent 执行结果和依赖图。
6. 只针对本轮执行做断言。
7. 生成独立报告，不覆盖现有多轮黑盒报告。

## 用例结构

建议新增独立 fixture 类型，不复用三轮 `BlackboxFlowCase` 结构：

```ts
type AgentToolCallCase = {
  id: string;
  name: string;
  group: "recommendation" | "routine" | "plan" | "clarification" | "reference" | "patch" | "non_fitness" | "safety";
  userInput: string;
  stateFixture?: "empty" | "recent_recommendation" | "recent_routine" | "recent_plan" | "user_memory";
  expectation: {
    expectedAgentStatus: "answered" | "needs_clarification" | "generated" | "patched" | "completed_operation" | "blocked" | "failed";
    expectedCardTypes: string[];
    requiredAgentTools: string[];
    forbiddenAgentTools?: string[];
    requireCandidateSetId?: boolean;
    requireValidationId?: boolean;
    requirePolicyDecisionId?: boolean;
    requireRevisionId?: boolean;
    requireDependencyGraph?: boolean;
    requireLegacyPathDisabled?: boolean;
    maxRepairTurnCount?: number;
    note: string;
  };
};
```

## 首版用例集

| ID | 来源 | 输入 / 状态 | 期望 Agent 结果 | 必需 tool 证据 | 禁止 tool 证据 |
|---|---|---|---|---|---|
| AT01 | F01 第 1 轮 | `今天我想练胸` / `empty` | `generated`，产出 `exercise_recommendation` | `searchExercises`，`saveConversationArtifactRevision`，`candidateSetId`，`revisionId` | `generateRoutineDraft`，`generatePlanDraft` |
| AT02 | F04 第 1 轮 | `今天在家练背30分钟` / `empty` | `generated`，产出 `workout_routine` | `searchExercises`，`generateRoutineDraft`，`validateRoutineDraft`，`saveConversationArtifactRevision`，`candidateSetId`，`validationId`，`revisionId` | `generatePlanDraft` |
| AT03 | F19 第 1 轮 | `给我一个每周4练增肌计划` / `empty` | `generated`，产出 `workout_plan` | `searchExercises`，`generatePlanDraft`，`validatePlanDraft`，`saveConversationArtifactRevision`，`candidateSetId`，`validationId`，`revisionId` | `generateRoutineDraft` |
| AT04 | F03 第 1 轮 | `给我一套训练` / `empty` | `needs_clarification` 或 `answered`，不产出训练卡片 | `askClarification` 或无写入 tool | `generateRoutineDraft`，`generatePlanDraft`，`saveConversationArtifactRevision` |
| AT05 | F13 第 1 轮 | `明天天气怎么样？` / `empty` | `answered`，不产出训练卡片 | 可无 tool，或只允许只读上下文 tool | `searchExercises`，`generateRoutineDraft`，`generatePlanDraft`，`saveConversationArtifactRevision` |
| AT06 | F23 第 1 轮 | `我想练你们库里没有的超级飞鸟跳` / `empty` | `needs_clarification`、`answered` 或 `blocked`，不编造卡片 | 可有 `searchExercises`，但不得产生可执行 artifact | `saveConversationArtifactRevision` |
| AT07 | F15 第 3 轮 | `第一个动作怎么做` / `recent_recommendation` | `answered`，解释既有动作，不刷新卡片 | `getArtifactPayload` | `searchExercises`，`generateRoutineDraft`，`generatePlanDraft` |
| AT08 | W09 第 2 轮 | `不用哑铃了，换一个` / `recent_routine` | `patched`，产出 `workout_patch` | `listRecentArtifacts`，`getArtifactPayload`，`searchExercises`，`proposeWorkoutPatch`，`validateWorkoutPatch`，`saveConversationArtifactRevision` | `legacyIntentNormalize`，`runReadonlyToolLoop` |

## 断言分层

### P0：执行基础

- `/api/chat` 返回成功 stream。
- assistant 用户可见回复非空。
- stream 中存在 `AgentExecutionResult`。
- `dependencyGraph` 可读取。
- 不泄漏内部 JSON、tool 原始参数或调试字段。

### P1：tool 选择

- `expectedAgentStatus` 与实际 `AgentExecutionResult.status` 一致。
- `requiredAgentTools` 全部出现在 `dependencyGraph` 中。
- `forbiddenAgentTools` 不出现在 `dependencyGraph` 中。
- 训练生成类用例必须有 `candidateSetId`。
- routine / plan / patch 类用例必须有 `validationId`。
- 写入类用例必须有 `revisionId`。
- `legacyPathSkip` 证明旧 intent-first / normalize / summary-only / ReferenceResolver-first 主路径未参与。

### P2：tool 参数和结果契约

- `searchExercises` 的结构化过滤边界与输入目标一致，例如目标部位、器械、场景和用途。
- `generateRoutineDraft` / `generatePlanDraft` 只引用当前 run 的候选集合。
- `validateRoutineDraft` / `validatePlanDraft` / `validateWorkoutPatch` 输出可被最终结果引用。
- `saveConversationArtifactRevision` 只能保存已校验的 artifact 或 patch。
- `AgentExecutionResult.usedToolResultIds` 必须能回连到本轮 tool result。

### P3：人工复核

- 回复措辞是否自然。
- 推荐动作排序是否符合经验。
- 训练容量是否更优。

P3 不让测试失败，只进入报告的 `needs_review`。

## 报告要求

建议新增报告路径：

`docs/manual-llm-agent-tool-call-latest-report.md`

报告至少包含：

- 生成时间，使用上海时间 ISO `+08:00`。
- 模型名称。
- 运行命令。
- 本次参数。
- preflight 状态。
- 用例总数、通过、失败、跳过、需复核。
- 预计 token 和实际 token。
- 每个用例的 userInput、stateFixture、期望 tool、实际 tool、Agent status、关键 id。
- 失败分类：`tool_missing`、`unexpected_tool`、`tool_input_invalid`、`dependency_invalid`、`result_contract_invalid`、`legacy_path_used`、`persistence_failed`。

## 脚本参数

如果新增独立入口，建议脚本命名为：

`scripts/run-manual-agent-tool-tests.mjs`

建议命令入口：

`npm run test:llm:agent-tool`

脚本参数只描述可配置能力，不绑定某一次运行：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `--ids` | CSV | `all` | 只运行指定用例，例如 `AT01,AT02`。 |
| `--group` | CSV | `all` | 按用例 group 过滤。 |
| `--tool` | CSV | `all` | 只运行期望包含指定 tool 的用例。 |
| `--status` | CSV | `all` | 只运行期望 Agent status 的用例。 |
| `--state` | CSV | `all` | 只运行指定 `stateFixture` 的用例。 |
| `--failed-from-report` | path | `none` | 从上一份报告中提取失败用例重跑。 |
| `--concurrency` | integer | `1` | 并发数；真实模型和数据库写入测试默认保持 1。 |
| `--report` | path | `docs/manual-llm-agent-tool-call-latest-report.md` | 输出报告路径。 |
| `--disable-legacy-events` | boolean | `true` | 关闭旧兼容事件，确保报告依赖 Agent 证据。 |
| `--dry-run` | boolean | `false` | 只输出筛选后的用例和 token 预估，不请求真实模型。 |

对应环境变量建议：

| 环境变量 | 对应参数 |
|---|---|
| `MANUAL_LLM_AGENT_TOOL_IDS` | `--ids` |
| `MANUAL_LLM_AGENT_TOOL_GROUPS` | `--group` |
| `MANUAL_LLM_AGENT_TOOL_NAMES` | `--tool` |
| `MANUAL_LLM_AGENT_TOOL_STATUSES` | `--status` |
| `MANUAL_LLM_AGENT_TOOL_STATES` | `--state` |
| `MANUAL_LLM_AGENT_TOOL_FAILED_FROM_REPORT` | `--failed-from-report` |
| `MANUAL_LLM_AGENT_TOOL_CONCURRENCY` | `--concurrency` |
| `MANUAL_LLM_AGENT_TOOL_REPORT_PATH` | `--report` |
| `MANUAL_LLM_DISABLE_LEGACY_EVENTS` | `--disable-legacy-events` |

## 当前参数

首轮建议只跑最小闭环，先验证 tool 选择和结构化 id 是否稳定：

| 项 | 当前值 |
|---|---|
| 用例 | `AT01,AT02,AT04,AT05` |
| group | `all` |
| tool | `all` |
| status | `all` |
| state | `empty` |
| failed-from-report | `none` |
| concurrency | `1` |
| report | `docs/manual-llm-agent-tool-call-latest-report.md` |
| disable-legacy-events | `true` |
| dry-run | `false` |

建议首轮命令：

```bash
npm run test:llm:agent-tool -- --ids=AT01,AT02,AT04,AT05 --state=empty --concurrency=1 --report=docs/manual-llm-agent-tool-call-latest-report.md --disable-legacy-events
```

首轮通过后，再扩展到带状态 fixture 的读取和 patch 场景：

```bash
npm run test:llm:agent-tool -- --ids=AT07,AT08 --state=recent_recommendation,recent_routine --concurrency=1 --report=docs/manual-llm-agent-tool-call-latest-report.md --disable-legacy-events
```

## 实现顺序建议

1. 新增 `manual-tests/llm/agent-tool-fixtures.ts`，只存单轮 tool flow case。
2. 从现有 `blackbox-runner.ts` 抽出可复用的单轮执行函数，不改变多轮黑盒行为。
3. 新增 `agent-tool-assertions.ts`，把 `requiredAgentTools`、`forbiddenAgentTools`、关键 id 和 legacy skip 提升为主断言。
4. 新增独立 Vitest 文件，禁止挂入普通 `npm run test`。
5. 新增脚本入口和独立报告生成。
6. 先跑当前参数，再根据报告扩展 stateful 用例。

## 验收标准

- 不影响现有 `npm run test:llm` 和 `npm run test --detail`。
- 缺少 `DEEPSEEK_API_KEY` 时生成跳过报告，不请求 mock。
- 每个用例只执行一次 `/api/chat` Agent run。
- 报告能清楚区分“LLM 选错 tool”“tool 参数不满足 schema”“tool 输出无法回连最终结果”和“保存失败”。
- 失败报告必须包含 `conversationId`、`responseMessageId`、`traceId`、实际 tool 列表和关键资源 id。
