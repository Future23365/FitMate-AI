## 1. 变更边界与治理检查

- [ ] 1.1 完成架构解耦检查：确认本 change 只新增 `Exercise` execution taxonomy 字段、共享 taxonomy 常量、类型 / DTO 和字段级校验，不调整 LangChain runtime 主循环、provider payload、production response adapter 主流程、`/api/chat` 主链路或 `searchExerciseResources` tool 合同。
- [ ] 1.2 确认当前 change 不包含现有动作数据回填、LLM 辅助字段补齐、人工审查报告、旧字段到新字段映射脚本或 `facetCatalog.executionTaxonomy` 迁移。
- [ ] 1.3 完成抽象层级门禁：确认没有新增用户原话触发规则、关键词规则、正则、同义词表、短句模板或 provider `tool_calls` 改写逻辑。
- [ ] 1.4 在实现前确认 `prefer-low-friction-exercise-candidates` 不与本 change 并行实施；本 change 只提供字段落点，不引入低门槛默认策略。

## 2. 数据库与 taxonomy

- [ ] 2.1 新增共享 execution taxonomy 模块，定义 `requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel`、`noiseLevel` 的受控取值、中文说明、排序关系和 Zod 校验。
- [ ] 2.2 更新 `Exercise` 共享类型和 DTO，加入 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel`、`noiseLevel`，并为核心类型补充职责注释。
- [ ] 2.3 新增 Prisma migration，在 `Exercise` 上加入新 taxonomy 字段和必要索引；不删除旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh`。
- [ ] 2.4 将 `requiresExternalEquipment` 设计为 nullable unknown 语义；现有动作 migration 后不得被默认写成 `false`。
- [ ] 2.5 确认 seed / 导入流程在没有显式 execution taxonomy 输入时保持 `requiresExternalEquipment = null`、`requiredEquipmentTags = []`、`supportRequirementTags = []`、`setupComplexity = "unknown"`、`impactLevel = null`、`noiseLevel = null`，不得基于旧字段推断新 taxonomy。
- [ ] 2.6 固定 taxonomy 不变量校验：`requiresExternalEquipment = false` 时 `requiredEquipmentTags` 为空，`requiresExternalEquipment = true` 时 `requiredEquipmentTags` 非空，`requiresExternalEquipment = null` 表示未知且不得作为无器械事实，`supportRequirementTags = ["none"]` 与其他支撑/场地 tag 互斥，`setupComplexity = "unknown"` 不参与 `setupComplexityMax` 上限匹配。
- [ ] 2.7 增加字段级测试，覆盖 migration 默认值、共享 taxonomy 合法值、unknown 不得伪装成无器械 / 零准备 / 低冲击 / 安静，以及不新增 `isNoEquipment`、`isHomeFriendly`、`needsMat`、`requiresPartner`、`requiresGym`、`isLowFriction` 等派生冗余字段。

## 3. 后续范围剥离确认

- [ ] 3.1 确认本 change 不新增一次性回填脚本，不把当前动作库旧字段映射到新 taxonomy，不输出人工审查报告。
- [ ] 3.2 确认本 change 不新增调用大模型的数据补齐脚本；`impactLevel`、`noiseLevel` 和细粒度器械补齐后续单独处理。
- [ ] 3.3 确认本 change 不修改 `searchExerciseResources` 模型可见 input schema、schema description、examples、facet catalog、model observation、user projection、trace summary 或 repository 查询逻辑。

## 4. 文档与验证

- [ ] 4.1 更新 README、架构文档或动作数据维护文档中与 `Exercise` 新字段、unknown 语义和后续数据补齐边界相关的说明。
- [ ] 4.2 如本 change 属于核心领域模型变化，按项目文档规则在 `docs/方案变更历史` 下记录本次 taxonomy 字段落库方案演进。
- [ ] 4.3 运行 `openspec validate add-exercise-execution-taxonomy --strict`。
- [ ] 4.4 运行 taxonomy / Prisma migration / 共享类型相关测试。
- [ ] 4.5 运行 `npm run typecheck`。
- [ ] 4.6 最终 diff 检查，确认没有新增数据回填脚本、LLM 数据补齐脚本、服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` runtime 分支、`searchExerciseResources` tool 合同迁移、LangChain runtime 主循环改动、provider payload 改动、production response adapter 主流程改动或 `/api/chat` 主链路改动。
