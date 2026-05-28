## Why

动作编排页右侧动作库当前把动作分类作为横向筛选，和用户在编排阶段中的“添加到热身、训练、拉伸”决策不一致；同时缺少居家条件筛选，用户在编排居家训练时需要额外浏览不相关动作。

这次变更把右侧动作库筛选改成更贴合编排流程的结构：横向只用于选择加入阶段，筛选维度统一放到下拉框中。

## What Changes

- 在动作编排页右侧动作库筛选区增加 `homeRequirement` 居家条件筛选。
- 将当前横向 `category` 筛选改为下拉框选择，和肌群、器械、难度筛选保持一致。
- 将横向筛选区域改为热身、训练、拉伸三个阶段入口，用于决定从动作库添加动作时的目标 section。
- 保持现有动作库查询 API 和 facets 结构，不新增后端 API 契约。
- 不改变动作编排保存、训练循环、动作执行参数和训练时间线逻辑。

## Capabilities

### New Capabilities

- `composer-library-filters`: 定义动作编排页右侧动作库的阶段选择和筛选交互，包括阶段横向入口、分类下拉筛选和居家条件筛选。

### Modified Capabilities

- 无。

## Impact

- 主要影响 `features/workouts/components/action-composer-page.tsx` 的右侧动作库筛选 UI、筛选状态和查询参数。
- 复用现有 `ExerciseFacets.homeRequirements`、`homeRequirement` 查询参数和 `/api/exercises` 能力。
- 可能需要补充前端组件级或服务层查询测试，验证动作编排页会带上新增筛选参数，并且阶段选择仍影响新增动作的 section。
