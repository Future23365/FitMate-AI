## 1. Prompt 收敛

- [x] 1.1 清理 `lib/server/ai/prompt-config.ts` 中健康、伤病、疼痛、高风险、医疗和就医相关提示。
- [x] 1.2 调整 summary、workout plan 和 exercise recommendation prompt，避免主动保留或追问健康限制。

## 2. 服务端触发规则

- [x] 2.1 在 `lib/server/chat/chat-service.ts` 中新增健康类 `missingActionFields` 过滤逻辑。
- [x] 2.2 调整 `assistant_action` 派生逻辑，确保健康类缺失字段不会阻断计划、编排或推荐推送。
- [x] 2.3 确保目标、时长、周期、器械或场地等非健康训练信息仍可作为触发判断依据。

## 3. 文档与测试

- [x] 3.1 更新相关单元测试，覆盖“我要一周都练这个”应触发 `workout_plan`。
- [x] 3.2 更新 prompt 文案断言，确保不再包含健康/医疗主动追问语义。
- [x] 3.3 按需更新文档中关于健康限制作为模型上下文或测试覆盖点的说明。

## 4. 验证

- [x] 4.1 运行 `openspec validate remove-health-safety-gating --strict`。
- [x] 4.2 运行相关自动化检查，至少包含 `npm test` 和 `npm run typecheck`。
