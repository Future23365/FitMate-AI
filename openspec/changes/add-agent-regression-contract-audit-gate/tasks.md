## 1. 历史回归审计 Skill

- [ ] 1.1 新增 `.codex/skills/agent-regression-contract-audit/SKILL.md`，明确它是大重构后的 secondary audit，不替代 `agent-tool-change-governance`、`agent-prompt-contract-governance` 或 `agent-fix-abstraction-gate`
- [ ] 1.2 在 Skill 中定义触发条件：Agent 主链迁移、framework migration、LangChain runtime 替换、跨模块 Agent 大重构、恢复历史行为、用户明确要求查旧 change 或怀疑历史回归
- [ ] 1.3 在 Skill 中定义非触发条件：普通单个 tool description、schema description、model-visible summary、repair feedback、prompt 局部文案或单个 handler 小修
- [ ] 1.4 在 Skill 中定义审计输入：`openspec/changes/archive/**`、`docs/项目演变历程.md`、`docs/方案变更历史/**` 和相关治理 spec
- [ ] 1.5 在 Skill 中定义输出格式：相关旧 change、历史禁止项/合同边界、当前覆盖项、漏项、需要补到 proposal / design / specs / tasks / tests 的动作

## 2. 模型可见合同门禁

- [ ] 2.1 新增严格白名单 schema 或等价结构检查，覆盖 Agent model-visible summary、tool result summary、repair feedback 和 trace summary
- [ ] 2.2 为 production LangChain tool catalog 增加 contract tests，枚举真实 tool 并覆盖成功、空结果或候选不足、schema 拒绝、validator 拒绝、policy 拒绝、重复输入和 terminal failure 的代表性状态
- [ ] 2.3 新增模型可见文本 linter，检查实际组装后的 system prompt、tool description、schema description、examples description、tool result summary、repair feedback、finalization tool description 和 trace summary
- [ ] 2.4 将历史明确禁止字段、过时协议字段、固定 workflow 文案和高风险 action 建议文案作为补充扫描项接入门禁
- [ ] 2.5 增加测试证明固定黑名单不是唯一门禁：同类换名字段、同类 workflow 提示和同类 case-specific 生产规则也会失败

## 3. 治理入口接入

- [ ] 3.1 更新 `agent-tool-change-governance` Skill，使 Agent tool / LangChain runtime / production tool catalog 大重构触发历史回归审计，普通单 tool 修改不触发
- [ ] 3.2 更新 `agent-prompt-contract-governance` Skill，使大范围 prompt / model input / output contract 重组触发历史回归审计，普通局部 prompt 文案小修不触发
- [ ] 3.3 更新相关 OpenSpec 或项目治理文档，说明历史回归审计的职责边界和与现有治理 Skill 的执行顺序

## 4. 验证

- [ ] 4.1 运行 `openspec validate add-agent-regression-contract-audit-gate --strict`
- [ ] 4.2 运行新增或调整后的 Agent model-visible contract gate 测试
- [ ] 4.3 按影响范围运行 `npm test` 或相关自动化测试，并按需运行 `npm run typecheck`
- [ ] 4.4 最终 diff 检查确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 toolName 语义分支
