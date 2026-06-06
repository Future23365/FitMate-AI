## 1. 审查与设计确认

- [ ] 1.1 执行 Agent prompt contract governance preflight，确认本 change 只修改 prompt / model input / output contract / repair feedback 合同，不新增业务 tool、不改 `/api/chat` 外部协议、不改数据库或渲染器。
- [ ] 1.2 执行 Agent 修复抽象层级门禁审查，明确具体业务名只允许进入 `outputContracts`、tool manifest、observation、resource contract、validator diagnostics 或回归测试，不进入通用 system prompt 触发规则。
- [ ] 1.3 审阅生产 Planner 实际模型输入入口，确认 `DeepSeekModelAdapter` 或等价 model input builder 当前 system message、user payload、`tools`、`observations`、`toolResults` 和 trace 记录方式。
- [ ] 1.4 确认本 change 不新增服务端关键词、正则、同义词表、短句模板、用户 phrasing 特判、固定业务 `toolName` 流程或业务 outputType 语义路由。

## 2. Output contract 配置

- [ ] 2.1 在 `lib/server/config/` 下新增或调整集中配置，定义 Planner 可见 `outputContracts` 类型、导出函数和默认 registry。
- [ ] 2.2 为 `visibleTrainingProposal` 定义 output contract，包含 `outputType`、`schemaVersion = "1"`、`description`、`whenToUse`、`whenNotToUse`、`schemaSummary`、`groundingRequirements`、`validatorBoundary` 和必要 examples。
- [ ] 2.3 将 `exercise_selection`、`routine`、`plan`、`warmup` / `training` / `stretch`、`prescription`、`schedule.assignments`、section coverage、正文不能作为事实源等规则迁移到 `visibleTrainingProposal` output contract。
- [ ] 2.4 确保 output contract 的描述性自然语言使用中文，`outputType`、字段名、enum、schema id、`payload.kind`、`schemaVersion` 等技术标识保持英文。
- [ ] 2.5 确保 output contract 不暴露完整 handler payload、完整数据库对象、secret、provider 原文、跨用户数据或内部 stack。

## 3. Planner 模型输入

- [ ] 3.1 扩展 production Planner user payload，使 `outputContracts` 与 `tools`、`observations` 和 `toolResults` 并列进入模型可见输入。
- [ ] 3.2 更新 trace / debug 摘要，使开发者能审计某次模型调用看到的 output type、schema version、数量或等价摘要，且不泄漏敏感 payload。
- [ ] 3.3 确保 `outputContracts` 只作为模型可见能力说明，不参与服务端 action、toolName、outputType 或 payload kind 路由。

## 4. System prompt 瘦身

- [ ] 4.1 收敛 `buildAgentActionSystemPrompt()` 或等价默认 prompt：保留 `AgentAction` JSON 输出、`tool_call` / `final_answer` / `ask_user`、tool registry、input schema、grounding、`usedRefs`、policy / resource / validator、安全和不可执行能力边界。
- [ ] 4.2 从默认 system prompt 移除 `visibleTrainingProposal` 的完整 payload 结构、routine / plan section coverage 细则、`prescription` / `schedule` 细则、业务 examples、固定业务 tool 恢复流程和 payload kind 选择指南。
- [ ] 4.3 在默认 system prompt 中仅保留简短规则：结构化用户可见输出必须遵守当前可见 `outputContracts[]`，且不得伪造未执行、未注册或未校验结果。
- [ ] 4.4 增加通用不可执行请求决策顺序：可直接回答则 `final_answer`；缺必要信息则 `ask_user`; 需要未注册能力则不得 `tool_call` 或承诺执行；已有事实不足则继续合法 tool、澄清、repair 或 fallback。

## 5. Failed / diagnostic 终态边界

- [ ] 5.1 更新 prompt / model input / repair feedback，使 failed tool result、diagnostic resource、不可消费 resource 或 `satisfied=false` result 不得支撑成功 `final_answer`。
- [ ] 5.2 明确 failed / diagnostic 后的合法路径：继续当前可见且合法的 `tool_call`、返回 `ask_user`、进入 repair，或由 production terminal failure fallback / finalizer 收口。
- [ ] 5.3 保留 `ok=true` 且 `satisfied=true` 的 0 条查询结果可支撑普通文本解释的路径，但不得支撑结构化训练卡片、routine、plan、保存或未注册能力承诺。

## 6. 测试与验证

- [ ] 6.1 新增或更新 prompt config 测试，断言 system prompt 包含通用 AgentAction / grounding / policy / validator / 不可执行能力边界，并且不再包含完整 `visibleTrainingProposal` 业务输出规则。
- [ ] 6.2 新增或更新 model input builder 测试，断言 `outputContracts` 与 `tools`、`observations`、`toolResults` 一起进入生产 Planner user payload。
- [ ] 6.3 新增或更新 output contract 测试，断言 `visibleTrainingProposal` contract 包含 schema version、payload kind、section coverage、grounding requirements、validator boundary 和中文描述性说明。
- [ ] 6.4 新增或更新 terminal grounding / fallback / repair 测试，覆盖 failed / diagnostic result 不能作为成功 `final_answer` 唯一 grounding，且可进入 `ask_user`、继续 tool、repair 或 production fallback。
- [ ] 6.5 新增或更新架构扫描，证明 `/api/chat`、Agent runtime、tool handler、validator 和 renderer 没有新增用户原文、关键词、正则、同义词表、短句模板、phrasing 或具体业务 `toolName` 语义分支。
- [ ] 6.6 运行 `openspec validate decouple-agent-output-contracts-from-system-prompt --strict`。
- [ ] 6.7 运行相关自动化测试；涉及 TypeScript、AI 编排、schema 或共享业务逻辑时运行 `npm test` 或等价相关测试，并按需运行 `npm run typecheck`。
- [ ] 6.8 如果需要真实模型验证，只使用显式手动命令，不把真实模型调用放入默认 `npm test`。
