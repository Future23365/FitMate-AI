## 1. 根因与边界确认

- [x] 1.1 读取 `codex_logs/ai_trace_log.js` 和 `codex_logs/ai_trace_texts.jsonl`，确认失败链路是 `visibleTrainingProposal` section 不合法导致 `terminal_reference_invalid -> repair_limit_exceeded`。
- [x] 1.2 检查本次模型实际可见输入，包括 system prompt、tool manifest、schema summary、examples、observations、compressed tool results 和 invalid action repair observation。
- [x] 1.3 记录本 change 的禁止边界：不改 `/api/chat` 主链路、不改 Agent runtime 主循环、不新增服务端关键词/正则/同义词/短句模板分流、不强制 Planner 调用具体 tool。

## 2. 前置模型可见合同

- [x] 2.1 更新 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts` 或等价模型输入入口，表达 `visibleTrainingProposal.exerciseItems[*]` 的 `exerciseId + section` 需要由当前 run 可见动作事实支撑。
- [x] 2.2 确保模型可见说明表达 `allowedSections` 是校验 `exerciseItems[*].section` 的动作事实字段。
- [x] 2.3 确保通用 prompt 不写 `searchExerciseResources` 的固定恢复流程，不把具体业务 `toolName` 写成通用 AgentAction 规则。

## 3. searchExerciseResources 模型可见说明与投影

- [x] 3.1 更新 `searchExerciseResources` manifest 的 `whenToUse` / `whenNotToUse` / output 说明，明确 `groups.<section>` 与 `visibleTrainingProposal.exerciseItems[*].section` 的对应关系。
- [x] 3.2 更新 `searchExerciseResources` model observation projection，增加短小 `groupSemantics` 字段，只解释 `groups.<section>` 分组语义。
- [x] 3.3 确认 `groupSemantics` 不复制动作列表，不新增 `sectionEvidence`、`exerciseSectionEvidence`、`visibleTrainingProposalEvidence` 或等价重复证据表。
- [x] 3.4 确认 `searchExerciseResources` 仍不产出 `candidate_set` resource、routine、plan、patch、训练卡片、保存事件或任意下游业务副作用。

## 4. visibleTrainingProposal repair feedback

- [x] 4.1 更新 `visibleTrainingProposal` section 校验失败的结构化 details，包含 `code = "section_not_allowed"`、字段 `path`、`exerciseId`、输出的 `section` 和数据库 `allowedSections`。
- [x] 4.2 确认 terminal output validator 和 invalid action observation 会把脱敏后的结构化 details 传给下一轮 Planner。
- [x] 4.3 确认 repair feedback 不包含固定下一步、不要求必须调用某个具体 tool、不自动改写 Planner action。

## 5. 自动化测试

- [x] 5.1 更新或新增 `visibleTrainingProposal` validator 单测，覆盖 `Pushups` 放入 `warmup` 且 `allowedSections = ["training"]` 时返回结构化 `section_not_allowed`。
- [x] 5.2 更新或新增 `searchExerciseResources` tool/projection 单测，覆盖 model observation 包含 `groupSemantics`，且不包含重复证据表和完整 handler output。
- [x] 5.3 更新或新增 tool manifest 测试，覆盖 `searchExerciseResources` 的模型可见说明包含 `groups.<section>` 与 `visibleTrainingProposal.exerciseItems[*].section` 对应关系。
- [x] 5.4 更新或新增 prompt/model input 测试，覆盖 `allowedSections` 与 `visibleTrainingProposal.exerciseItems[*].section` 的事实合同，并确认通用 prompt 不包含固定 `searchExerciseResources` 恢复流程。
- [x] 5.5 更新或新增 runtime repair observation 测试，覆盖非法 `visibleOutputs` 后下一轮 observation 保留 `path`、`exerciseId`、`section`、`allowedSections` 和错误 code。
- [x] 5.6 增加回归 fixture 或等价测试，覆盖只拿到 `groups.training` 时，系统不会接受把 training-only 动作放入 `warmup` 的 `visibleTrainingProposal`。

## 6. 验证

- [x] 6.1 运行 `openspec validate harden-visible-training-proposal-evidence-contract --strict`。
- [x] 6.2 运行 `npm test -- tests/agent-core/planner-validator.test.ts`。
- [x] 6.3 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [x] 6.4 运行覆盖 `searchExerciseResources` 的最窄 tool/projection 测试文件。
- [x] 6.5 运行覆盖生产聊天或 runtime visible output repair 的最窄测试文件。
- [x] 6.6 如修改 TypeScript、schema、AI orchestration 或共享业务逻辑，运行 `npm run typecheck`。
- [x] 6.7 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`，确认没有新增 `/api/chat` 关键词分流、Agent core 业务 `toolName` 分支或 runtime 主流程越界。
- [x] 6.8 最终检查 `git diff`，确认本 change 没有混入无关文件或已有脏文件。
