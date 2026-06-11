# AgentAction 合同字段字典化

时间：2026-06-06 13:03:58 CST

## 当前问题

此前默认 `system prompt` 虽然已经把 `visibleTrainingProposal` 的完整业务结构迁移到 `outputContracts`，但通用 prompt 本身仍然承担了太多职责：`AgentAction` 字段形状、旧字段拒绝、`usedRefs`、`visibleOutputs`、repair 说明、引用对象操作、不可执行能力、训练业务策略都挤在同一段模型指令里。

这会让 prompt 看起来像后端接口文档。模型能读懂，但更容易在执行时把字段说明、业务策略和修复规则混在一起，尤其是在 `ask_user`、结构化输出事实不足、引用上一次结果和 repair loop 场景里。

## 调整思路

本次继续收敛默认 `system prompt`：它只保留 Planner 身份、JSON 输出、三类 `AgentAction`、tool registry 边界、终态语义、grounding、安全边界和不可执行能力决策顺序。

字段形状、字段字典、决策策略、repair 规则和 few-shot 统一放进模型可见 `actionContract`。训练结构输出仍由 `outputContracts` 承载，`visibleTrainingProposal` 自己解释 `exercise_selection`、`routine`、`plan`、section coverage、`prescription` 和 `schedule`。

## 关键改动

- 新增 `actionContract`，与 `tools`、`outputContracts`、`observations`、`toolResults` 一起进入 Planner user payload。
- `actionContract` 集中解释 `content`、`suggestedQuestions`、`usedRefs`、`visibleOutputs`、`toolResults[].fulfillment.satisfied`、`producedResources` 和 `resource summary`。
- `ask_user` 只暴露唯一正确形状，不再让默认 system prompt 反复列出旧字段黑名单。
- `visibleTrainingProposal` output contract 增加字段字典、kind 选择规则和 few-shot。
- 当前 `plan` 明确为 `one routine template + schedule`，不支持 `routines[]`、`routineId` 或每天不同完整动作编排；A/B 训练日模板需要新的 output contract schema。

## 为什么不是最小补丁

继续压缩几句 prompt 文案只能短期变短，但仍会把 schema、字段解释、业务策略和 repair 规则混在一起。拆出 `actionContract` 后，system prompt 负责执行边界，`actionContract` 负责 action 字段，`outputContracts` 负责业务输出结构，三者职责更稳定，也更容易通过测试审计。

## 验证方式

- OpenSpec strict validation。
- prompt config 测试：默认 system prompt 长度和禁止项，`actionContract` 字段字典和 few-shot。
- adapter 测试：真实 Planner user payload 包含 `actionContract` 与 `outputContracts`。
- visible output contract 测试：字段字典、plan 单模板取舍和边界 examples。
