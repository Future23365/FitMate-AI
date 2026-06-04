## Context

最新 trace 暴露的问题不是模型不知道“胸部训练”是什么，而是模型没有看到当前 `searchExerciseResources` 可执行的完整数据库 facet 合同。现有 manifest 只对 `level`、`equipment`、`homeRequirement` 等少数字段写了手工摘要，对 `muscle`、`category`、`force`、`mechanic`、`goalTag`、`riskTag` 没有完整可用值列表；同时 `bodyRegions` 让服务端把高层身体区域确定性展开为肌群，形成了一个非数据库 facet 的语义层。

本 change 属于 Agent tool 执行合同和模型可见合同变更。实现时必须遵守 Agent 边界：Planner 负责从用户目标和 `facetCatalog` 中选择结构化 facet；服务端只校验 schema、权限、发布态、数据库存在性和 where 条件，不根据用户原文、关键词、正则、同义词表或短句模板替模型决定查询语义。

## Goals / Non-Goals

**Goals:**

- 从 `searchExerciseResources` 中删除 `bodyRegions`，不再让服务端承担高层区域语义展开。
- 将所有支持查询的数据库 facet 完整暴露给 Planner，形成模型可见 `facetCatalog`。
- 支持 `muscles: string[]`，让 Planner 可以一次提交多个真实肌群 facet。
- 保持 `searchExerciseResources` 为只读发布态动作事实查询 tool，不生成 routine、plan、patch、prescription、schedule、训练卡片、保存结果或用户记忆。
- 增加 tool-level、manifest/model input、projection、production chat 和 architecture boundary 测试，确保没有新增服务端语义分流。

**Non-Goals:**

- 不新增自然语言目标到 facet 的服务端映射表。
- 不在 prompt 或 manifest 中写“练胸必须查哪些肌群”这类固定语义映射表。
- 不新增 `purpose`、`candidateUse`、`resultRequirements`、`rankingHints`、`limit`、`page`、`pageSize` 等消费侧或分页字段。
- 不改 `/api/chat` 主链路、Agent runtime 主循环、`PlannerPort`、`Policy Guard`、`ResourceStore`、`Resource Contract Validator` 或 Response Renderer。
- 不引入向量检索、全表读取后内存过滤或旧 `searchExercises` 候选集合路径。

## Decisions

### 1. 删除 `bodyRegions`，不保留 alias 或兼容入口

`bodyRegions` 表达的是高层自然语言区域，不是数据库原生 facet。它虽然是受控 enum，但仍要求服务端维护“区域 -> 肌群”的语义展开规则。本 change 将其从 `searchExerciseResources` 的 input schema、manifest、examples、model observation、user projection、trace summary 和 repository query 中删除。

取舍：保留 `bodyRegions` 可以继续支持“上肢 / 下肢”这类宽泛输入，但会让服务端长期承担语义映射。删除后，模型必须基于 `facetCatalog.muscles` 自主选择一个或多个真实肌群，边界更清晰。

### 2. 新增 `muscles: string[]` 作为多个真实肌群 facet 的 OR 查询

现有 `muscle: string` 只能表达单个真实肌群。为避免 Planner 在“背部、手臂、臀腿、胸部协同训练”等目标下只能选一个 facet，本 change 新增 `muscles: string[]`。服务端执行时只把 `muscle` 和 `muscles` 合并、去重，并在数据库 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles`、`secondaryMusclesZh` 中做 OR 条件。

`muscle` 的处理建议：

- 可以保留为单个肌群便捷字段，但模型可见说明必须推荐多肌群目标使用 `muscles`。
- 如果同时传入 `muscle` 和 `muscles`，服务端只做确定性合并去重，不根据用户原文调整含义。
- 两个字段都只能使用 `facetCatalog.muscles` 中真实出现的数据库 facet。

### 3. `facetCatalog` 必须完整来自数据库事实

模型可见 `facetCatalog` 应在 production registry 构造或 model input builder 阶段注入到 `searchExerciseResources` manifest / schema description / tool metadata 的模型可见区域。它必须来自当前发布态动作库的 distinct facet，而不是手写常量。

必须完整暴露的 facet：

- `muscles`: 合并 `primaryMuscles`、`primaryMusclesZh`、`secondaryMuscles`、`secondaryMusclesZh`
- `categories`: 合并 `category`、`categoryZh`
- `levels`: 合并 `level`、`levelZh`
- `forces`: 合并 `force`、`forceZh`
- `mechanics`: 合并 `mechanic`、`mechanicZh`
- `equipment`: 合并 `equipment`、`equipmentZh`
- `homeRequirements`: 合并 `homeRequirement`、`homeRequirementZh`
- `goalTags`: 合并 `goalTags`
- `riskTags`: 合并 `riskTags`
- `suitabilities`: 来自 `allowedSections`

本 change 明确不按“大集合 / 小集合”裁剪；只过滤空值、去重，并使用确定性排序，保证 trace、测试和回放稳定。可以附带 `facetCatalogHash`、`source`、`publishedOnly` 或 `generatedAt` 等诊断字段，但这些字段不得替代完整 facet 列表。

### 4. Manifest 只说明字段语义，不写自然语言映射表

manifest / schema description / examples 应告诉模型：

- `facetCatalog` 是当前可执行查询词表。
- `muscle` / `muscles` 只接受真实肌群 facet。
- `category`、`force`、`mechanic`、`equipment`、`homeRequirement`、`goalTag`、`riskTag` 等字段只接受对应 catalog 中的值。
- Planner 可根据用户目标选择单个或多个 facet，候选不足时也可以自主重查、澄清或输出当前事实可支撑的结构。

manifest 不应写成“用户说练胸时必须查询 X、Y、Z”。这是模型语义推理，不是服务端合同。

### 5. Facet catalog 的可见位置

实现可以选择以下任一稳定路径，但必须有测试证明模型实际可见：

- 作为 `searchExerciseResources` manifest 的模型可见 metadata，例如 `facetCatalog`。
- 作为 `searchExerciseResources` input schema description 的结构化摘要。
- 作为 model input 的 tool-specific context，与 tool manifest 同步传入。

无论采用哪种实现，trace 中的 `registry_snapshot` 或 model request 必须能看到完整 `facetCatalog`，否则不能算完成。

## Risks / Trade-offs

- [Risk] 完整 facet catalog 增加 prompt token。Mitigation：本 change 以正确性为优先，完整暴露所有支持查询的数据库 facet；只做去重、空值过滤和确定性排序，不做大小集合裁剪。
- [Risk] 删除 `bodyRegions` 可能降低模型对宽泛表达的稳定性。Mitigation：通过完整 `facetCatalog.muscles` 和 `muscles[]` 让模型自行选择多个真实肌群；服务端不再承担语义展开。
- [Risk] 实现时不小心把 `facetCatalog` 写成手工表。Mitigation：测试必须 mock 数据库 distinct facet，并断言 manifest/model input 随数据变化。
- [Risk] 旧 tests、docs 或 examples 仍引用 `bodyRegions`。Mitigation：tasks 中包含全局残留检查和对应测试更新。
- [Risk] `muscle` 与 `muscles` 共存造成语义重复。Mitigation：schema description 明确两者都是数据库真实肌群，handler 只做合并去重；如实现选择直接废弃 `muscle`，必须在 spec 和 tests 中同步删除旧字段。

## Migration Plan

本 change 不涉及数据迁移或 API 响应格式迁移。实现建议按以下顺序：

1. 新增数据库 facet catalog 查询能力，覆盖发布态动作库所有可查询 facet。
2. 将 `facetCatalog` 注入 Planner 实际可见的 `searchExerciseResources` manifest 或等价 model input。
3. 更新 `searchExerciseResources` input schema：新增 `muscles`，删除 `bodyRegions`。
4. 更新 repository where 构造：删除 `bodyRegions` 展开，使用 `muscle + muscles` 的真实 facet OR 查询。
5. 更新 manifest、schema descriptions、examples、model/user/trace projection。
6. 更新 tests，并用 `rg` 检查 `bodyRegions` 在本 tool 合同中无残留。

如需回滚，应整体恢复 `bodyRegions` input 和展开逻辑；不得只恢复 manifest 文案而不恢复 schema / repository / tests。

## Open Questions

无。
