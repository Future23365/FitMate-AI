# Terminal Failure Finalizer 输出校验放宽

时间：2026-06-06 14:00:26 CST

## 当前真实问题

terminal failure finalizer 的职责是主 Agent 已经失败后的用户可见兜底，但旧实现把它的输出又交给一层用户可见文案语义校验。该校验要求 `content` 命中特定中文失败披露短语，并扫描成功声明和内部技术词。结果是：finalizer 已经返回了可读 `content` 和 `suggestedQuestions`，却因为没有命中短语白名单被判 `finalizer_output_invalid`，最终退回固定 fallback。

这让兜底链路本身也变成容易失败的一环，不符合“失败后尽量给用户普通内容和建议”的目标。

## 调整思路

本次把 finalizer 输出合同收敛为确定性 shape 校验：

- `content` 必填、trim 后非空、长度受控。
- `suggestedQuestions` 可选，数量和单条长度受控。
- 输出 object 仍然 strict，拒绝 `visibleOutputs`、tool call 或额外字段。
- 不再基于中文短语、成功动词或内部技术词做用户可见文案语义判定。

主 Agent 的训练结构校验、动作事实校验、ResourceStore、Policy Guard、Response Renderer 和事实持久化边界不放宽。换句话说，无效训练卡片仍然不能展示或保存；只是失败解释本身不再被短语白名单拦下。

## 关键改动

- 删除 `terminal-failure-finalizer.ts` 中的 failure disclosure / success claim / technical leak 短语校验。
- 保留 `TerminalFailureFinalizerOutput` 的 strict Zod shape 校验。
- 更新单元测试，覆盖不含固定失败短语但 shape 合法的 finalizer 输出会通过。
- 更新 OpenSpec change `relax-terminal-failure-finalizer-validation`，记录兜底输出合同边界。

## 结果

相关验证通过：

- `openspec validate relax-terminal-failure-finalizer-validation --strict`
- `npm test -- tests/chat-terminal-failure-finalizer.test.ts tests/chat-service.test.ts`
- `npm run typecheck`
