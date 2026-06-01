# Agent 动作 Facet 契约修复

时间：2026-06-01 22:25:35 +0800

## 背景

真实 trace 显示，用户输入“今天想练上肢，30 分钟，有哑铃，帮我安排一套”时，Tool-first Agent 首轮调用 `searchExercises`，把“上肢”写成了 `targetMuscles: ["upper body"]`。动作库的肌群字段是 `肩部`、`胸部`、`背阔肌`、`肱二头肌` 等真实 facet，`upper body` 不存在，因此 hard filter 返回 0 个候选，Agent 随后直接 `blocked`。

这不是动作库缺数据，也不是 API 报错，而是工具输入契约过宽：模型可以把高层范围词写进需要精确匹配的字段。

## 调整思路

这次没有让服务端读取用户原文做“上肢”关键词判断。新的边界是：

- LLM 负责把自然语言理解成结构化字段。
- `bodyRegions` 表达 `upper_body`、`lower_body`、`core`、`full_body` 这类高层区域。
- `targetMuscles` 和 `equipment` 继续表示动作库真实 facet。
- 服务端只在收到结构化 `bodyRegions` 后做确定性展开。
- 如果模型仍误把 `upper body` 放进 `targetMuscles`，工具根据结构化 diagnostics 做一次恢复查询。

## 关键改动

- `searchExercises` 输入新增 `bodyRegions`，并在动作检索服务内展开为真实肌群 facet。
- 动作检索 diagnostics 新增 `expandedTargetMuscles`、`unmatchedTargetMuscles`、`unmatchedEquipment`、`suggestedTargetMuscles`、`suggestedEquipment` 和 `retryable`。
- Agent 工具摘要和 prompt 明确 `targetMuscles/equipment` 必须用真实 facet，高层区域必须用 `bodyRegions`。
- `searchExercises` 工具执行在遇到可恢复未知 facet 时，基于 diagnostics 自动重查一次，避免真实链路只靠 prompt 纠偏。
- 测试覆盖 `upper_body + 哑铃` 候选召回、`upper body` 未知 facet 诊断，以及工具级恢复查询。

## 结果

局部验证中，`exercise-service.test.ts` 和 `agent-orchestrator.test.ts` 共 39 个测试通过。按当前本地动作库统计，`dumbbell / 哑铃` 有 123 个动作，精确 `upper body` 为 0；把上肢区域展开为真实肌群后，存在可用哑铃上肢候选。
