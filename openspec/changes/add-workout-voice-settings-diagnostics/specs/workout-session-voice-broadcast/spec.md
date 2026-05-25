## MODIFIED Requirements

### Requirement: Training session voice broadcast scope
The system SHALL provide voice broadcast only on the `/training` workout session page, and SHALL expose voice settings only from that workout session page.

#### Scenario: User enters training session
- **WHEN** a user opens `/training`
- **THEN** the workout session page exposes voice broadcast behavior through the existing top volume button
- **AND** the workout session page exposes a voice settings button next to the top volume button

#### Scenario: User opens non-session workout pages
- **WHEN** a user opens `/plans` or `/composer`
- **THEN** the system MUST NOT start voice broadcast or render additional voice broadcast controls for those pages

### Requirement: Voice broadcast toggle and local preference
系统 SHALL 在训练执行页复用顶部音量按钮作为语音播报开关，并在本地持久化用户选择，同时确保开关视觉状态不伪装成已成功播放，并为需要用户注意的语音状态提供醒目、可操作的提示。系统 SHALL 将语音配置和全流程自检收拢到顶部语音设置弹窗，而不是在训练控制区常驻展示自检面板。

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
- **AND** the system MUST immediately attempt to speak the current workout step within that click flow
- **AND** the system MUST show active voice state only after playback is confirmed or clearly show that activation is still required
- **AND** later visits to `/training` keep voice broadcast preference enabled until the user turns it off again

#### Scenario: User disables voice broadcast
- **WHEN** the user clicks the top volume button while voice broadcast is enabled, activating, waiting for activation, speaking, or failed
- **THEN** the system disables voice broadcast, cancels pending speech and rhythm cues, clears current voice job state, and stores the disabled preference in `localStorage`

#### Scenario: User returns after disabling voice broadcast
- **WHEN** the user opens `/training` after previously disabling voice broadcast locally
- **THEN** voice broadcast remains disabled until the user turns it on again

#### Scenario: Voice requires activation or retry
- **WHEN** voice broadcast preference is enabled but the page is waiting for activation or the last playback attempt failed
- **THEN** the workout session page MUST show an obvious retry or activation prompt
- **AND** the prompt MUST include an actionable control or clear direction that lets the user trigger voice activation
- **AND** the prompt MUST be visually stronger than passive helper text

#### Scenario: Local storage is unavailable
- **WHEN** `localStorage` cannot be read or written
- **THEN** the system MUST keep the current page session usable and fall back to in-memory toggle state

#### Scenario: User runs voice diagnostics
- **WHEN** the user wants to inspect voice diagnostics during training
- **THEN** the user MUST use the top voice settings dialog
- **AND** the training control panel MUST NOT render the legacy embedded self-check panel
