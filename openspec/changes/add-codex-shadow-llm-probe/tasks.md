## 1. 合同与边界确认

- [ ] 1.1 确认 Shadow Probe 是 dev-only 诊断能力，不修改生产 `/api/chat`、LangChain runtime、DeepSeek provider、production tool handler 或用户可见 NDJSON 输出。
- [ ] 1.2 使用 Agent prompt / tool 合同治理规则检查 Shadow input 白名单，确认不把 debug-only trace、源码实现、历史经验或开发者解释暴露给 Shadow 决策阶段。
- [ ] 1.3 确认首版允许执行的 tool 范围；如包含 `submitVisibleTrainingProposal`，必须走非持久化或 dev-safe validation path。

## 2. Skill 设计与落地

- [ ] 2.1 新增 `.codex/skills/aitest-shadow-llm-probe/SKILL.md`，定义触发场景、Shadow 决策硬边界、逐轮流程和污染审计要求。
- [ ] 2.2 新增 skill references，分别说明 shadow input contract、decision output schema 和 diagnosis rubric。
- [ ] 2.3 为 skill 生成或维护 `agents/openai.yaml`，确保显示名称、简介和默认提示与 `SKILL.md` 一致。
- [ ] 2.4 运行 skill 校验脚本或等价检查，确认 skill frontmatter、命名和引用文件有效。

## 3. Shadow Input 与 Decision Schema

- [ ] 3.1 定义 `ShadowLlmProbeInput`、`ShadowLlmProbeDecision`、`ShadowLlmProbeReport` 等共享类型和 Zod schema。
- [ ] 3.2 实现 shadow input exporter，复用当前生产 prompt、tool catalog、tool description、schema description、finalization tool 和模型可见预算装配入口。
- [ ] 3.3 实现 shadow input 白名单和脱敏校验，阻止源码实现、debug-only trace、raw DB payload、密钥、cookie、环境变量和开发者解释进入输入包。
- [ ] 3.4 为 schema 和白名单补充 fixture 测试，覆盖合法输入、禁止字段、缺失 tool schema 和预算摘要。

## 4. Shadow Runner 与 Tool 推进

- [ ] 4.1 新增 dev-only CLI / script，支持为单条用户消息生成 `codex_logs/shadow_llm_probe/<runId>/round-001-input.json`。
- [ ] 4.2 新增 decision validator，校验 `decision` 类型、`toolName` 可用性、`toolInput` schema、证据字段和污染审计字段。
- [ ] 4.3 新增 tool executor，合法 `call_tool` 决策通过后调用真实 dev-safe tool wrapper / handler，并生成模型可见 tool result summary。
- [ ] 4.4 新增 loop 推进逻辑，按轮次生成下一轮 input，直到 `final_answer`、`contract_gap`、预算耗尽、tool 执行失败或 decision 校验失败。
- [ ] 4.5 确保 runner 不基于用户自然语言、关键词、正则、同义词、短句模板或历史摘要替 Codex 选择 tool、改写 tool input 或生成 final answer。

## 5. 报告生成

- [ ] 5.1 生成 `report.json` 和 `report.md`，记录 run id、输入来源、轮次数、最终状态、每轮 decision、证据、字段理由、缺失事实和污染审计。
- [ ] 5.2 报告按固定类别归因合同问题，覆盖 prompt conflict、tool selection ambiguity、schema source ambiguity、tool result summary insufficiency、stop condition ambiguity、finalization contract ambiguity、debug-only leakage、case-specific rule smell、runtime budget mismatch 和 contamination risk。
- [ ] 5.3 报告区分 Shadow 决策报告和开发者诊断建议；开发者诊断建议引用源码或测试时，不得倒灌为 Shadow 决策依据。

## 6. 测试与验证

- [ ] 6.1 增加普通自动化测试，验证 shadow input exporter、decision validator、tool availability、tool input schema 拒绝、白名单脱敏和报告归因。
- [ ] 6.2 增加 architecture / boundary 测试，确认生产 `/api/chat` 不导入 Shadow Probe skill、decision 文件或 runner。
- [ ] 6.3 运行 `openspec validate add-codex-shadow-llm-probe --strict`。
- [ ] 6.4 运行与新增 schema、runner 和报告生成相关的 `npm test` 子集。
- [ ] 6.5 按需运行 `npm run typecheck`；如果未运行，说明原因。
