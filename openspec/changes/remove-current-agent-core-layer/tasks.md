## 1. 删除边界确认

- [ ] 1.1 复核 `lib/server/agent-orchestrator/**`，列出旧 runtime、旧 contracts、旧 tools、旧 registry、旧 response writer、旧 trace projection 和旧测试夹具。
- [ ] 1.2 复核 `/api/chat`、`lib/server/chat/chat-service.ts` 和 response writer 入口，确认所有旧 Agent core 导入点。
- [ ] 1.3 复核动作检索、训练校验、artifact、policy/confirmation、user memory 和 trace storage，标记为保留领域服务。

## 2. 删除旧 Agent 核心层

- [ ] 2.1 删除当前旧 Agent runtime、execution state、execution result、planner loop 和 dependency graph 实现。
- [ ] 2.2 删除当前旧 Agent tool registry、readonly tools、workout tools、tool capability contract 适配和旧 tool 外壳。
- [ ] 2.3 删除当前旧 Agent response writer、activity event mapper、final result projection 和 resource recovery 逻辑。
- [ ] 2.4 删除依赖旧 Agent core 的测试夹具、trace fixture 和黑盒内部字段断言。

## 3. 调整聊天入口

- [ ] 3.1 调整 `/api/chat` 和聊天服务，使生产路径不再导入或调用旧 `runAgentOrchestrator()`。
- [ ] 3.2 保留认证、请求校验、hydration、NDJSON 流式协议和 trace id 输出。
- [ ] 3.3 新 Agent core 未接入时，返回明确的可恢复服务不可用结果，不接回旧 intent-first、standalone readonly loop 或旧 trigger parser。

## 4. 保留底层服务

- [ ] 4.1 确认动作库、训练校验、artifact 持久化、policy/confirmation、user memory 和数据库访问仍可独立导入。
- [ ] 4.2 移除这些领域服务对旧 Agent core 的反向依赖。
- [ ] 4.3 将黑盒 LLM 场景文本保留为后续新 core 验收语料，不再断言旧 Agent 内部事件。

## 5. 防回归验证

- [ ] 5.1 增加或更新架构级扫描，证明生产 `/api/chat`、聊天服务和流式响应路径不导入旧 Agent core、旧 tools、旧 readonly loop、旧 trigger parser 或旧 intent-first 模块。
- [ ] 5.2 增加或更新领域服务导入测试，证明保留服务不依赖旧 Agent core。
- [ ] 5.3 运行 `openspec validate remove-current-agent-core-layer --strict`。
- [ ] 5.4 运行 `npm run typecheck`。
- [ ] 5.5 运行相关自动化测试，至少覆盖聊天入口缺席旧 core、保留领域服务导入和旧测试断言清理。
