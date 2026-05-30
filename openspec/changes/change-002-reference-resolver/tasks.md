## 1. 前置依赖与类型

- [x] 1.1 确认 `change-001-conversation-artifact` 已提供 artifact、index 和 recent artifact summaries。
- [x] 1.2 新增 `ReferenceResolution`、候选摘要、解析输入和解析原因的 TypeScript 类型与 Zod 校验。
- [x] 1.3 定义 ReferenceResolver 在 `/api/chat` 编排中的调用位置和失败返回结构。

## 2. ReferenceResolver v1

- [x] 2.1 实现近指引用识别，覆盖“这个”“这套”“刚才那个”“上一个”等表达。
- [x] 2.2 实现当前会话 recent artifacts 的顺序解析规则，优先使用 UI 展示顺序和时间顺序。
- [x] 2.3 实现语义引用候选召回，基于 artifact index 的 kind、title、summary、goal、muscles、equipment 和时间字段过滤。
- [x] 2.4 实现候选内选择规则，确保 resolved 结果的 artifactId 必须来自候选集合。
- [x] 2.5 实现 ambiguous 和 not_found 分支，返回候选摘要、澄清问题或未找到原因。

## 3. 受控工具

- [x] 3.1 新增 `searchArtifacts` 工具，按 userId、sessionScope、kind、query 和 limit 返回候选摘要。
- [x] 3.2 新增 `getArtifactPayload` 工具，读取 artifact 前执行 userId、status 和 payload schema 校验。
- [x] 3.3 将工具调用接入 AI 编排层，禁止 LLM 绕过工具直接访问 artifact payload。

## 4. 聊天流程接入

- [x] 4.1 在意图解析后识别引用或修改语义，并调用 ReferenceResolver。
- [x] 4.2 对 resolved 结果继续进入解释、重复生成或后续 Patch 流程。
- [x] 4.3 对 ambiguous 结果返回面向用户的候选确认问题。
- [x] 4.4 对 not_found 结果返回重新说明或新生成流程，不使用 summary 伪造历史卡片。

## 5. 测试与验证

- [x] 5.1 补充近指引用测试，覆盖“这个”“上一个”“刚才那套”。
- [x] 5.2 补充语义引用测试，覆盖“之前那套练胸的”“上次长期计划”。
- [x] 5.3 补充 ambiguous、not_found 和候选外 artifactId 拒绝测试。
- [x] 5.4 补充 `getArtifactPayload` 权限隔离测试。
- [x] 5.5 运行 `npm test`、`npm run typecheck` 和 `npm run lint`。

## 6. 文档记录

- [x] 6.1 在 `docs/方案变更历史` 新增方案变更记录，说明引用解析从模型猜测升级为候选受控解析。
- [x] 6.2 如调整 AI 编排链路或工具接口，同步更新相关架构文档。
