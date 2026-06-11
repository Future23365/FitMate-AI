# 强化 LangChain 训练结构收口 Prompt

## 背景

当前生产 `/api/chat` 已迁移到 LangChain Agent Runtime 和 DeepSeek native `tool_calls`。真实 trace 显示，模型能够正确理解“推荐动作”的语义，并调用 `searchExerciseResources` 查询动作库事实；但最终只通过 `fitmate_final_response.content` 输出 Markdown 动作列表，没有调用 `submitVisibleTrainingProposal` 提交结构化训练结果，因此前端没有收到 `visible_output` 卡片。后续复测又显示同类输入有时会推卡，说明问题不是前端渲染，而是模型可见合同仍允许在“正文列出库内动作”和“结构化动作卡片”之间摇摆。

同一轮回答还暴露出格式问题：模型在正文中输出 Markdown 水平分割线，当前提示虽然已有“不使用独立的 ---”约束，但对 `***`、`___`、`<hr>` 和装饰性分隔行约束不够明确。

## 目标

- 在通用 LangChain system prompt 中补清“具体动作事实交付”的决策边界：当最终回答准备向用户呈现一个或多个具体训练动作，且这些动作由模型可见数据库动作事实支撑时，不能只用正文列出动作，必须通过当前 tool catalog 中的结构化训练收口工具提交并等待服务端校验。
- 在 `submitVisibleTrainingProposal` 的模型可见说明中补清它是库内具体动作集合、routine 和 plan 的结构化 finalization / validator 收口工具；其中具体动作集合由 `visibleTrainingProposal.kind = "exercise_selection"` 承载。它不查询动作库、不自动生成动作、不保存用户数据。
- 强化最终正文 `content` 的格式约束：禁止 Markdown 水平分割线和装饰性分隔行，分段应使用标题、编号列表或空行。

## 非目标

- 不新增服务端关键词、正则、同义词表、短句模板或自然语言语义分流。
- 不修改 LangChain runtime 主循环、tool wrapper 通用执行、response adapter、tool handler、数据库或前端渲染。
- 不把 `searchExerciseResources` 改成卡片生成器；它仍只负责只读动作事实查询。
- 不让服务端解析 `fitmate_final_response.content` 中的动作名并事后补卡；是否进入结构化收口仍由模型在调用 final response 前基于可见动作事实决定。
- 不恢复旧 `AgentAction` / `final_answer.visibleOutputs[]` 输出协议。

## 影响范围

- `lib/server/langchain-agent/prompt.ts`
- `lib/server/langchain-agent/final-response-schema.ts`
- `lib/server/langchain-agent/tools/visible-training-proposal-finalization-tool.ts`
- 相关 LangChain prompt / tool description 测试
- OpenSpec spec delta 和项目演变文档
