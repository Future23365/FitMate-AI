## 1. Preflight 与当前实现确认

- [ ] 1.1 确认 `lib/server/chat/agent-text-chat-service.ts` 当前 production registry 构造点、trace registry 摘要和空 registry 失败投影逻辑。
- [ ] 1.2 确认 `lib/server/agent-tools/index.ts`、fixture tools、`ToolRegistry` capability mode 和 contract helper 的现有注册模式。
- [ ] 1.3 确认动作列表查询可复用入口，包括 `lib/shared/exercises/query-schema.ts`、`lib/server/exercises/exercise-service.ts` 和 `Exercise` 发布态字段。
- [ ] 1.4 确认现有测试中所有断言空 production registry 的用例，并记录哪些需要迁移为受控 production registry 断言。

## 2. Tool Bundle 实现

- [ ] 2.1 新增 `searchExerciseResources` tool bundle，包含 `inputSchema`、`outputSchema`、policy metadata、handler、安全投影和必要的简短中文意图注释。
- [ ] 2.2 让 `inputSchema` 严格限制为 `q`、`category`、`suitability`、`level`、`force`、`mechanic`、`equipment`、`homeRequirement`、`muscle`、`goalTag`、`riskTag`、`published` 和 `sort`，拒绝未知字段、分页字段和消费侧字段。
- [ ] 2.3 在普通 production 聊天上下文中强制发布态边界：默认 `published = true`，显式 `published = false` 返回结构化输入或权限失败，不读取未发布动作。
- [ ] 2.4 复用现有动作查询服务执行结构化筛选，并使用服务端固定最大返回数量生成 `totalMatches`、`returnedCount`、`maxReturned` 和 `truncated`。
- [ ] 2.5 实现成功 output、空结果 output 和 handler / output schema 失败归一化，确保空结果仍为 `satisfied = true` 的事实查询结果。
- [ ] 2.6 确保 tool 不返回 `candidateSetId`，不登记 `candidate_set` resource，不生成训练卡片、保存事件或旧兼容 NDJSON 事件。

## 3. Registry、模型可见合同与生产接入

- [ ] 3.1 新增或调整 production registry 工厂，只注册 `searchExerciseResources`，并保留 fixture registry 仅用于测试。
- [ ] 3.2 将 `/api/chat` production Agent 接线从空 registry 切换为受控 production registry，不改变 route 主链路、Runtime、PlannerPort、Executor、Policy Guard 或 Response Renderer 主流程。
- [ ] 3.3 补齐 `searchExerciseResources` 的 `description`、`whenToUse`、`whenNotToUse`、schema 描述和 examples，覆盖何时使用、何时不用、关键字段、成功 / 失败含义、resource role 和 `final_answer` 引用方式。
- [ ] 3.4 保持通用 Agent prompt 不包含 `searchExerciseResources` toolName 特例，不新增服务端关键词、正则、同义词表或短句模板分流。
- [ ] 3.5 更新 trace / registry 摘要投影，使生产 trace 能记录 `searchExerciseResources` 的 manifestHash、toolCount、toolNames、tool result 摘要和失败 code。
- [ ] 3.6 更新空 registry 相关用户可见失败投影，只在真实 registry 为空时触发，不把已注册的 `searchExerciseResources` 误判为能力缺口。

## 4. Tool-Level 与 Contract 测试

- [ ] 4.1 为 `searchExerciseResources` 新增或更新 tool-level unit tests，直接覆盖 handler、`executeTool` 或当前真实 runtime 执行入口。
- [ ] 4.2 覆盖 `searchExerciseResources` 的成功路径、schema 拒绝、领域边界、失败归一化、resource contract、projection / redaction 和 policy / permission 边界。
- [ ] 4.3 按真实健身场景覆盖动作查询输入，包括自重 / 无器械、热身 / 主训练 / 拉伸、肌群、器械、目标标签、风险标签、空结果和截断结果。
- [ ] 4.4 覆盖 `published = true` 默认值、显式 `published = false` 拒绝、未知字段拒绝、非法枚举拒绝、分页字段拒绝和消费侧字段拒绝。
- [ ] 4.5 覆盖模型观察、用户投影和 trace summary 不泄漏完整 handler output、内部对象、未发布动作或训练候选 evidence。
- [ ] 4.6 覆盖该 tool 不产出 `candidateSetId`、`candidate_set` resource、训练卡片、保存事件或旧兼容 NDJSON 事件。

## 5. 生产接入与回归测试

- [ ] 5.1 更新 `tests/agent-core/contract-helper.test.ts` 或等价 contract helper 测试，验证 `searchExerciseResources` manifest、schema、policy、projection 和 redaction 边界。
- [ ] 5.2 更新 `tests/agent-core/tool-registry-manifest.test.ts` 或等价 registry manifest 测试，验证 production registry 只暴露 `searchExerciseResources` 且 schema summary 保留关键字段和枚举。
- [ ] 5.3 更新 `tests/agent-core/architecture-boundary.test.ts` 或等价架构扫描，确认 Agent core 中没有具体业务 toolName 分支、`/api/chat` 没有业务关键词分流、core 没有导入业务 handler。
- [ ] 5.4 更新 `tests/chat-service.test.ts` 或等价生产聊天测试，验证 `/api/chat` registry 摘要从空 registry 迁移为受控 registry，并且普通基础问答仍通过 `final_answer` 收口。
- [ ] 5.5 覆盖模型请求未知 tool 或非法 `searchExerciseResources` input 时仍由 Action Validator / repair / failure 边界处理，服务端不执行隐藏业务分支。
- [ ] 5.6 如 production route 或请求准备边界受影响，更新 `tests/api-routes.test.ts` 或等价 API route 测试。

## 6. 验证与收尾

- [ ] 6.1 运行 `openspec validate introduce-search-exercise-resources-tool --strict`。
- [ ] 6.2 运行 `npm test -- tests/agent-tools/search-exercise-resources.test.ts` 或该 tool 对应的最窄测试文件。
- [ ] 6.3 运行 `npm test -- tests/agent-core/contract-helper.test.ts`。
- [ ] 6.4 运行 `npm test -- tests/agent-core/tool-registry-manifest.test.ts`。
- [ ] 6.5 运行 `npm test -- tests/agent-core/architecture-boundary.test.ts`。
- [ ] 6.6 运行 `npm test -- tests/chat-service.test.ts`，并在影响 API route 时运行 `npm test -- tests/api-routes.test.ts`。
- [ ] 6.7 运行 `npm run typecheck`。
- [ ] 6.8 最终检查 `git diff`，确认只包含本 change 的 OpenSpec 文档、业务 tool 实现、必要注册接线和相关测试，没有混入无关改动。
