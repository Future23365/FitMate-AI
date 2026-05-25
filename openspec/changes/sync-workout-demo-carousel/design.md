## Context

动作库 `Exercise` 已经有 `imageUrls`，详情页也支持多图自动播放；但训练动作 `WorkoutItem` 只保存单张 `imageUrl`。训练执行页当前已经有完整的 `activeStep`、`remainingSeconds`、`isPaused`、`isPreparing` 和语音播报 hook，适合把动作示范轮播绑定到同一套状态，而不是另起独立定时器。

## Goals / Non-Goals

**Goals:**

- 让训练动作保留动作库里的完整示范图列表。
- 训练页在每个动作步骤内自动循环全部示范图片。
- 轮播节奏与当前步骤倒计时一致，暂停时停止推进，跳步时重置到新动作第一张。
- 对旧数据和缺图动作保持可用降级。

**Non-Goals:**

- 不修改 AI 训练计划生成 prompt 或输出结构。
- 不新增数据库迁移或服务端 TTS。
- 不改变训练时间估算、语音播报文案和动作切换规则。

## Decisions

1. 在 `WorkoutItem` 增加可选 `imageUrls`，由 `normalizeWorkoutItem()` 统一补齐。

   原因：现有数据只依赖 `imageUrl`，直接改成必填数组会影响旧本地数据、历史训练和已有接口响应。用可选字段并在归一化层补齐，可以让 UI 和后续逻辑只读取规范后的 `imageUrls`。

   取舍：保留 `imageUrl` 会有少量重复数据，但兼容成本更低，也不需要迁移旧 localStorage 或 API 数据。

2. 从动作库创建或保存训练动作时同步写入完整 `imageUrls`。

   原因：训练页不应该在执行时再按 `exerciseId` 额外请求动作库，否则跳步、离线缓存和历史训练会变复杂。动作被编排或保存时就固化示范图列表，符合当前 `WorkoutItem` 自包含的模式。

   取舍：如果动作库图片未来更新，已保存训练不会自动更新；这是当前训练数据快照模型的自然结果。

3. 训练页用派生函数根据 `activeStep`、`remainingSeconds` 和 `isPaused` 计算当前图片，而不是新增图片轮播状态。

   原因：`remainingSeconds` 已经是训练计时和语音播报的共同节奏来源。图片索引从 `durationSeconds - remainingSeconds` 派生，可以避免独立定时器在暂停、跳步、准备倒计时中漂移。

   取舍：轮播粒度以秒为单位，不做更平滑的毫秒级动画；这与当前训练计时和语音节奏一致。

## Risks / Trade-offs

- 旧数据没有 `imageUrls` -> `normalizeWorkoutItem()` 使用 `imageUrl` 自动补齐，训练页继续可用。
- 个别动作只有一张图 -> 轮播固定显示单张图，不显示错误状态。
- 图片 URL 为空或占位图 -> 继续使用现有占位插画降级。
- 多图切换可能造成布局抖动 -> 使用固定容器、`object-contain` 和稳定尺寸，避免影响训练计时区。
