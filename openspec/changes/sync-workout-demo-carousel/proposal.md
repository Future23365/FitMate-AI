## Why

训练中页面的动作示范目前只显示单张 `imageUrl`，无法呈现动作库里已有的完整动作分解图。用户在计时训练时需要示范图和当前动作、语音播报、倒计时处于同一个节奏，否则看屏幕时会误以为示范与实际训练步骤脱节。

## What Changes

- 训练动作数据保留完整的 `imageUrls`，同时继续兼容现有单张 `imageUrl`。
- `/training` 动作示范区域根据当前训练步骤自动循环该动作的全部示范图片。
- 图片轮播与当前步骤计时同步：准备倒计时、动作计时、暂停、跳步和语音播报都以同一个 `activeStep` 状态为准。
- 休息步骤展示下一动作的示范图，帮助用户提前准备，但不改变休息计时和语音播报逻辑。
- 不改变训练计划生成规则、AI 编排、数据库结构或服务端 API 契约。

## Capabilities

### New Capabilities

- `workout-session-demo-carousel`: 覆盖训练中页面的多图动作示范展示、计时同步轮播、暂停/跳步状态同步和缺图降级。

### Modified Capabilities

- None.

## Impact

- 影响 `lib/shared/workouts/composition.ts` 和 `lib/shared/workouts/persistence-schema.ts` 的训练动作结构。
- 影响从动作库转换为训练动作的路径，包括 `features/workouts/components/action-composer-page.tsx`、`features/workout-plans/lib/saved-workout.ts` 和 `lib/server/workouts/workout-persistence-service.ts`。
- 影响 `features/workouts/components/workout-session-page.tsx` 的动作示范渲染。
- 不新增第三方依赖，不新增 AI 或服务端音频逻辑。
