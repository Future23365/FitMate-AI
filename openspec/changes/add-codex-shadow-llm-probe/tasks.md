## 1. 合同与边界确认

- [ ] 1.1 确认 Shadow Probe 是 dev-only 诊断能力，不修改生产 `/api/chat` 行为、LangChain runtime 模型调用行为、DeepSeek provider、production tool handler 或用户可见 NDJSON 输出。
- [ ] 1.2 使用 Agent prompt / tool 合同治理规则检查 Shadow input 白名单，确认不把 debug-only trace、源码实现、历史经验或开发者解释暴露给 Shadow 决策阶段。
- [ ] 1.3 固化首版完整 tool 范围：`inspectVisibleTrainingProposals`、`searchExerciseResources`、`submitVisibleTrainingProposal` 非持久化 validator path，以及 `fitmate_final_response` 或等价 finalization 终态。
- [ ] 1.4 固化当前 AI trace 链路审计结论：区分 tool 执行 / token / tool result summary 的可信部分，以及 system prompt / tool description / schema description / finalization tool 快照缺失的不完整部分。
- [ ] 1.5 明确 Shadow Probe 不得把现有 AI trace 的 `requestSummary.messagePreviews`、`toolNames` 或导出日志标题说明当作完整模型可见输入来源。

## 2. Skill 设计与落地

- [ ] 2.1 新增 `.codex/skills/aitest-shadow-llm-probe/SKILL.md`，定义触发场景、Shadow 决策硬边界、逐轮流程和污染审计要求。
- [ ] 2.2 新增 skill references，分别说明 shadow input contract、decision output schema 和 diagnosis rubric。
- [ ] 2.3 为 skill 生成或维护 `agents/openai.yaml`，确保显示名称、简介和默认提示与 `SKILL.md` 一致。
- [ ] 2.4 运行 skill 校验脚本或等价检查，确认 skill frontmatter、命名和引用文件有效。
- [ ] 2.5 增加最小示例 input / decision 文档片段，确保后续 Codex 能按 skill 直接写出合法 `round-xxx-decision.json`。

## 3. Shadow Input 与 Decision Schema

- [ ] 3.1 定义 `ShadowLlmProbeInput`、`ShadowLlmProbeDecision`、`ShadowLlmProbeReport` 等共享类型和 Zod schema。
- [ ] 3.2 定义 `ShadowLlmProbeManifest`、`ShadowLlmProbeRoundState` 和终态枚举，确保 run 可从文件目录复现。
- [ ] 3.3 实现 shadow input exporter，复用当前生产 prompt、tool catalog、tool description、schema description、finalization tool 和模型可见预算装配入口。
- [ ] 3.4 为 shadow input 添加输入包内部 `sourceRefs` 或等价路径标识，供 Codex decision 引用证据。
- [ ] 3.5 实现 shadow input 白名单和脱敏校验，阻止源码实现、debug-only trace、raw DB payload、密钥、cookie、环境变量和开发者解释进入输入包。
- [ ] 3.6 为 shadow input 添加 `modelVisibleInputAudit`，记录 system prompt、messages、tools、finalization tool、tool result summary 和预算说明的来源、长度、hash / fingerprint、完整性和缺失字段。
- [ ] 3.7 为 messages 审计添加重复 message 风险标记，帮助区分 input assembly / hydration 问题与模型决策问题。
- [ ] 3.8 如果后续支持从 `/dev/ai-traces` 或 `codex_logs/ai_trace_log.js` 导入 shadow input，导入器必须在缺少 system prompt / tool schema 快照时标记 `incomplete_trace_source` 并拒绝声称等价。
- [ ] 3.9 为 schema 和白名单补充 fixture 测试，覆盖合法输入、禁止字段、缺失 tool schema、sourceRefs、预算摘要、`modelVisibleInputAudit`、重复 message 风险和不完整 trace import。

## 4. CLI 与文件型 Run 管理

- [ ] 4.1 新增 dev-only CLI / script，支持为单条用户消息创建 `codex_logs/shadow_llm_probe/<runId>/manifest.json` 和 `round-001-input.json`。
- [ ] 4.2 CLI start 命令输出 `runId`、当前轮 input 路径、待写 decision 路径和报告路径。
- [ ] 4.3 CLI continue 命令读取当前轮 decision，校验后推进 tool 执行、下一轮 input 或终态 manifest。
- [ ] 4.4 CLI report 命令仅基于 run 目录文件生成或刷新 `report.json` 和 `report.md`，不得重新执行 tool 或调用模型。
- [ ] 4.5 CLI 支持列出当前 run 状态，方便开发者知道下一步该写 decision、继续推进还是查看报告。

## 5. Shadow Runner 与 Tool 推进

- [ ] 5.1 新增 decision validator，校验 `decision` 类型、`runId`、`roundId`、`toolName` 可用性、`toolInput` schema、证据字段和污染审计字段。
- [ ] 5.2 新增 `inspectVisibleTrainingProposals` dev-safe executor，复用生产 schema 和模型可见 summary。
- [ ] 5.3 新增 `searchExerciseResources` dev-safe executor，复用生产 schema、handler 查询边界和模型可见 summary。
- [ ] 5.4 新增 `submitVisibleTrainingProposal` 非持久化 executor，复用生产 schema、validator 和模型可见 rejected / accepted summary，但不得保存聊天、训练事实或用户会话状态。
- [ ] 5.5 新增 `fitmate_final_response` 或等价 finalization 终态处理，记录 Codex final intent 和依据，不调用 DeepSeek。
- [ ] 5.6 新增 loop 推进逻辑，按轮次生成下一轮 input，直到 `final_answer`、`contract_gap`、预算耗尽、tool 执行失败或 decision 校验失败。
- [ ] 5.7 确保 runner 不基于用户自然语言、关键词、正则、同义词、短句模板或历史摘要替 Codex 选择 tool、改写 tool input 或生成 final answer。
- [ ] 5.8 为每轮生成 `round-xxx-tool-result.json` 或等价执行摘要，记录执行状态、模型可见 summary 和下一轮路径。

## 6. 报告生成

- [ ] 6.1 生成 `report.json` 和 `report.md`，记录 run id、输入来源、轮次数、最终状态、每轮 decision、证据、字段理由、缺失事实和污染审计。
- [ ] 6.2 报告按固定类别归因合同问题，覆盖 prompt conflict、tool selection ambiguity、schema source ambiguity、tool result summary insufficiency、stop condition ambiguity、finalization contract ambiguity、debug-only leakage、case-specific rule smell、runtime budget mismatch 和 contamination risk。
- [ ] 6.3 报告区分 Shadow 决策报告和开发者诊断建议；开发者诊断建议引用源码或测试时，不得倒灌为 Shadow 决策依据。
- [ ] 6.4 确保报告生成不重新执行 tool、不调用真实模型、不读取 shadow run 目录以外的证据作为 Shadow 决策依据。
- [ ] 6.5 报告必须输出 `modelVisibleInputAudit` 摘要；当来源不完整或存在重复 message 风险时，优先归因为输入包 / trace 可观性问题，而不是直接归因给 prompt 或 tool description。

## 7. 测试与验证

- [ ] 7.1 增加普通自动化测试，验证 shadow input exporter、decision validator、tool availability、tool input schema 拒绝、白名单脱敏、sourceRefs 和报告归因。
- [ ] 7.2 增加 runner 集成测试，覆盖合法 `searchExerciseResources` 决策生成下一轮 input。
- [ ] 7.3 增加 runner 集成测试，覆盖 `submitVisibleTrainingProposal` 非持久化 validator path 不写聊天、训练事实或用户会话状态。
- [ ] 7.4 增加 CLI 测试，覆盖 start、continue、report 和 run status。
- [ ] 7.5 增加 architecture / boundary 测试，确认生产 `/api/chat` 不导入 Shadow Probe skill、decision 文件或 runner。
- [ ] 7.6 增加完成度测试或文档测试，确认首版不是静态导出：至少能从用户消息生成 input、读取合法 decision、执行 dev-safe tool、生成下一轮 input 和报告。
- [ ] 7.7 增加 trace 可观性测试，确认缺少 system prompt / tool schema 快照的 trace import 会被标记为 incomplete，并且不会被当作完整模型输入。
- [ ] 7.8 增加 message 审计测试，确认重复用户 message 会进入 `modelVisibleInputAudit` 风险标记。
- [ ] 7.9 运行 `openspec validate add-codex-shadow-llm-probe --strict`。
- [ ] 7.10 运行与新增 schema、CLI、runner 和报告生成相关的 `npm test` 子集。
- [ ] 7.11 运行 `npm run typecheck`；如果无法运行，说明原因。
