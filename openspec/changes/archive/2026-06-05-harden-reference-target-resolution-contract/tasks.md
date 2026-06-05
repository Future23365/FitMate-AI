## 1. 范围与门禁

- [x] 1.1 使用 `agent-prompt-contract-governance` 完成模型可见合同 preflight，确认本 change 只修改通用 prompt、业务 tool observation、测试和演变文档。
- [x] 1.2 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁，确认修复对象是引用目标解析合同，具体短句和业务 tool 组合只进入 tool 局部说明或回归测试。
- [x] 1.3 运行 `git status --short`，确认已有无关改动不会混入本 change。
- [x] 1.4 运行 `openspec validate harden-reference-target-resolution-contract --strict`，确认 proposal / design / spec / tasks 有效。

## 2. 模型可见合同实现

- [x] 2.1 更新 `lib/server/agent-planners/prompts/agent-llm-prompt-config.ts`，新增通用引用目标解析合同：引用型请求与独立生成请求是不同目标。
- [x] 2.2 在同一 prompt 中明确引用对象不可确认时，不得改写成相邻的新生成目标，也不得输出结构化结果声称完成刷新、替换或调整。
- [x] 2.3 更新 `lib/server/agent-tools/exercise-facts/inspect-visible-training-proposals.tool.ts` 的 `list_recent` model projection，删除“开始新的生成”宽松出口，并明确空 `facts[]` 只支撑解释、澄清或补充目标请求。
- [x] 2.4 更新 `lib/server/agent-tools/exercises/search-exercise-resources.tool.ts` 的 model observation，说明动作查询结果不证明存在可操作的上一轮 `visibleTrainingProposal`，也不证明已经完成刷新、替换或调整。

## 3. 测试与文档

- [x] 3.1 更新 `tests/agent-core/agent-llm-prompt-config.test.ts`，覆盖引用目标解析、缺失引用对象不得降级成新生成、独立生成不得伪装成继续操作，并断言没有固定短句 / 字段 / 业务 tool 触发规则。
- [x] 3.2 更新 `tests/agent-tools/inspect-visible-training-proposals.test.ts`，覆盖 `list_recent` 空索引 observation 的新边界，并断言不包含“开始新的生成”和答案模板。
- [x] 3.3 更新 `tests/agent-tools/search-exercise-resources.test.ts`，覆盖动作查询 observation 不证明已有引用对象，也不证明刷新、替换或调整完成。
- [x] 3.4 更新 `tests/chat-service.test.ts` 或等价 production replay，覆盖具体短句和等价表达作为回归样例，证明无可见引用对象时模型可合法收口且不会调用动作查询生成 visible output。
- [x] 3.5 新增 `docs/方案变更历史` 文档，并在 `docs/项目演变历程.md` 末尾追加本次 Agent 引用目标合同收紧记录，时间使用上海时间精确到秒。

## 4. 验证

- [x] 4.1 运行 `npm test -- tests/agent-core/agent-llm-prompt-config.test.ts tests/agent-tools/inspect-visible-training-proposals.test.ts tests/agent-tools/search-exercise-resources.test.ts tests/chat-service.test.ts`。
- [x] 4.2 运行 `npm run typecheck`。
- [x] 4.3 运行 `openspec validate harden-reference-target-resolution-contract --strict`。
- [x] 4.4 使用 `rg` 检查 `/api/chat`、runtime、validator、tool handler 没有新增服务端关键词规则、自然语言模板路由、phrasing 特判或具体业务 `toolName` 语义分支。
- [x] 4.5 运行 `git diff --check` 和 `git diff --stat`，确认 diff 只包含本 change 相关文件，且未混入已有 `next-env.d.ts`。

## 5. 收尾

- [x] 5.1 根据实际完成情况更新本 `tasks.md` checklist。
- [x] 5.2 隔离无关 diff 后仅 stage 本 change 文件。
- [x] 5.3 按项目规则创建中文 commit。
