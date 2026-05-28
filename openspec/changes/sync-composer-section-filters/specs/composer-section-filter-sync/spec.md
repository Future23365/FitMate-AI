## ADDED Requirements

### Requirement: 动作编排页右侧动作库支持全部阶段入口
动作编排页右侧动作库 SHALL 提供“全部、热身、训练、拉伸”四个阶段入口，并且默认选中“全部”。

#### Scenario: 用户打开动作编排页
- **WHEN** 用户打开动作编排页
- **THEN** 右侧动作库 MUST 展示“全部、热身、训练、拉伸”四个阶段入口
- **AND** 默认选中的阶段入口 MUST 是“全部”

#### Scenario: 用户选择全部阶段
- **WHEN** 用户选择“全部”阶段入口
- **THEN** 系统 MUST 请求 `/api/exercises`
- **AND** 请求 MUST NOT 携带 `workoutSection`
- **AND** 右侧动作库 MUST 展示不按阶段限制的动作结果

### Requirement: 阶段入口使用明确的接口参数语义
动作编排页右侧动作库 SHALL 仅在用户选择热身、训练或拉伸时向 `/api/exercises` 发送 `workoutSection`，并且接口 MUST NOT 使用 `all` 表达全部阶段。

#### Scenario: 用户选择热身阶段
- **WHEN** 用户选择“热身”阶段入口
- **THEN** 系统 MUST 使用 `workoutSection=warmup` 请求 `/api/exercises`
- **AND** 右侧动作库 MUST 展示热身阶段过滤后的动作

#### Scenario: 用户选择训练阶段
- **WHEN** 用户选择“训练”阶段入口
- **THEN** 系统 MUST 使用 `workoutSection=training` 请求 `/api/exercises`
- **AND** 右侧动作库 MUST 展示训练阶段过滤后的动作

#### Scenario: 用户选择拉伸阶段
- **WHEN** 用户选择“拉伸”阶段入口
- **THEN** 系统 MUST 使用 `workoutSection=stretch` 请求 `/api/exercises`
- **AND** 右侧动作库 MUST 展示拉伸阶段过滤后的动作

#### Scenario: 接口收到非法阶段参数
- **WHEN** `/api/exercises` 收到 `workoutSection=all` 或其他非 `warmup`、`training`、`stretch` 的值
- **THEN** 系统 MUST 返回参数校验失败

### Requirement: 热身训练拉伸阶段推断规则明确且可测试
动作库阶段筛选 SHALL 使用服务端阶段推断规则在分页前过滤动作，并且规则 MUST 保持拉伸优先、热身其次、训练兜底。

#### Scenario: 动作命中拉伸关键词
- **WHEN** 动作的分类、名称或目标标签命中拉伸、伸展、放松、stretch、stretching 或 mobility
- **THEN** 系统 MUST 将该动作归入 `stretch`

#### Scenario: 动作命中热身关键词
- **WHEN** 动作的分类、名称或目标标签命中热身、激活、动态、warmup、warm-up、activation、dynamic、有氧、cardio、开合跳、jumping jack、跑步、running、步行、walk、跳绳、rope、单车、bike 或 treadmill
- **THEN** 系统 MUST 将该动作归入 `warmup`

#### Scenario: 动作同时命中拉伸和热身关键词
- **WHEN** 动作同时命中拉伸关键词和热身关键词
- **THEN** 系统 MUST 优先将该动作归入 `stretch`

#### Scenario: 动作未命中阶段关键词
- **WHEN** 动作未命中拉伸或热身关键词
- **THEN** 系统 MUST 将该动作归入 `training`

### Requirement: 下方筛选选项与当前阶段同步
动作编排页右侧动作库 SHALL 基于当前阶段范围展示分类、肌群、器械、难度和居家条件选项，避免用户选择与当前阶段互相冲突的辅助筛选。

#### Scenario: 当前阶段为全部
- **WHEN** 当前阶段入口为“全部”
- **THEN** 分类、肌群、器械、难度和居家条件选项 MUST 来自全部动作范围

#### Scenario: 当前阶段为热身训练或拉伸
- **WHEN** 当前阶段入口为“热身”、“训练”或“拉伸”
- **THEN** 分类、肌群、器械、难度和居家条件选项 MUST 来自该阶段过滤后的动作范围
- **AND** 下方筛选选项 MUST NOT 展示该阶段范围内不存在的值

#### Scenario: 阶段筛选变化后保留有效辅助筛选
- **WHEN** 用户从一个阶段切换到另一个阶段
- **AND** 当前已选择的分类、肌群、器械、难度或居家条件在新阶段范围内仍然存在
- **THEN** 系统 MUST 保留该筛选值

#### Scenario: 阶段筛选变化后清除失效辅助筛选
- **WHEN** 用户从一个阶段切换到另一个阶段
- **AND** 当前已选择的分类、肌群、器械、难度或居家条件在新阶段范围内不存在
- **THEN** 系统 MUST 自动清除该筛选值
- **AND** 后续动作库请求 MUST NOT 携带已清除的筛选参数

### Requirement: 阶段筛选不改变动作添加位置
动作编排页右侧动作库阶段筛选 SHALL 只影响动作查找结果，不得直接改变中间编排区当前添加阶段。

#### Scenario: 用户切换右侧动作库阶段入口
- **WHEN** 用户点击“全部”、“热身”、“训练”或“拉伸”阶段入口
- **THEN** 系统 MUST NOT 因该筛选直接改变中间编排区当前添加阶段

#### Scenario: 用户从右侧动作库添加动作
- **WHEN** 用户从右侧动作库点击添加动作
- **THEN** 系统 MUST 将动作添加到中间编排区当前选中的添加阶段
- **AND** 系统 MUST NOT 使用右侧动作库阶段筛选作为动作落点

### Requirement: 清空筛选保留阶段入口
动作编排页右侧动作库的清空筛选动作 SHALL 清空搜索词和所有下方辅助筛选，并保留当前阶段入口。

#### Scenario: 用户点击清空筛选
- **WHEN** 用户点击右侧动作库的清空筛选按钮
- **THEN** 系统 MUST 清空搜索词、分类、肌群、器械、难度和居家条件
- **AND** 当前选中的“全部”、“热身”、“训练”或“拉伸”阶段入口 MUST 保持不变
