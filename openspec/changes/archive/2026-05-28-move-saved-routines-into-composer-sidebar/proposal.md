## Why

动作编排页当前把“已保存编排”放在顶部下拉中，而右侧栏只承载动作库。用户在编排时需要在“添加新动作”和“切换已有编排”之间频繁来回，两个入口分散会增加视线和操作跳转。

## What Changes

- 将动作编排页顶部的“已保存”下拉入口移到右侧栏。
- 右侧栏顶部提供“动作库 / 已保存”切换。
- “动作库”视图保留现有搜索、筛选、详情和添加动作能力。
- “已保存”视图以纵向卡片列表展示已保存编排，并支持打开、复制、删除。
- 空状态仍提供保存当前编排入口。
- 不改变训练编排保存 API、数据模型、动作库查询参数或动作详情抽屉。

## Capabilities

### New Capabilities

### Modified Capabilities
- `composer-workbench-layout`: 已保存编排从顶部下拉入口调整为右侧栏内的可切换卡片列表。

## Impact

- 影响 `features/workouts/components/action-composer-page.tsx` 的顶部工具区和右侧素材栏布局。
- 不涉及 API、Prisma Schema、AI 编排、持久化结构或依赖变更。
