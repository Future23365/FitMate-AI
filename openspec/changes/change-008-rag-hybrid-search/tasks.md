## 1. 向量字段与索引

- [x] 1.1 为 ArtifactIndex 和 Exercise 或等价索引结构增加 embeddingText 与 embedding 字段。
- [x] 1.2 配置 pgvector 或等价向量检索能力，并保留迁移/回滚说明。
- [x] 1.3 实现 embeddingText 生成器，避免写入无关大 payload 或敏感字段。
- [x] 1.4 实现 artifact 和 exercise 更新后的 embedding 生成或刷新流程。

## 2. Hybrid Search

- [x] 2.1 扩展 `searchArtifacts`，支持结构化过滤、全文检索、向量召回和业务 rerank。
- [x] 2.2 扩展 `searchExercises`，支持 exact name、alias、full-text、vector recall 和分池 post-filter。
- [x] 2.3 保证 userId、visibility、kind、scope、status、allowedSections、equipment、level 和 risk 等硬过滤不可被向量结果绕过。
- [x] 2.4 输出候选召回、过滤、rerank 和失败原因摘要。

## 3. Trace 与接入

- [x] 3.1 在 ReferenceResolver 语义引用中接入 artifact hybrid search。
- [x] 3.2 在 Exercise Retrieval Service 模糊动作需求中接入 exercise hybrid search。
- [x] 3.3 将 rag query、候选数量、过滤数量、rerank 依据和最终候选写入 AiRunTrace。

## 4. 测试与验证

- [x] 4.1 补充 artifact hybrid search 测试，覆盖“之前那个练胸的”等语义引用。
- [x] 4.2 补充 exercise hybrid search 测试，覆盖“拜拜肉”“核心不稳”“圆肩”等模糊表达。
- [x] 4.3 补充权限和硬过滤测试，确认向量召回不能越权或绕过风险约束。
- [x] 4.4 运行 `npm test`、`npm run typecheck`、`npm run lint`；如引入数据库扩展，运行相关迁移或说明无法运行原因。

## 5. 文档记录

- [x] 5.1 在 `docs/方案变更历史` 新增方案变更记录，说明 RAG 从 prompt 辅助升级为结构化过滤约束下的混合检索。
- [x] 5.2 如新增 pgvector、embedding 生成命令或环境配置，同步更新 README 或架构文档。
