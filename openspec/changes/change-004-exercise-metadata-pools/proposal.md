## Why

当前动作召回主要依赖相关性和基础字段，无法稳定判断动作能否放入热身、主训练或拉伸阶段，也缺少替代、降阶、进阶和风险边界。训练计划和 Patch 都需要动作候选先按阶段、角色、难度、器械和风险分池，否则容易出现主训练动作进入热身、拉伸动作进入主训练或替代动作不合理的问题。

## What Changes

- 为动作库补齐 `allowedSections`、`intensityRole`、`movementPattern`、`difficulty`、`riskTags`、`contraindications`、`regressionExerciseIds`、`progressionExerciseIds` 和 `substitutionGroupId` 等元数据。
- 新增 Exercise Retrieval Service 的分池输出，按 warmup、training、stretch、regression、progression 和 substitution 返回候选。
- 替代动作选择优先使用 substitution group、降阶/进阶关系和运动模式，而不是只按同肌群召回。
- Validator 使用动作元数据校验 section 合法性、器械、难度、风险和用户限制。
- 候选不足时返回明确原因，不允许模型编造动作或把不合法动作硬塞进计划。

## Capabilities

### New Capabilities
- `exercise-metadata-pools`: 定义动作元数据、分池检索、替代动作优先级和 section 合法性校验要求。

### Modified Capabilities
- `workout-data-model`: 动作库需要承载训练阶段、角色、风险和替代关系等结构化字段。
- `workout-patch`: Patch 替代动作必须来自合法候选池。

## Impact

- 影响 Prisma `Exercise` 模型或等价动作元数据结构、seed 数据、动作检索服务和训练校验逻辑。
- 影响 routine、plan、Patch 和动作推荐的候选构建链路。
- 需要补充动作元数据 seed、分池检索、替代动作排序和非法 section 拒绝测试。
