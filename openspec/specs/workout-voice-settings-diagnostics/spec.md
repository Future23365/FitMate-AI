# workout-voice-settings-diagnostics Specification

## Purpose
TBD - created by archiving change add-workout-voice-settings-diagnostics. Update Purpose after archive.
## Requirements
### Requirement: Training voice settings dialog
系统 SHALL 在 `/training` 训练执行页提供语音设置弹窗，用于集中管理语音播报配置、自检和浏览器 API 兼容说明，并在弹窗打开时提供清晰的空间层级反馈。

#### Scenario: User opens voice settings
- **WHEN** 用户点击顶部语音开关左侧的设置按钮
- **THEN** 系统 MUST 打开语音设置弹窗
- **AND** 弹窗 MUST 不改变训练计时、暂停状态、当前步骤或语音开关状态
- **AND** 弹窗 MUST 使用进入动画呈现
- **AND** 主训练页面 MUST 出现向后缩的视觉效果

#### Scenario: User closes voice settings
- **WHEN** 用户点击关闭按钮或遮罩
- **THEN** 系统 MUST 关闭语音设置弹窗
- **AND** 已保存的本地语音配置 MUST 保留
- **AND** 主训练页面 MUST 恢复原始视觉状态

### Requirement: Local voice configuration
系统 SHALL 允许用户在语音设置弹窗中选择浏览器 voice，并调整本地语音播报配置。系统 MUST 优先展示中文 voice，降低用户在长 voice 列表中的选择成本。

#### Scenario: Browser voices are available
- **WHEN** 浏览器提供 `speechSynthesis.getVoices()` 结果
- **THEN** 弹窗 MUST 展示可选 voice 列表
- **AND** voice 列表 MUST 优先展示 `zh-CN` voice
- **AND** voice 列表 MUST 在 `zh-CN` 后展示其他中文 voice
- **AND** voice 列表 MUST 在中文 voice 后展示非中文 voice
- **AND** 用户选择的 voice MUST 用于后续训练语音播报和自检

#### Scenario: Browser voices are delayed
- **WHEN** `speechSynthesis.getVoices()` 初次返回空列表
- **THEN** 系统 MUST 继续监听 `voiceschanged`
- **AND** 弹窗 MUST 提供默认 voice 回退状态，而不是阻塞用户继续训练

#### Scenario: User changes speech parameters
- **WHEN** 用户调整语速、音量、音调或节奏音量
- **THEN** 系统 MUST 将配置保存到浏览器本地
- **AND** 后续语音播报和自检 MUST 使用更新后的配置

### Requirement: Full voice diagnostics
系统 SHALL 在语音设置弹窗中提供全流程自检，并可视化显示每个检测步骤的状态。系统 SHALL 在自检失败时根据 API 支持状态提供可执行恢复建议。

#### Scenario: User runs diagnostics
- **WHEN** 用户点击全流程自检按钮
- **THEN** 系统 MUST 执行浏览器能力、voice 加载、语音播放事件和 Web Audio 节奏音检测
- **AND** 弹窗 MUST 逐项展示每个检测步骤的状态、说明和关键详情

#### Scenario: Diagnostics succeeds
- **WHEN** 自检检测到语音请求启动并完成或确认已启动
- **THEN** 系统 MUST 将语音播放相关步骤显示为通过
- **AND** 系统 MUST 保留检测耗时、voice 数量和选中 voice 等关键详情

#### Scenario: Diagnostics fails
- **WHEN** 浏览器不支持、阻止播放、播放报错或 Web Audio 不可用
- **THEN** 系统 MUST 将对应步骤显示为失败或警告
- **AND** 系统 MUST 保持训练页面可用，不得中断训练计时或清空当前训练状态

#### Scenario: Diagnostics fails with supported runtime APIs
- **WHEN** 自检失败、阻止或超时
- **AND** 运行时检测显示相关浏览器 API 存在
- **THEN** 弹窗 MUST 提示用户可以尝试重启浏览器后再检测
- **AND** 提示 MUST 不替代具体失败步骤和失败原因

### Requirement: Browser API compatibility reference
系统 SHALL 在语音设置弹窗中展示训练语音能力使用到的浏览器 API 及其主要浏览器版本支持范围，并用彩色浏览器图标提高识别效率。

#### Scenario: User views compatibility
- **WHEN** 用户打开语音设置弹窗
- **THEN** 系统 MUST 展示 Web Speech API、`SpeechSynthesisUtterance`、`SpeechSynthesisVoice`、`voiceschanged` 和 Web Audio API 的用途
- **AND** 系统 MUST 展示 Chrome、Edge、Firefox、Safari 和 iOS Safari 的可运行版本参考
- **AND** 系统 MUST 为 Chrome、Edge、Firefox、Safari 和 iOS Safari 展示彩色浏览器图标
- **AND** 系统 MUST 明确实际可用性以当前浏览器运行时检测为准

