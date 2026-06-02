## Why

当前 Tool-first Agent 缺少面向动作库元信息和按名称读取动作详情的只读工具，用户问“数据库有多少个动作”或“某某动作怎么做”时，模型只能绕用候选检索、按 ID 读取或非法终止结果，最终容易被 Response Writer 投影成“没有生成或修改训练结果”的错误兜底。

这类问题本质是事实读取和解释型问答，不应触发训练生成、推荐卡片、Patch 或保存链路；需要补齐受控只读能力，让 Agent 能查询动作库统计、按名称解析动作，并基于数据库动作流程生成可读的中文讲解。

## What Changes

- 新增动作库只读查询能力：支持查询动作库总量、发布态数量、基础 facet 统计和按动作名称/别名查找唯一动作详情。
- 扩展 Agent 只读工具合同：新增或拆分 `getExerciseLibrarySummary`、`resolveExerciseByName` / `getExerciseDetailByName` 等等价工具，所有工具只读取 `Exercise` 事实，不写入、不生成训练结果。
- 支持“某某动作怎么做”自然语言问答：Agent 先用只读工具定位动作库记录，再用 `instructionsZh`、图片字段、器械、目标肌群和安全提示生成用户可读回答，并允许 LLM 做表达润色。
- 收紧最终回复投影：动作库统计和动作详情问答 MUST 以 `answered` 收口，并引用本轮只读 tool result；Response Writer 不得把这类只读失败描述为训练生成/修改失败。
- 补充自动化和黑盒验证：覆盖动作库总数、按中文名/英文名查动作、歧义动作名追问、动作不存在时明确说明、以及回复事实不编造。

## Capabilities

### New Capabilities

- `exercise-library-readonly-query`: 定义动作库统计、按名称解析动作详情、动作流程问答和 LLM 润色的只读事实查询能力。

### Modified Capabilities

- `readonly-llm-tool-calling`: 扩展统一 Agent registry 的只读动作工具边界，区分动作库统计、名称解析、按 ID 读取和执行型候选检索。
- `tool-first-agent-orchestrator`: 调整 Agent 终止与 Response Writer 合同，使动作库统计和动作详情问答以可引用事实的 `answered` 结果收口，不误报训练生成/修改失败。

## Impact

- 影响模块：`lib/server/agent-orchestrator/readonly-tools.ts`、`lib/server/agent-orchestrator/contracts.ts`、`lib/server/agent-orchestrator/runtime.ts`、`lib/server/agent-orchestrator/response-writer.ts`、`lib/server/exercises/exercise-service.ts`、`lib/server/exercises/exercise-repository.ts`、`lib/server/ai/prompt-config.ts`、`lib/server/chat/chat-service.ts`。
- 影响测试：Agent registry / runtime / Response Writer 单元测试、动作服务测试、聊天黑盒 LLM 流程测试。
- 影响用户体验：普通动作库问答不再触发训练卡片或失败兜底；动作详情回答来自数据库步骤，并允许 LLM 组织成更自然的教练式中文说明。
- 不涉及数据库表结构变更、权限模型变更或前端页面结构变更。
