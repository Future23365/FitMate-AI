## 1. Prompt 合同治理 Skill

- [ ] 1.1 使用 `skill-creator` 流程确认 Agent prompt 合同治理 Skill 的目录、名称、description 和触发关键词。
- [ ] 1.2 新增 `agent-prompt-contract-governance` Skill，要求触发后执行 OpenSpec / Git / prompt 修改类型 preflight。
- [ ] 1.3 在 Skill 中明确触发范围：Agent prompt、model input、tool manifest、schema summary、examples、repair feedback、context package、observations、compressed tool results 和业务 tool 模型可见说明。
- [ ] 1.4 在 Skill 中明确本 Skill 与 `agent-tool-change-governance` 的分工：tool/core/production 范围治理优先由 `agent-tool-change-governance` 处理，prompt/model input 合同由本 Skill 处理。
- [ ] 1.5 在 Skill 中要求实现前先确认模型实际可见输入，而不是只检查源文件文案。

## 2. 固定 Agent Prompt 合同

- [ ] 2.1 在 Skill 中写明通用 Agent prompt 必须表达的 `AgentAction` 输出格式和允许 action 类型。
- [ ] 2.2 在 Skill 中写明 tool 调用边界：只能调用 `ToolRegistry` 注册的 `toolName`，tool input 必须严格匹配 schema，不能假装 tool 已执行或虚构 tool result。
- [ ] 2.3 在 Skill 中写明 final grounding 边界：`final_answer` 必须基于 `satisfied=true` 的 tool result 或 `consumable` resource。
- [ ] 2.4 在 Skill 中写明 diagnostic / failed / unsatisfied 结果只能用于 `ask_user`、失败解释、阻断说明或 repair，不能支撑成功 `final_answer`。
- [ ] 2.5 在 Skill 中写明 write / high risk tool 必须经过 `Policy Guard` / confirmation，模型不能自行宣称已确认或已写入。
- [ ] 2.6 在 Skill 中写明模型不能绕过 `ResourceStore`、`Policy Guard`、`Resource Contract Validator` 或 `Response Renderer`。

## 3. 业务 Tool 模型可见说明

- [ ] 3.1 在 Skill 中要求新增业务 Agent tool 时同步补充模型可见说明：何时使用、何时不用、input schema 关键字段、成功结果含义、失败或 diagnostic 含义、resource role 和 final answer 引用方式。
- [ ] 3.2 在 Skill 中要求区分通用 Agent prompt 规则和单个业务 tool 的 manifest / schema 描述，不得把业务 tool 的特例写成通用 prompt 规则。
- [ ] 3.3 在 Skill 中写明禁止项：不得用服务端关键词、正则、同义词表、短句模板或业务 `toolName` 特判改写 LLM 的高层语义决策。
- [ ] 3.4 在 Skill 中写明新增业务 tool 的 prompt 修改若需要影响 core 安全、resource、policy 或 grounding 基础规则，必须升级为 core contract 设计，而不是直接改 prompt。

## 4. OpenSpec 与文档约束

- [ ] 4.1 更新 `docs/agent-tool-orchestrator-design.md` 或相关协作文档，记录 Agent prompt 合同治理 Skill 的使用方式和与 `agent-tool-change-governance` 的分工。
- [ ] 4.2 如新增或调整 Skill 目录、测试命令或验证命令，更新 README 或相关开发文档；若无影响，在实现总结中说明原因。
- [ ] 4.3 确保后续 Agent prompt 相关非文案 change 的 `proposal.md` / `design.md` / `tasks.md` 明确 prompt 修改类型、允许触碰的 model input 入口、禁止触碰的 runtime / core 模块和验证计划。
- [ ] 4.4 在 `docs/方案变更历史` 中新增本次 Agent prompt 合同治理 Skill 记录，时间使用上海时区精确到秒。
- [ ] 4.5 在 `docs/项目演变历程.md` 末尾追加本次 prompt 合同治理入口的简要记录。

## 5. 验证与收尾

- [ ] 5.1 运行 `openspec validate add-agent-prompt-contract-governance-skill --strict`。
- [ ] 5.2 运行 Skill 基础校验；如 `quick_validate.py` 因环境缺少依赖无法运行，记录原因并执行等价 frontmatter / metadata 检查。
- [ ] 5.3 按改动范围运行 prompt config、manifest、schema summary、model input builder、Agent runtime 或 final grounding 相关测试；如果本次只新增 Skill 和文档，说明未运行业务 prompt 测试的原因。
- [ ] 5.4 修改 TypeScript、API、Schema、AI 编排或共享逻辑后运行 `npm run typecheck`；若本次未修改这些内容，说明不需要运行的原因。
- [ ] 5.5 最终检查 `git diff`，确认只包含本 change 的 Skill、OpenSpec、测试和必要文档改动，没有混入真实 prompt runtime 修改、业务 tool 实现或生产链路接入。
