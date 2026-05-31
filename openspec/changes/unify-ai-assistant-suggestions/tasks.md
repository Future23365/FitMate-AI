## 1. 统一建议模型

- [x] 1.1 定义共享 `AssistantSuggestion` 类型和 Zod Schema，包含 `label`、`message`、`kind`、`blocking`、`source`。
- [x] 1.2 实现服务端建议归一化函数，合并旧字段和新结构建议，完成去重、限量、排序和来源标记。
- [x] 1.3 增加用户口吻校验，过滤 AI 指令式、追问式或系统口吻建议，例如“请重新说明你的训练目标、时间和器械条件”。
- [x] 1.4 在 AI Trace 中记录原始建议来源、过滤原因、最终可见 `assistantSuggestions`。

## 2. LLM 阶段输出接入

- [x] 2.1 调整意图解析结构化输出，使缺信息场景产出 `clarification` 类型的用户口吻建议候选。
- [x] 2.2 调整动作推荐生成输出，使推荐成功后可产出 `next_action` 类型建议候选。
- [x] 2.3 调整 routine / plan 生成或修复输出，使生成失败和可调整场景产出 `retry` 或 `adjustment` 类型建议候选。
- [x] 2.4 接入引用确认和 patch 确认来源，使其统一进入 `assistantSuggestions`。
- [x] 2.5 确认实现不默认新增独立 suggestion LLM 调用，只复用已有阶段输出；如确需新增后处理调用，必须单独说明成本和触发条件。

## 3. 流事件与前端兼容

- [x] 3.1 在 `/api/chat` 流中输出 `assistant_suggestions` 统一事件。
- [x] 3.2 更新聊天前端 hook，优先消费 `assistant_suggestions`，并保留 `suggested_replies` / `suggested_questions` 兼容。
- [x] 3.3 更新聊天消息渲染，使建议 chips 统一来自 `assistantSuggestions`，避免旧事件和新事件重复展示。
- [x] 3.4 确认点击建议后发送的是 `message` 字段，而不是仅用于显示的 `label`。

## 4. 测试与验证

- [x] 4.1 补充服务端测试，覆盖旧字段归一化为 `assistantSuggestions`。
- [x] 4.2 补充服务端测试，覆盖“请重新说明你的训练目标、时间和器械条件”被过滤。
- [x] 4.3 补充聊天流测试，覆盖 `assistant_suggestions` 事件输出和旧 `suggested_replies` 兼容。
- [x] 4.4 补充动作推荐成功后 next action 建议的回归测试。
- [x] 4.5 补充前端 hook 或组件测试，覆盖点击建议发送 `message`。
- [x] 4.6 运行 `npm test -- --run tests/chat-service.test.ts`，并按实现影响补充运行相关前端测试。
- [x] 4.7 运行 `npm run typecheck`；如改动影响构建边界，再运行 `npm run build` 或说明无法运行原因。

## 5. 文档记录

- [x] 5.1 在 `docs/方案变更历史` 新增记录，说明 AI 建议从多字段分散模型收敛为统一 `assistantSuggestions`。
- [x] 5.2 如 trace UI 字段说明受影响，同步更新相关调试文档或组件说明。
