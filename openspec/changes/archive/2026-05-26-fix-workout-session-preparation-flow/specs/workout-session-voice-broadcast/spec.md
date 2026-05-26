## ADDED Requirements

### Requirement: Voice follows workout execution state
系统 SHALL 让训练语音播报跟随 `/training` 页面训练执行状态。语音 hook 和语音 session MAY 管理 Web Speech 播放、cue 队列、去重、取消和失败状态，但 MUST NOT 自行拥有或重建动作步骤是否可以开始计时的训练状态事实。

#### Scenario: Voice hook receives preparation state
- **WHEN** 页面层把当前训练状态传给语音 hook
- **THEN** 语音 hook MUST 使用页面提供的明确状态判断应播报动作准备、准备倒计时、计次或 beep cue
- **AND** 语音 hook MUST NOT 仅通过 `preparationCountdown > 0` 推导当前动作是否处于准备中

#### Scenario: Voice scheduler completes preparation cue
- **WHEN** 当前动作准备 cue 播放完成
- **THEN** 语音 scheduler MAY 通知页面当前 cue 已结束
- **AND** 该通知 MUST 带有当前步骤 key
- **AND** 页面 MUST 只在步骤 key 仍匹配当前步骤时处理该通知

#### Scenario: Voice cue is canceled by pause
- **WHEN** 用户暂停训练导致当前语音 cue 被取消
- **THEN** 语音 session MUST 停止或取消当前 Web Speech 任务
- **AND** 取消语音 MUST NOT 把已经运行中的动作步骤退回准备状态
- **AND** 取消语音 MUST NOT 阻止页面在继续后恢复对应训练状态

#### Scenario: Voice cue is stale after step change
- **WHEN** 旧步骤的语音 cue 在步骤切换后触发 `onend`、`onerror` 或 fallback 回调
- **THEN** 语音 session 或页面层 MUST 忽略该旧步骤回调对当前训练状态的影响
- **AND** 当前步骤的动作计时、准备倒计时或休息倒计时 MUST NOT 被旧语音回调覆盖

#### Scenario: Speech synthesis fails during preparation
- **WHEN** Web Speech 不支持、被浏览器阻止、播放失败或没有按预期触发生命周期事件
- **THEN** 语音状态 MUST 进入可诊断的失败或不可用状态
- **AND** 页面训练状态 MUST 继续通过静默兜底路径推进
- **AND** 当前训练 MUST NOT 因语音失败而卡在“准备开始”

#### Scenario: Voice disabled during preparation
- **WHEN** 用户在动作准备或准备倒计时期间关闭语音播报
- **THEN** 系统 MUST 取消当前语音 cue 和后续语音 cue
- **AND** 页面训练状态 MUST 继续按无语音路径推进准备倒计时和动作计时

### Requirement: Voice diagnostics do not alter workout flow
系统 SHALL 保持语音诊断、自检和开发日志只用于排障，不得改变当前训练执行状态、当前步骤、剩余时间或准备阶段。

#### Scenario: Diagnostics run while session is active
- **WHEN** 用户在训练执行中打开语音设置并运行自检
- **THEN** 自检 MAY 播放测试语音和测试 beep
- **AND** 自检 MUST NOT 更新当前动作准备状态
- **AND** 自检 MUST NOT 推进、暂停、重置或完成当前训练步骤

#### Scenario: Development diagnostics record voice events
- **WHEN** 语音 scheduler 发生 cue 调度、取消、失败、超时或 stale event
- **THEN** 开发日志 SHOULD 记录足够排查的信息
- **AND** 这些日志 MUST NOT 成为训练状态转换的输入
