## 1. 治理与范围确认

- [x] 1.1 使用 `agent-tool-change-governance` 确认本 change 属于终态输出 validator、共享 draft schema 和模型可见 output contract 调整；不新增业务 tool、不修改 `/api/chat` 主链路、不新增服务端自然语言分流。
- [x] 1.2 使用 `agent-prompt-contract-governance` 检查 `outputContracts` 模型可见文案，确认只保留“优先生成完整三段式”的正向要求，不告诉模型可以省略 `warmup` 或 `stretch`。
- [x] 1.3 使用 `agent-fix-abstraction-gate` 完成抽象层级门禁审查，确认没有新增关键词规则、自然语言模板路由、phrasing 特判或具体 `toolName` 语义分支。
- [x] 1.4 开始实现前运行 `git status --short`，确认无关改动不混入本 change。

## 2. 终态 validator 与 payload schema

- [x] 2.1 更新 `tests/visible-training-proposal-validator.test.ts`，先覆盖只包含合法 `training` 的 `routine` 可以通过终态校验。
- [x] 2.2 更新 `tests/visible-training-proposal-validator.test.ts`，覆盖缺少 `training` 的 `routine` / `plan` 仍返回结构化失败。
- [x] 2.3 更新 `lib/server/visible-training-proposals/visible-training-proposal-contract.ts`，将 `routine` / `plan` section hard requirement 从三段式改为必须包含 `training`。
- [x] 2.4 更新 `lib/server/visible-training-proposals/visible-training-proposal-validator.ts`，只在缺少 `training` 时返回 `section_coverage_missing`，不因缺少 `warmup` 或 `stretch` hard fail。
- [x] 2.5 保留数据库 hard validation：`exerciseId` 存在、发布态、权限、`allowedSections`、`prescription`、`schedule` 和 schema 严格性。

## 3. 模型可见 output contract

- [x] 3.1 更新 `lib/server/config/agent-visible-output-contracts.ts`，把三段式表述改为正向完整度偏好，避免出现“可选”“可以省略”“可以不生成热身/拉伸”等模型可见说明。
- [x] 3.2 更新相关 prompt / model input 测试，确认 `outputContracts` 仍引导模型优先生成 `warmup`、`training`、`stretch`，但不再把 `warmup` / `stretch` 缺失描述为 validator hard fail。
- [x] 3.3 用 `rg` 检查生产模型可见合同中不存在 `warmup` / `stretch` 可省略的说明。

## 4. 富卡片 draft schema 与 adapter

- [x] 4.1 更新 `lib/shared/workout-plans/draft-schema.ts`，允许 `WorkoutRoutineDraft.sections` 和非休息训练日 sections 只包含已生成 section，但必须包含 `training`。
- [x] 4.2 更新 `features/chat/lib/visible-training-proposal-cards.ts`，只展示实际存在的 section，并保持 `warmup`、`training`、`stretch` 的相对顺序。
- [x] 4.3 更新 `tests/visible-training-proposal-cards.test.ts` 和 `tests/shared-schemas.test.ts`，覆盖 training-only routine / plan 可适配为富卡片且不伪造 support section。
- [x] 4.4 确认保存转换继续按已存在 section 输出，不要求固定三段式。

## 5. 文档与验证

- [x] 5.1 运行 `openspec validate relax-visible-training-section-hard-validation --strict`。
- [x] 5.2 运行 `npm test -- tests/visible-training-proposal-validator.test.ts`。
- [x] 5.3 运行 `npm test -- tests/visible-training-proposal-cards.test.ts tests/shared-schemas.test.ts`。
- [x] 5.4 运行 `npm test -- tests/chat-service.test.ts` 或最窄相关 chat-service 测试，确认生产 Planner input 和终态失败路径断言更新。
- [x] 5.5 运行 `npm run typecheck`。
- [x] 5.6 在 `docs/方案变更历史/` 新增上海时间精确到秒的方案变更记录。
- [x] 5.7 在 `docs/项目演变历程.md` 末尾追加本次核心边界变化。
- [x] 5.8 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` 语义分支，且未混入无关 `features/chat/components/chat-page.tsx` 改动。
