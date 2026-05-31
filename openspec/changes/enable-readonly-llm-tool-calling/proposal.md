## Why

当前聊天链路已经有 `ReferenceResolver`、`searchArtifacts`、`getArtifactPayload`、`getExerciseById` 等受控服务端能力，但这些能力主要由固定服务端分支调用，LLM 不能在复杂问题中按需补查只读上下文。

为了支撑“解释为什么推荐这个动作”“基于之前那套训练回答细节”“连续追问历史计划”等场景，需要先建立受控的只读 LLM Tool Calling 能力，让模型可以在服务端边界内选择有限读工具，同时保留权限隔离、Schema 校验、Trace 和失败回退。

## What Changes

- 新增只读 LLM Tool Calling 编排能力，允许模型在受限步骤内选择服务端注册的只读工具。
- 新增统一的只读 tool registry / execution contract，用于描述 tool 名称、入参 Schema、返回结构、权限边界、Trace 记录和错误格式。
- 首批开放只读工具：
  - `searchArtifacts`：检索当前用户可访问的训练 artifact 摘要。
  - `getArtifactPayload`：读取当前用户可访问的 artifact payload。
  - `getExerciseById`：读取数据库中已存在动作的详情。
  - `searchExercises`：按受控条件查询动作候选摘要。
- 聊天编排在明确需要补查上下文的场景中进入只读 tool loop，并限制最大工具步数。
- DeepSeek 标准 tool calling 未启用时，使用受控 JSON tool decision 协议表达单步工具选择或停止原因。
- 通过服务端 feature flag 控制只读 tool loop 是否参与 `/api/chat`，关闭时完整回退到当前固定编排链路。
- 写操作仍由现有服务端流程、Validator、PolicyEngine、ConfirmationGate 和持久化服务控制；本 change 不开放 LLM 写工具。
- 工具调用、参数、结果摘要、失败原因和回退路径进入 AI Trace。
- 工具失败、越权、Schema 错误、预算截断、步数超限或模型未选择工具时，必须回退到当前确定性编排或澄清回复。

## Capabilities

### New Capabilities

- `readonly-llm-tool-calling`: 定义 LLM 可调用的只读工具注册、执行、权限、Trace、步数限制和失败回退行为。

### Modified Capabilities

- `chat-intent-decision-flow`: 聊天意图解析后可以进入只读 tool loop，用补查结果辅助最终回复或后续服务端动作判断。
- `ai-run-trace`: Trace 需要展示 LLM 只读工具选择、工具执行、失败回退和最终使用的工具上下文摘要。
- `reference-resolver`: 引用解析命中或歧义场景需要与只读工具调用边界一致，避免模型绕过候选集合猜测 artifact。
- `rag-hybrid-search`: artifact 检索可作为只读工具被 LLM 间接触发，但仍必须遵守当前用户隔离和候选摘要返回限制。

## Impact

- 主要影响 `lib/server/chat/*`、`lib/server/ai/*`、`lib/server/dev/ai-run-trace.ts`、`lib/server/reference-resolver/*`、`lib/server/conversation-artifacts/*`、`lib/server/exercises/*`。
- 需要新增只读 tool registry、tool executor、工具输入输出类型和测试。
- 需要扩展 AI Trace 展示或 trace 数据结构，以区分模型请求、模型 tool decision、受控工具执行和回退。
- 需要新增工具上下文预算、artifact kind 摘要策略和 feature flag 关闭路径。
- 不引入 LangGraph，不开放写工具，不改变数据库 Schema。
- 不允许客户端直接触发工具执行；所有工具执行必须在服务端按当前用户权限完成。
