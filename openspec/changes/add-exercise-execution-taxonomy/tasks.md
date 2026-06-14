## 1. 变更边界与治理检查

- [ ] 1.1 完成架构解耦检查：确认本 change 只调整 `Exercise` 执行条件 taxonomy、动作查询 repository、`searchExerciseResources` tool 合同、投影、trace 和相关测试，不调整 LangChain runtime 主循环、provider payload、production response adapter 主流程或 `/api/chat` 主链路。
- [ ] 1.2 完成 Agent tool 变更治理检查：稳定 resource type 为 `Exercise`，能力族为 `query`，本次变更属于既有业务 tool 输入/输出合同调整，不新增自然语言路由、toolName 变体或 runtime 分支。
- [ ] 1.3 完成 Agent prompt/model-visible 合同检查：所有新增或修改的 tool description、schema description、examples、observation 和失败反馈使用中文说明业务规则，字段名、枚举值和 toolName 保持英文。
- [ ] 1.4 完成抽象层级门禁：确认没有新增用户原话触发规则、关键词规则、正则、同义词表、短句模板或 provider `tool_calls` 改写逻辑。
- [ ] 1.5 在实现前确认 `prefer-low-friction-exercise-candidates` 不与本 change 并行实施；本 change 以数据库 taxonomy 替代旧字段内部默认方向。

## 2. 数据库与 taxonomy

- [ ] 2.1 新增共享 execution taxonomy 模块，定义 `requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel`、`noiseLevel` 的受控取值、中文说明、排序关系和 Zod 校验。
- [ ] 2.2 更新 `Exercise` 共享类型和 DTO，加入 `requiresExternalEquipment`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexity`、`impactLevel`、`noiseLevel`，并为核心类型补充职责注释。
- [ ] 2.3 新增 Prisma migration，在 `Exercise` 上加入新 taxonomy 字段和必要索引；不删除旧 `equipment` / `equipmentZh`、`homeRequirement` / `homeRequirementZh`。
- [ ] 2.4 更新 seed / 导入流程，让新动作写入 execution taxonomy 字段，并通过共享 taxonomy 校验拒绝未知取值。
- [ ] 2.5 编写一次性回填脚本，把当前动作库旧字段映射到新 taxonomy；无法可靠确定的 `impactLevel`、`noiseLevel` 或细粒度字段保持 `null` / `unknown`。
- [ ] 2.6 回填脚本输出人工审查报告，重点列出 `equipmentZh = "自重"` 且 `homeRequirementZh = "健身房器械"`、`equipmentZh = "其他"`、`homeRequirementZh = "居家小器械"` 和 taxonomy 缺失动作。
- [ ] 2.7 增加数据质量测试，覆盖发布动作 taxonomy 合法性、旧字段到新字段映射、自重但需要 `gym_fixture` 的动作不会被误标为零准备动作。
- [ ] 2.8 确认没有新增 `isNoEquipment`、`isHomeFriendly`、`needsMat`、`requiresPartner`、`requiresGym`、`isLowFriction` 等派生冗余字段。

## 3. `searchExerciseResources` 输入合同迁移

- [ ] 3.1 更新 tool input schema，删除模型可见 `equipment` 和 `homeRequirement`，新增 `equipmentAvailability`、`requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevel`、`noiseLevel` 或等价新 taxonomy 输入字段。
- [ ] 3.2 更新 schema description 和 examples，使用新字段展示“无外部训练器械”“地面/瑜伽垫”“椅子/墙面”“健身房固定设施”“低冲击”“安静”等执行条件，不再展示旧字段写法。
- [ ] 3.3 确认 `q`、`bodyRegions`、`published` 仍不出现在模型可见 input schema、schema description 或 examples 中。
- [ ] 3.4 更新 schema 拒绝测试，覆盖模型传入旧 `equipment`、旧 `homeRequirement`、`published` 或未知 taxonomy 值时返回字段级 issue。
- [ ] 3.5 更新 production tool catalog / model-visible contract gate 测试，确认旧歧义字段不再作为 Planner 可传 input 出现。

## 4. Repository 查询与输出投影

- [ ] 4.1 更新 `searchExerciseResources` repository，将 `equipmentAvailability = "no_external_equipment"` 下推为 `requiresExternalEquipment = false`。
- [ ] 4.2 实现 `requiredEquipmentTags`、`supportRequirementTags`、`setupComplexityMax`、`impactLevel`、`noiseLevel` 到 Prisma `where` 的数据库下推查询。
- [ ] 4.3 确保 `equipmentAvailability = "no_external_equipment"` 不自动附加 `supportRequirementTags = ["none"]`，也不自动选择或排除 `floor_or_mat`、`chair_or_wall`、`gym_fixture`、`partner`、`outdoor_space`。
- [ ] 4.4 保持 `exerciseNames`、`requiredExerciseIds`、`excludeExerciseIds`、section hard filter policy、肌群合并查询和数量上限的既有行为。
- [ ] 4.5 更新 handler output 的动作摘要，加入 execution taxonomy 摘要；旧字段可保留在服务端内部或用户展示兼容路径，但不得进入模型可见动作执行条件事实。
- [ ] 4.6 更新 model observation，仅暴露显式查询 filters、`returnedCount`、`truncated`、zero-result 状态、必要 diagnostics 和新 taxonomy 动作摘要；不暴露旧字段或完整 `query.totalMatches`。
- [ ] 4.7 更新 trace summary，保留 `totalMatches`、taxonomy filters、duration 和 failureCode 等诊断信息，但不得记录完整 handler output、secret、跨用户 payload 或大 payload。

## 5. Tool 测试与回归验证

- [ ] 5.1 增加 `searchExerciseResources` handler / repository 测试，覆盖无外部训练器械、指定器械、地面/瑜伽垫、椅子/墙面、健身房固定设施、低冲击和安静查询。
- [ ] 5.2 增加组合条件测试，覆盖 `requiresExternalEquipment = false` 与 `supportRequirementTags = ["gym_fixture"]` 同时存在时不会被误判为家中零准备动作。
- [ ] 5.3 增加空结果测试，确认具体 taxonomy 筛选命中为空时输出结构稳定，模型可见 observation 收口为 zero-result 状态和必要 diagnostics。
- [ ] 5.4 增加模型可见 observation 测试，断言不包含 `equipment`、`equipmentZh`、`homeRequirement`、`homeRequirementZh` 和完整 `query.totalMatches`。
- [ ] 5.5 增加 examples / catalog 测试，断言 examples 只展示新 taxonomy 输入，不包含旧字段或固定自然语言短句规则。
- [ ] 5.6 增加 trace summary 测试，确认 trace 可诊断且脱敏，`totalMatches` 只保留在 trace / handler output，不进入模型可见 observation。

## 6. 文档与验证

- [ ] 6.1 更新 README、架构文档或动作数据维护文档中与 `Exercise` 字段、seed、回填和 tool 合同相关的说明。
- [ ] 6.2 如本 change 属于核心领域模型变化，按项目文档规则在 `docs/方案变更历史` 下记录本次 taxonomy 方案演进。
- [ ] 6.3 运行 `openspec validate add-exercise-execution-taxonomy --strict`。
- [ ] 6.4 运行 taxonomy / seed / Prisma 相关测试。
- [ ] 6.5 运行 `npm test -- tests/langchain-agent-tools/search-exercise-resources.test.ts` 或当前实际覆盖 `searchExerciseResources` 的测试文件。
- [ ] 6.6 运行 production tool catalog / model-visible contract gate 相关测试。
- [ ] 6.7 运行 `npm run typecheck`。
- [ ] 6.8 最终 diff 检查，确认没有新增服务端关键词规则、自然语言模板路由、phrasing 特判、具体业务 `toolName` runtime 分支、LangChain runtime 主循环改动、provider payload 改动、production response adapter 主流程改动或 `/api/chat` 主链路改动。
