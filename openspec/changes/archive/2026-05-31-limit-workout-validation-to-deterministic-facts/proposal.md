## Why

最新日志显示，用户要求“30分钟，练这个”时，系统已经正确解析为基于上一批动作生成单次 routine，但服务端因为 `Knee_Circles`、`Wrist_Circles` 不允许进入 `warmup` 阶段而拒绝草稿。此类阶段归属属于训练语义判断，服务端用粗粒度规则硬编码反而会拦截合理编排。

本 change 重新划定 AI 与服务端职责：LLM 负责动作编排语义，服务端只硬校验确定性事实和安全边界。

## What Changes

- 调整 routine / plan 草稿校验边界：服务端硬校验只覆盖动作 ID、候选集合、Schema、必要结构、权限隔离、器械/伤病限制、时长和训练量等确定性事实。
- 取消或降级 `section_exercise_mismatch` 这类动作阶段语义硬失败；对于动态活动、灵活性、拉伸、激活动作是否适合 `warmup` 或 `stretch`，默认接受 LLM 编排结果。
- 保留可观测性：当服务端发现动作阶段与本地推导元数据不一致时，可以记录 warning 和 trace 诊断，但不得阻止合理草稿展示或保存。
- 更新自动修复与失败恢复策略，避免因为非确定性语义分歧进入“计划生成失败”。
- 补充回归测试，覆盖 `Knee_Circles`、`Wrist_Circles` 这类动态关节活动可进入 `warmup` 的场景。

## Capabilities

### New Capabilities

- `workout-validation-boundary`: 定义训练草稿服务端校验只负责确定性事实，训练语义编排由 LLM 决定的职责边界。

### Modified Capabilities

- `chat-routine-composition`: 调整 routine 草稿服务端校验要求，明确 section 语义不再作为硬阻断。
- `workout-generation-validation-recovery`: 调整校验失败恢复分类，非确定性 section 语义分歧不应进入终止型失败。

## Impact

- 影响服务端训练草稿校验与恢复逻辑：`lib/server/workout-plans/workout-plan-validation-service.ts`、`lib/server/workout-plans/workout-plan-validation-recovery-service.ts`。
- 影响候选动作元数据使用方式：`allowedSections` 可继续用于候选筛选、提示词和 trace 诊断，但不能作为唯一硬失败依据拦截 AI section 选择。
- 影响相关测试：`tests/workout-plan-validation.test.ts`、`tests/ai-workout-plan-service.test.ts` 以及必要的聊天 routine 回归测试。
- 不改变外部 API 路径、聊天流事件格式、数据库结构或前端卡片 payload 结构。
