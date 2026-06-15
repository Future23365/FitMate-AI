## 1. Fixture 与共享合同

- [ ] 1.1 抽出 JSON fixture 的共享类型和校验逻辑，避免 dev 页面从 `manual-tests` 目录导入运行时代码。
- [ ] 1.2 为命令行基础黑盒 runner 保留薄 adapter，确保继续读取同一 JSON fixture。
- [ ] 1.3 新增服务端 dev-only fixture 读取入口，供 `/dev/llm-blackbox` 页面加载 flow 列表。

## 2. 聊天展示解耦

- [ ] 2.1 从首页 `ChatPage` 抽出只读聊天转录 / 消息气泡 / assistant 内容展示组件。
- [ ] 2.2 让首页继续使用抽出的共享消息展示组件，并保持首页视觉与交互不变。
- [ ] 2.3 让审核页只复用消息展示组件，不复用首页 header、sidebar、欢迎态、输入框、焦点管理或整页滚动逻辑。

## 3. Headless Runner

- [ ] 3.1 实现 dev 审核页专用 runner 状态模型，覆盖 batch、flow、turn、执行状态、人工审核状态和诊断字段。
- [ ] 3.2 实现单 flow 串行运行：自动发送 `turns[]` 中的用户消息，等待 `done` 后进入下一轮。
- [ ] 3.3 实现运行全部 flow：按 fixture 顺序串行执行，每个 flow 使用独立 conversation，失败 flow 不阻断后续 flow。
- [ ] 3.4 实现停止运行：取消当前请求或停止后续队列，并标记未执行项。
- [ ] 3.5 复用生产 chat client、NDJSON parser 和消息投影函数，禁止 DOM 自动点击、iframe 驱动或首页 selector 依赖。

## 4. 结果记录与统计

- [ ] 4.1 记录每轮用户可见结果：assistant 文本、visibleOutputs、suggestedQuestions、错误、安全文案、eventTypes、conversationId、responseMessageId 和耗时。
- [ ] 4.2 接入 dev trace / token best-effort 诊断，缺失 token 时展示 missing，不影响执行状态。
- [ ] 4.3 实现浏览器会话内临时结果存储，支持查看历史 run、清空结果和容量限制。
- [ ] 4.4 实现统计摘要：flow / turn 总数、执行通过/失败/跳过数、人工审核状态、耗时和 token 诊断。

## 5. 审核页面

- [ ] 5.1 新增 `/dev/llm-blackbox` 页面，并按开发态诊断能力控制可访问性。
- [ ] 5.2 实现 flow 列表、运行单个 flow、运行全部、停止、清空结果和 run 选择。
- [ ] 5.3 实现当前 flow 的 transcript 预览，复用共享消息展示组件渲染 Markdown、训练卡片和建议提问。
- [ ] 5.4 实现 turn 详情面板，展示 `userInput`、`expectedOutput`、实际输出摘要、诊断和人工审核操作。

## 6. 测试

- [ ] 6.1 增加 fixture schema / store 测试，覆盖合法 fixture、缺失字段、重复 id 和可变轮次。
- [ ] 6.2 增加 runner 状态机测试，覆盖单 flow、全部 flow、失败跳过、停止运行和统计计算。
- [ ] 6.3 增加临时结果存储测试，覆盖保存、恢复、清空和容量限制。
- [ ] 6.4 增加消息展示组件测试，覆盖 assistant 文本、visibleOutputs、suggestedQuestions 和错误展示。
- [ ] 6.5 增加解耦边界测试，证明审核页 runner 不导入首页整页 `ChatPage`，不依赖 DOM selector 或 iframe 驱动。

## 7. 文档与验证

- [ ] 7.1 更新 `docs/manual-llm-basic-blackbox-tests.md`，说明命令行 runner 和 dev 审核页的职责区别。
- [ ] 7.2 运行 `npm test -- tests/manual-llm-basic-blackbox.test.ts` 和新增相关测试。
- [ ] 7.3 运行 `npm run typecheck`。
- [ ] 7.4 运行 `npm run lint`。
- [ ] 7.5 运行 `openspec validate add-dev-llm-blackbox-reviewer --strict`。
- [ ] 7.6 在用户确认可复用已启动的 `http://localhost:3000` 后，用真实浏览器验证 `/dev/llm-blackbox` 的页面加载、单 flow 运行、全部 flow 队列启动、停止、结果查看、统计展示和清空结果；如无法运行，最终交付说明原因和剩余风险。
