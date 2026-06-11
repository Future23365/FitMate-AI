# 设计说明

## Prompt 修改类型

- 通用 Agent prompt 合同：补结构化训练交付与普通文本回答的决策边界。
- 单个业务 tool 模型可见说明：补 `submitVisibleTrainingProposal` 的 Purpose / Use When / Do Not Use When / Input Source / Output Meaning / Grounding Rules。
- structured final response 字段说明：强化 `content` 禁止 Markdown 水平分割线和装饰性分隔行。

## 分层依据

本 change 对照 `docs/llm-prompt-guidance.md` 的以下原则：

- System Prompt 放角色、硬约束、输出格式、安全边界和终态 / 工具动作区别。
- Planner Policy 放选择规则、优先级、停止条件和合法失败出口。
- LangChain Tool Description / Schema Description 说明工具能力、边界、输入来源、输出事实含义和 grounding。
- Tool description 写能力边界，不写关键词，不写完整 workflow。
- 同一规则不重复解释；全局 prompt 只写稳定决策边界，具体结构和 tool 能力写入对应 tool description / schema description。

## 设计方向

1. 通用 prompt 不写 `submitVisibleTrainingProposal` 作为用户语义触发条件。
   - 通用 prompt 使用“当前 tool catalog 中的结构化训练收口工具”表达稳定边界。
   - 这样避免把具体业务 `toolName` 升格为通用 prompt 规则。

2. `submitVisibleTrainingProposal` description 承担具体 tool 能力说明。
   - 说明它用于提交模型已经构造好的结构化训练结果。
   - 说明适用对象是训练动作集合、单次训练 routine、多天训练 plan。
   - 说明不适用于动作教学、训练知识解释、注意事项、筛选结果说明等普通文本回答。

3. 正文分隔线约束落在两个模型可见入口。
   - 全局 prompt 的“回答规则”中补输出格式硬约束。
   - `fitmate_final_response.content` JSON Schema description 同步补字段级说明。
   - 本 change 只改 prompt / schema description，不做 response adapter 清洗。

## 抽象层级门禁

结论：可继续。

1. 抽象问题类型：结构化训练交付决策边界缺失，以及最终正文格式约束不足。
2. 通用合同修复：用“可展示、可后续引用、可继续调整的训练结构”定义结构化收口准入条件；不使用具体用户短句。
3. 业务 tool 局部说明：`submitVisibleTrainingProposal` 只作为自身 tool description / schema description 中的 finalization 能力出现。
4. 回归测试样例：覆盖训练动作集合交付规则、普通文本回答边界和 Markdown 分隔线禁止项。
5. 服务端语义分流检查：不新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。

## 风险与取舍

- 风险：规则过硬可能让模型把普通动作知识解释也结构化。
  - 缓解：prompt 和 tool description 同时保留普通文本回答边界，明确动作教学、注意事项和训练知识解释不需要结构化收口。
- 风险：全局 prompt 直接写具体 toolName 会违反抽象层级。
  - 缓解：全局 prompt 写“结构化训练收口工具”，具体 toolName 只出现在 tool description / schema description / 测试中。
- 风险：只靠 prompt 仍不能 100% 阻止分隔线。
  - 缓解：本 change 先加强模型可见格式合同；若后续仍复现，再单独评估 response adapter 格式清洗。

## 验证计划

- `openspec validate harden-langchain-training-finalization-prompt --strict`
- `npm test -- tests/langchain-agent-runtime/runtime.test.ts tests/langchain-agent-tools/submit-visible-training-proposal.test.ts`
- `npm run typecheck`
