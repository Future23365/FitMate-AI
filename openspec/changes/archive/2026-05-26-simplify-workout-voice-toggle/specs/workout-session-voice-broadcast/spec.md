## MODIFIED Requirements

### Requirement: Voice broadcast toggle and local preference
系统 SHALL 在训练执行页复用顶部音量按钮作为语音播报开关，并在本地持久化用户选择，同时确保开关按钮只有打开语音和关闭语音两个用户可见功能。系统 SHALL 将语音配置和全流程自检收拢到顶部语音设置弹窗，而不是在训练控制区常驻展示自检面板。

#### Scenario: First training session visit
- **WHEN** no local voice broadcast preference exists and the user opens `/training`
- **THEN** voice broadcast is disabled by default
- **AND** the workout session page shows a prominent voice tip near the session controls or voice button that tells the user they can enable sound there
- **AND** the tip MUST provide a clear visual relationship to the top volume button without covering the primary workout timer
- **AND** the system records locally that the voice broadcast tip has been shown

#### Scenario: User returns after seeing voice broadcast tip
- **WHEN** the voice broadcast tip has already been shown locally and the user opens `/training`
- **THEN** the workout session page MUST NOT automatically show the first-visit voice broadcast tip again

#### Scenario: User enables voice broadcast
- **WHEN** the user clicks the top volume button while voice broadcast is disabled
- **THEN** the system stores the enabled preference in `localStorage`
- **AND** the system MAY speak the configured activation confirmation such as “语音播报已开启”
- **AND** the system MUST NOT announce the current workout step from this toggle action
- **AND** later visits to `/training` keep voice broadcast preference enabled until the user turns it off again

#### Scenario: User disables voice broadcast
- **WHEN** the user clicks the top volume button while voice broadcast is enabled, activating, waiting for activation, speaking, or failed
- **THEN** the system disables voice broadcast, cancels pending speech and rhythm cues, clears current voice job state, and stores the disabled preference in `localStorage`

#### Scenario: User returns after disabling voice broadcast
- **WHEN** the user opens `/training` after previously disabling voice broadcast locally
- **THEN** voice broadcast remains disabled until the user turns it on again

#### Scenario: User returns after enabling voice broadcast
- **WHEN** the user opens `/training` after previously enabling voice broadcast locally
- **THEN** the system restores the enabled preference from `localStorage`
- **AND** the top volume button MUST remain a close voice control rather than a retry or restore voice control
- **AND** the workout session page MUST NOT show a “重新点击恢复播报” style prompt

#### Scenario: Local storage is unavailable
- **WHEN** `localStorage` cannot be read or written
- **THEN** the system MUST keep the current page session usable and fall back to in-memory toggle state

#### Scenario: User runs voice diagnostics
- **WHEN** the user wants to inspect voice diagnostics during training
- **THEN** the user MUST use the top voice settings dialog
- **AND** the training control panel MUST NOT render the legacy embedded self-check panel

### Requirement: Voice playback state and activation
系统 SHALL 在训练执行页维护可观察的语音播放状态，区分用户本地偏好、浏览器能力、页面音频激活状态、当前调度任务状态和失败状态，并把当前步骤播报激活限制在明确的开始按钮交互中。顶部语音按钮 SHALL 只改变本地语音偏好。

#### Scenario: Preference is enabled after refresh
- **WHEN** the user opens `/training` after previously enabling voice broadcast locally
- **THEN** the system MUST restore the enabled preference from `localStorage`
- **AND** the system MUST keep the workout session in待开始状态 until the user clicks start
- **AND** the system MUST NOT show voice broadcast as actively speaking before speech playback is confirmed
- **AND** the workout session page MUST NOT show a prompt that asks the user to click arbitrary training controls or the voice button to restore voice

#### Scenario: Start button activates voice playback
- **WHEN** voice broadcast is enabled and the user clicks the training start button
- **THEN** the system MUST submit an activation event to the voice scheduler in the same user gesture flow
- **AND** the scheduler MUST attempt to speak the current workout step cue without letting immediate repetition or countdown cues cancel it
- **AND** the scheduler MUST reserve the configured activation cue for the top voice button enable action
- **AND** the system MUST update playback state from the resulting speech events or configured fallback timeout

#### Scenario: Voice button is not a retry control
- **WHEN** voice broadcast is enabled, waiting for activation, or failed and the user clicks the top voice button
- **THEN** the system MUST disable voice broadcast
- **AND** the system MUST NOT use that click to retry current step speech
- **AND** the system MUST NOT require the user to click pause, skip, next, previous, or a list item to recover voice

#### Scenario: Training control does not restore voice
- **WHEN** voice broadcast preference is enabled but speech has not been activated and the user clicks pause, continue, previous, next, skip rest, or a workout list item
- **THEN** the system MUST perform only the requested training control action
- **AND** the system MUST NOT show a restore voice prompt caused by that training control action

#### Scenario: Speech playback fails
- **WHEN** a speech attempt emits an error or does not start within the supported fallback window
- **THEN** the system MUST mark voice playback as failed or requiring activation
- **AND** the system MUST keep workout timers and controls usable
- **AND** the system MUST keep development diagnostic logs available for troubleshooting

#### Scenario: Speech call never starts
- **WHEN** `speechSynthesis.speak()` is called but no `onstart` or `onend` event arrives within the configured speech start timeout
- **THEN** the system MUST mark the speech attempt as `speech_blocked`
- **AND** the system MUST NOT mark voice broadcast as activated solely from fallback timeouts or Web Audio beep availability
- **AND** the system MUST expose development diagnostics that show the speech request, voice count, selected voice, and blocked state

#### Scenario: Stale speech event arrives
- **WHEN** a canceled speech job later emits `onend` or `onerror`
- **THEN** the system MUST ignore that event and MUST NOT advance the current workout step or preparation countdown
- **AND** the scheduler MUST record or expose the stale event only as development diagnostic information
