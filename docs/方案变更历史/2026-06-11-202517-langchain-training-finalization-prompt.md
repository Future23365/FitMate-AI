# LangChain 训练结构收口 Prompt 强化

## 时间

2026-06-11 20:25:17 CST

## 当前问题

真实 trace 中，模型已经正确理解用户要“推荐动作”，并成功调用 `searchExerciseResources` 查询腹肌动作事实，但最终只在 `fitmate_final_response.content` 中输出 Markdown 动作列表，没有调用结构化训练收口工具，因此服务端没有产生 `visible_output`，前端也不会显示训练卡片。

同一类回复还容易输出 Markdown 水平分割线，例如 `---`，视觉上和当前聊天卡片风格不一致。此前 prompt 只写了不使用独立 `---`，约束不够完整。

## 调整思路

把问题收敛为模型可见合同缺口，而不是服务端语义分流：

- 全局 prompt 只补稳定规则：当本轮要交付可展示、可后续引用或可继续调整的训练动作集合、单次训练 routine 或多天训练 plan 时，正文不能替代结构化训练结果，必须通过当前 tool catalog 中的结构化训练收口工具提交并通过服务端校验。
- `submitVisibleTrainingProposal` 的 tool description 负责解释具体 tool 能力：它是训练动作集合、routine 和 plan 的 finalization / validator 收口，不查询动作库、不自动补动作、不保存用户数据。
- `fitmate_final_response.content` 的 schema description 和全局 prompt 同步禁止 Markdown 水平分割线、`<hr>` 和装饰性分隔行。

## 关键改动

- 更新 `lib/server/langchain-agent/prompt.ts`，区分普通文本说明和结构化训练交付。
- 更新 `lib/server/langchain-agent/final-response-schema.ts`，强化 `content` 输出格式约束。
- 更新 `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`，补清 `submitVisibleTrainingProposal` 的模型可见用途和边界。
- 更新相关 prompt / tool description 测试，锁住模型可见合同。

## 边界

- 没有新增服务端关键词、正则、同义词表、短句模板或 phrasing 特判。
- 没有修改 LangChain runtime、tool wrapper 通用执行、response adapter、tool handler、数据库或前端。
- `searchExerciseResources` 仍然只是只读动作事实查询，不生成训练卡片。
