## Context

当前 `/api/chat` 生产聊天通过 `AgentAction`、`ToolRegistry`、tool observations 和 visible output validator 让模型自主规划。最近围绕 `visibleTrainingProposal` 的刷新语义已经补齐了事实桥和只读查询工具，但最新 trace 暴露出一个更抽象的问题：模型在“引用目标不可确认”时，可能把继续 / 替换 / 调整已有对象的请求降级成相邻的新生成任务，并把新查询结果包装成成功刷新。

这不是服务端缺少某个短句分支。按照项目边界，LLM 是语义理解来源，服务端不能基于用户原文、关键词、短句模板、具体 `toolName` 或字段组合改写 action、调用顺序或最终回复策略。本 change 只修改模型实际可见的 prompt / observation 合同，并补测试证明没有新增服务端语义分流。

## Goals / Non-Goals

**Goals:**

- 在通用 Agent prompt 中表达稳定的引用目标解析合同：引用型请求与独立生成请求是不同目标。
- 在引用对象不可确认时，引导模型解释缺少上下文、澄清或请求补充目标，而不是偷偷改写成相邻的新生成并声称已完成刷新 / 替换 / 调整。
- 收紧 `inspectVisibleTrainingProposals(list_recent)` 空索引 observation，让它只表达当前可见事实状态和不可支撑边界。
- 收紧 `searchExerciseResources` observation，让它明确动作查询结果只证明动作事实，不证明当前 run 存在可刷新或可调整的已有对象。
- 用回归测试覆盖原始短句和同类变体，但不把测试短句写入生产规则。

**Non-Goals:**

- 不新增 `/api/chat`、Agent runtime、validator、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 `Response Renderer` 的语义分支。
- 不新增服务端关键词、正则、同义词表、短句模板、业务 `toolName` 分支或 `factCount` 字段组合分流。
- 不修改 tool input / output schema、handler、repository、API 契约、数据库结构或 visible output payload schema。
- 不新增“调用过某 tool 就必须引用该 tool result”的强制 grounding guard。

## Decisions

### 1. 通用 prompt 只描述引用目标合同

在 `agent-llm-prompt-config.ts` 中增加一条通用合同：当本轮请求依赖已有对象时，模型必须先基于当前 run 的 `messages`、`metadata`、`observations`、`toolResults` 或 consumable resource 判断对象是否真实存在且可操作。对象不可确认时，不得把请求改写成相邻的新生成目标，也不得输出结构化结果声称已完成替换、刷新或调整。

该合同不包含 `换一批`、`list_recent`、`facts=[]`、`searchExerciseResources` 等具体 case 触发条件。具体业务名只保留在业务 tool manifest / observation / tests 中。

备选方案是在 runtime 里识别空事实索引后拦截最终输出。该方案被排除，因为它会让服务端根据业务 tool result 组合判断用户语义，并可能变成具体 `toolName` 分支。

### 2. `list_recent` observation 删除“开始新的生成”宽松出口

当前 `inspectVisibleTrainingProposals(list_recent)` 的 observation 已表达空 `facts[]` 不能支撑成功刷新或新方案生成，但 `nextStepBoundary` 同时允许“开始新的生成”，给模型留下把引用目标降级成新生成的空间。

本 change 将该 observation 改为：空 `facts[]` 只说明当前可见事实中没有该类引用对象；若本轮目标依赖该引用，应解释缺少引用对象、澄清或请求补充目标。只有用户已提供独立生成所需目标和约束时，才可作为新请求处理，且不得宣称这是对已有对象的刷新、替换或调整。

### 3. `searchExerciseResources` observation 明确不证明已有对象存在

`searchExerciseResources` 可以为最终 `visibleTrainingProposal.exerciseItems[]` 提供动作事实，但它不负责判断当前会话是否存在上一轮用户可见训练方案，也不证明一次刷新已经完成。

本 change 在未应用 `excludeExerciseIds` 的 `refreshExclusionBoundary` 中说明：本次查询只提供动作事实，不证明当前 run 存在上一套可操作对象；引用对象不可见时，不得用该查询结果宣称刷新成功。

### 4. 测试按抽象层级分布

- prompt 测试覆盖通用引用目标合同，并断言没有固定短句 / 字段条件触发规则。
- tool observation 测试覆盖业务边界：空索引不可支撑成功刷新 / 替换 / 调整；动作查询不证明已有对象存在。
- production chat replay 用具体短句和等价表达作为回归样例，但这些样例不得反向决定生产规则。
- 架构边界检查使用 `rg` 确认 `/api/chat`、runtime、validator、tool handler 没有新增服务端语义分流。

## Risks / Trade-offs

- [Risk] 只改模型可见合同仍可能有个别模型输出不稳定。→ Mitigation：补充 prompt、observation 和 production replay 测试；若仍不稳定，继续增强模型可见事实摘要和 repair / clarification，不引入服务端语义分流。
- [Risk] prompt 过长稀释重点。→ Mitigation：新增规则保持短句，放在现有引用对象推理规则附近，不重复业务 tool manifest。
- [Risk] observation 过度约束模型自主规划。→ Mitigation：仅约束事实能否支撑某类成功声明，不规定固定 action、固定 tool 调用顺序或固定回复模板。

## Migration Plan

无需数据迁移。部署后新 prompt / observation 会随生产聊天下一次模型请求生效。回滚方式是恢复本 change 修改的 prompt / observation 文案和相关测试。

## Open Questions

无。
