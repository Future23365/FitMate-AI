## 1. 入口加载逻辑

- [x] 1.1 删除 `/training` 缺少 `planId` 时自动选择 planned 训练或 fallback 训练的逻辑。
- [x] 1.2 缺少 `planId` 时展示错误状态和返回 `/plans` 入口，不渲染训练执行 UI。
- [x] 1.3 加载失败或训练项目为空时展示错误状态，不使用 fallback 训练替代。

## 2. 完成状态与训练执行解耦

- [x] 2.1 将 `isAwaitingStart` 改为只依赖当前页面执行态，不依赖 `plan.status`。
- [x] 2.2 调整状态标签，优先展示待开始、已暂停、准备中、进行中等当前执行态。
- [x] 2.3 确保已完成训练再次进入时显示“开始”，点击后正常进入准备倒计时、计时和语音流程。

## 3. 验证

- [x] 3.1 运行 `npm test` 或相关测试。
- [x] 3.2 运行 `npm run typecheck`。
- [x] 3.3 运行 `npm run lint`。
- [x] 3.4 运行 `openspec validate require-training-plan-id-and-ignore-completed-status --strict`。
- [x] 3.5 使用 Chrome DevTools MCP 验证 `/training` 缺少 `planId` 的错误状态，以及 `/training?planId=...` 显示待开始和开始按钮。
