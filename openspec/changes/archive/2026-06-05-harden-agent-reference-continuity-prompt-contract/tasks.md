## 1. 范围与现状确认

- [x] 1.1 读取 `codex_logs/ai_trace_log.js` 和必要的 `codex_logs/ai_trace_texts.jsonl` 条目，确认问题表现为模型忽略本轮最新 observation 并复读历史 assistant 能力介绍。
- [x] 1.2 按 `agent-prompt-contract-governance` 完成 preflight，确认本 change 属于通用 Agent prompt 合同 + 单个业务 tool 模型可见 observation 投影，不属于 runtime / core / production route 变更。
- [x] 1.3 运行 `git status --short`，确认已有无关改动不会混入本 change。

## 2. Prompt 合同实现

- [x] 2.1 更新 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`，新增通用引用对象推理规则：省略、续问、替换、调整、继续或引用最近内容时，由模型基于当前可见上下文和事实自行判断被引用对象是否存在且可操作。
- [x] 2.2 在同一 prompt 中明确历史 assistant 消息只能作为上下文参考，不能作为本轮回复模板重复输出，除非用户明确要求复述。
- [x] 2.3 在同一 prompt 中明确本轮新的 observations / toolResults 应纳入推理，但不得要求固定调用某个 tool、固定输出某个 `payload.kind` 或固定引用某个 tool result / resource。
- [x] 2.4 确认 prompt 不新增 `换一批`、`再来一组`、`factCount = 0` 或等价固定短语 / 固定字段条件。

## 3. Observation 事实边界实现

- [x] 3.1 更新 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 `list_recent` model projection，说明 `facts[]` 是当前可见、可引用的 `visibleTrainingProposal` 事实索引集合。
- [x] 3.2 在 `list_recent` model projection 中说明空 `facts[]` 只表示当前可见事实中没有这类引用对象，可作为模型推理、解释缺少引用对象或澄清的事实依据，但不能支撑成功训练方案刷新或新训练方案生成。
- [x] 3.3 确认 projection 不包含用户短语触发规则、答案模板、固定 action 或固定 tool 调用顺序。

## 4. 测试与边界验证

- [x] 4.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖新增引用对象推理规则、历史 assistant 不作为模板、本轮 observation / toolResult 参与推理，以及不包含固定短语 / 固定字段条件。
- [x] 4.2 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`，覆盖 `list_recent` 空结果 projection 的事实边界说明，并断言不包含答案模板或固定短语触发规则。
- [x] 4.3 按需更新 `tests/agent-core/tool-registry-manifest.test.ts`，确认 production manifest / projection 中的描述性自然语言仍为中文，且没有固定短语路由。
- [x] 4.4 更新或补充生产聊天回归测试，覆盖无可见引用对象时省略表达不会复读历史能力介绍，以及有可见引用对象时仍由模型自主选择下一步 tool / answer / ask_user。
- [x] 4.5 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-tools/inspect-visible-training-proposals.test.ts tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 4.6 如修改 production chat replay 或共享 AI 编排逻辑，运行对应 `npm test -- tests/chat-service.test.ts` 或说明未运行原因。
- [x] 4.7 运行 `npm run typecheck`。

## 5. OpenSpec 与最终检查

- [x] 5.1 运行 `openspec validate harden-agent-reference-continuity-prompt-contract --strict`。
- [x] 5.2 使用 `rg` 检查本 change 的实现没有在 `/api/chat`、runtime、validator 或 tool handler 中新增 `换一批`、`再来一组`、`factCount = 0` 等服务端语义分支。
- [x] 5.3 使用 `git diff --check` 和 `git diff --stat` 检查 diff，只保留本 change 相关文件。
- [x] 5.4 完成实现总结，说明改了什么、为什么优于业务条件补丁、如何验证，以及是否还有剩余风险。
