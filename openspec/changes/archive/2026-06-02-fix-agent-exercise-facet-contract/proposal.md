## Why

当前 Tool-first Agent 在生成单次训练编排前会调用 `searchExercises` 检索动作候选，但工具输入允许模型自由填写 `targetMuscles` 和 `equipment`。当用户说“上肢 + 哑铃”时，模型把上肢写成数据库不存在的 `upper body`，导致动作库 hard filter 返回 0 个候选，最终阻断 routine 生成。

这个问题暴露的是 Agent 工具契约不够受控：模型需要看到动作库支持的筛选边界，并且需要有身体区域这类高层意图字段，而不是把自然语言范围词塞进精确 facet 字段。

## What Changes

- 为 Agent 的 `searchExercises` 工具补充受控 facet 契约，明确 `targetMuscles` 和 `equipment` 必须使用动作库真实 facet 值。
- 新增 `bodyRegions` 这类结构化身体区域输入，用于表达 `upper_body`、`lower_body`、`core`、`full_body` 等高层区域。
- 服务端在执行工具时只根据 `bodyRegions` 枚举做确定性展开，不从用户原文做关键词、同义词或语义重解释。
- `searchExercises` 空候选结果必须返回可恢复诊断，帮助 Agent 根据未匹配 facet 或可用 facet 重查，而不是立即 `blocked`。
- Agent 决策 prompt / registry 摘要必须让模型知道可用筛选边界和失败恢复策略。
- 覆盖“今天想练上肢，30 分钟，有哑铃，帮我安排一套”这类 routine 生成回归。

## Capabilities

### New Capabilities

- `agent-exercise-facet-contract`: 定义 Agent 动作检索工具的受控 facet、身体区域字段和空候选恢复行为。

### Modified Capabilities

- `readonly-llm-tool-calling`: 读工具在 Agent registry 中暴露的 Schema、摘要和失败结果需要支持受控动作检索契约。
- `chat-routine-composition`: 聊天 routine 生成必须在可恢复动作候选检索后继续 draft / validation 链路，而不是因可恢复 facet 偏差直接阻断。
- `exercise-metadata-pools`: 动作候选检索需要基于真实动作 facet 和身体区域展开结果构建候选池。

## Impact

- 影响 `lib/server/agent-orchestrator/readonly-tools.ts`、`lib/server/chat/chat-service.ts`、`lib/server/exercises/exercise-service.ts` 及相关类型。
- 影响 Agent prompt module、工具 registry 摘要、trace 中的 `searchExercises` failure detail。
- 需要新增或更新自动化测试，覆盖 body region 展开、未知 facet 诊断、Agent routine 生成链路。
- 不涉及数据库 schema 变更，不新增外部依赖。
