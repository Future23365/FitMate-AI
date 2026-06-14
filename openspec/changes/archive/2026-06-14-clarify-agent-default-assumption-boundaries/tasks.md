## 1. 合同治理

- [x] 1.1 使用 `agent-prompt-contract-governance` 确认本次变更只修改模型可见 prompt、tool description、schema description 和 observation 文案，不修改 runtime / route / handler 执行合同。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 确认方案没有把具体 trace、用户原话、toolName 或字段组合升格成通用服务端语义规则。

## 2. 模型可见说明实现

- [x] 2.1 更新 `lib/server/langchain-agent/prompt.ts`，加入保守默认与澄清出口规则，并表达宽泛身体目标可按代表性覆盖理解。
- [x] 2.2 更新 `searchExerciseResources` 的 description / schema description，表达多肌群查询是代表性候选覆盖，`zeroMatchMuscles` 是诊断事实，不是继续补查义务。
- [x] 2.3 更新 `homeRequirement` 的 schema description，表达其只在需要环境、场地或支撑条件时填写，省略表示不额外限定环境条件。
- [x] 2.4 更新 `searchExerciseResources` 的 model-visible summary / observation 文案，保持与 tool description 中的 `zeroMatchMuscles` 消费边界一致。

## 3. 测试与验证

- [x] 3.1 更新或新增 prompt / production tool catalog / model-visible contract tests，覆盖保守默认、澄清出口、代表性覆盖、`homeRequirement` 输入来源和 `zeroMatchMuscles` 消费边界。
- [x] 3.2 运行 `openspec validate clarify-agent-default-assumption-boundaries --strict`。
- [x] 3.3 运行与本次改动相关的自动化测试。
- [x] 3.4 检查最终 diff，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
