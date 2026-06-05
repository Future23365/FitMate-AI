## 1. 合同审查

- [ ] 1.1 审查当前所有模型可见 repair feedback 入口，列出哪些字段来自 schema issue，哪些字段来自 runtime 手写自然语言 repair 文案。
- [ ] 1.2 审查 `AgentAction`、tool input、terminal visible output envelope 和 domain validator 的错误来源，明确每类错误的 `target.kind`。
- [ ] 1.3 标记并移除实现计划中的 toolName、字段组合、旧字段替换、用户 phrasing 和 trace case 特判。

## 2. 通用 schema error projector

- [ ] 2.1 新增或重构通用 schema error projector，把 validator issue 规范化为 `target`、`discriminator`、`errors[]`、`path`、`expected`、`actual`、`allowedFields`、`requiredFields` 和 `allowedValues`。
- [ ] 2.2 将 `AgentAction` schema failure 接入通用 projector，不再为 `question`、`message`、`usedToolResultIds`、`usedResourceRefs` 等旧字段拼固定替换文案。
- [ ] 2.3 将 tool input schema failure 接入通用 projector，不再为具体 tool 或具体字段组合生成业务 repair 字符串。
- [ ] 2.4 确保 projector 输出脱敏：不包含完整 handler payload、完整数据库对象、secret、stack trace 或跨用户事实。

## 3. Domain facts 收敛

- [ ] 3.1 将 terminal visible output validation 的模型可见失败结果收敛为 deterministic facts。
- [ ] 3.2 移除或隔离模型可见的 `repair`、`recoveryDirections`、`recoverableActions`、`nextToolName` 或等价下一步建议字段。
- [ ] 3.3 保留 validator 可确定的字段级 facts，例如 `path`、`code`、`actual`、`expected`、`allowedValues`、`resourceRef`。

## 4. Prompt / model input 配套

- [ ] 4.1 更新默认 Agent prompt 或 model input builder，加入通用 repair facts 读取规则。
- [ ] 4.2 确认字段语义只放在稳定 schema / manifest / examples / prompt 中，不由 runtime error 动态生成。
- [ ] 4.3 确认 prompt 不新增用户关键词、正则、短句模板或具体 trace case 规则。

## 5. 测试与回归

- [ ] 5.1 为 schema error projector 增加单元测试：缺字段、未知字段、类型错误、枚举错误、literal 错误、discriminator 错误。
- [ ] 5.2 增加 `AgentAction` invalid 测试，覆盖旧字段只产生 `unknown_field` / `required_field_missing` facts，不产生固定替换文案。
- [ ] 5.3 增加 fixture tool 测试，证明新增 tool 只靠 `inputSchema` 就能获得字段级 repair facts。
- [ ] 5.4 增加业务 tool 回归测试，确保 projector 中不存在具体 `inspectVisibleTrainingProposals`、`searchExerciseResources` 或等价 toolName repair 分支。
- [ ] 5.5 增加 terminal visible output validation 测试，确保 domain facts 不包含 `repair`、`recoveryDirections`、`recoverableActions`、`nextToolName` 或固定下一步建议。
- [ ] 5.6 增加 prompt / model input snapshot 测试，确保模型能看到通用 repair facts 读取规则。
- [ ] 5.7 增加 trace / replay 或 manual LLM 回归，验证模型收到结构化 facts 后能在剩余 repair budget 内重新输出合法 action。

## 6. 验证

- [ ] 6.1 运行 `openspec validate generalize-agent-schema-repair-feedback --strict`。
- [ ] 6.2 运行与实现范围相关的 TypeScript / unit tests。
- [ ] 6.3 如实现影响 model input snapshot 或 trace serialization，运行对应 snapshot / trace tests。
