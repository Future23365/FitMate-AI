# composer-section-filter-sync Specification

## Purpose
TBD - created by archiving change sync-composer-section-filters. Update Purpose after archive.
## Requirements
### Requirement: 动作编排页右侧动作库支持用途适配入口
动作编排页右侧动作库 SHALL 提供“全部、适合热身、适合主训练、适合拉伸”四个用途适配入口，并且默认选中“全部”。

#### Scenario: 用户打开动作编排页
- **WHEN** 用户打开动作编排页
- **THEN** 右侧动作库 MUST 展示“全部、适合热身、适合主训练、适合拉伸”四个用途适配入口
- **AND** 默认选中的入口 MUST 是“全部”

#### Scenario: 用户选择全部
- **WHEN** 用户选择“全部”入口
- **THEN** 系统 MUST 请求 `/api/exercises`
- **AND** 请求 MUST NOT 携带 `suitability`
- **AND** 右侧动作库 MUST 展示不按用途限制的动作结果

### Requirement: 用途适配入口使用明确的接口参数语义
动作编排页右侧动作库 SHALL 仅在用户选择适合热身、适合主训练或适合拉伸时向 `/api/exercises` 发送 `suitability`，并且接口 MUST NOT 使用 `all` 表达全部范围。

#### Scenario: 用户选择适合热身
- **WHEN** 用户选择“适合热身”入口
- **THEN** 系统 MUST 使用 `suitability=warmup` 请求 `/api/exercises`
- **AND** 右侧动作库 MUST 展示适合热身的动作

#### Scenario: 用户选择适合主训练
- **WHEN** 用户选择“适合主训练”入口
- **THEN** 系统 MUST 使用 `suitability=training` 请求 `/api/exercises`
- **AND** 右侧动作库 MUST 展示适合主训练的动作

#### Scenario: 用户选择适合拉伸
- **WHEN** 用户选择“适合拉伸”入口
- **THEN** 系统 MUST 使用 `suitability=stretch` 请求 `/api/exercises`
- **AND** 右侧动作库 MUST 展示适合拉伸的动作

#### Scenario: 接口收到非法用途参数
- **WHEN** `/api/exercises` 收到 `suitability=all` 或其他非 `warmup`、`training`、`stretch` 的值
- **THEN** 系统 MUST 返回参数校验失败

### Requirement: 服务端派生非互斥用途适配结果
动作库用途筛选 SHALL 使用服务端派生的 suitability 结果在分页前过滤动作，并且 suitability MUST 支持一个动作同时适合多个用途。

#### Scenario: 动作命中拉伸适配信号
- **WHEN** 动作的分类、名称或目标标签命中拉伸、伸展、放松、stretch、stretching 或 mobility
- **THEN** 系统 MUST 将该动作标记为适合拉伸

#### Scenario: 动作命中热身适配信号
- **WHEN** 动作具备动态、激活、低到中等强度有氧或低风险活动度信号
- **THEN** 系统 MUST 将该动作标记为适合热身

#### Scenario: 动作命中主训练适配信号
- **WHEN** 动作具备力量训练、有氧训练、增强式训练、力量举、奥林匹克举重、大力士训练或其他主训练信号
- **THEN** 系统 MUST 将该动作标记为适合主训练

#### Scenario: 动作适合多个用途
- **WHEN** 动作同时具备多个用途的适配信号
- **THEN** 系统 MUST 允许该动作同时出现在多个用途筛选结果中

#### Scenario: 高风险或高负荷动作不轻易进入热身
- **WHEN** 动作具备高风险、高负荷、奥林匹克举重、大力士训练或高冲击信号
- **THEN** 系统 MUST NOT 仅因该动作可训练就将其标记为适合热身

### Requirement: 下方筛选选项与当前用途同步
动作编排页右侧动作库 SHALL 基于当前用途范围展示分类、肌群、器械、难度和居家条件选项，避免用户选择与当前用途互相冲突的辅助筛选。

#### Scenario: 当前入口为全部
- **WHEN** 当前入口为“全部”
- **THEN** 分类、肌群、器械、难度和居家条件选项 MUST 来自全部动作范围

#### Scenario: 当前入口为某个用途
- **WHEN** 当前入口为“适合热身”、“适合主训练”或“适合拉伸”
- **THEN** 分类、肌群、器械、难度和居家条件选项 MUST 来自该用途过滤后的动作范围
- **AND** 下方筛选选项 MUST NOT 展示该用途范围内不存在的值

#### Scenario: 用途筛选变化后保留有效辅助筛选
- **WHEN** 用户从一个用途入口切换到另一个用途入口
- **AND** 当前已选择的分类、肌群、器械、难度或居家条件在新用途范围内仍然存在
- **THEN** 系统 MUST 保留该筛选值

#### Scenario: 用途筛选变化后清除失效辅助筛选
- **WHEN** 用户从一个用途入口切换到另一个用途入口
- **AND** 当前已选择的分类、肌群、器械、难度或居家条件在新用途范围内不存在
- **THEN** 系统 MUST 自动清除该筛选值
- **AND** 后续动作库请求 MUST NOT 携带已清除的筛选参数

### Requirement: 用途筛选不改变动作添加位置
动作编排页右侧动作库用途筛选 SHALL 只影响动作查找结果，不得直接改变中间编排区当前添加阶段。

#### Scenario: 用户切换右侧动作库用途入口
- **WHEN** 用户点击“全部”、“适合热身”、“适合主训练”或“适合拉伸”入口
- **THEN** 系统 MUST NOT 因该筛选直接改变中间编排区当前添加阶段

#### Scenario: 用户从右侧动作库添加动作
- **WHEN** 用户从右侧动作库点击添加动作
- **THEN** 系统 MUST 将动作添加到中间编排区当前选中的添加阶段
- **AND** 系统 MUST NOT 使用右侧动作库用途筛选作为动作落点

### Requirement: 清空筛选保留用途入口
动作编排页右侧动作库的清空筛选动作 SHALL 清空搜索词和所有下方辅助筛选，并保留当前用途入口。

#### Scenario: 用户点击清空筛选
- **WHEN** 用户点击右侧动作库的清空筛选按钮
- **THEN** 系统 MUST 清空搜索词、分类、肌群、器械、难度和居家条件
- **AND** 当前选中的“全部”、“适合热身”、“适合主训练”或“适合拉伸”入口 MUST 保持不变

