## MODIFIED Requirements

### Requirement: Voice broadcast toggle and local preference
系统 SHALL 在训练执行页复用顶部音量按钮作为语音播报开关，并在本地持久化用户选择，同时确保开关视觉状态不伪装成已成功播放，并为需要用户注意的语音状态提供醒目、可操作的提示。

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

### Requirement: Voice playback state and activation
系统 SHALL 在训练执行页维护可观察的语音播放状态，区分用户本地偏好、浏览器能力、页面音频激活状态和当前播报任务状态，并通过醒目的状态提示帮助用户恢复语音播报。

#### Scenario: Preference is enabled after refresh
- **WHEN** the user opens `/training` after previously enabling voice broadcast locally
- **THEN** the system MUST restore the enabled preference from `localStorage`
- **AND** the system MUST mark voice broadcast as waiting for page activation until a valid user gesture starts a real speech attempt
- **AND** the system MUST NOT show voice broadcast as actively speaking before speech playback is confirmed
- **AND** the workout session page MUST show a visible activation prompt that is stronger than a small icon color change

#### Scenario: User gesture activates voice playback
- **WHEN** voice broadcast is enabled and the user performs a valid training page gesture such as clicking the voice button, pressing a key, clicking pause, or clicking skip
- **THEN** the system MUST attempt to speak the current workout step in the same user gesture flow
- **AND** the system MUST update playback state from the resulting speech events or fallback timeout

#### Scenario: Speech playback fails
- **WHEN** a speech attempt emits an error or does not start within the supported fallback window
- **THEN** the system MUST mark voice playback as failed or requiring activation
- **AND** the system MUST keep workout timers and controls usable
- **AND** the system MUST provide a prominent user-visible retry state and development diagnostic log

#### Scenario: Stale speech event arrives
- **WHEN** a canceled speech job later emits `onend` or `onerror`
- **THEN** the system MUST ignore that event and MUST NOT advance the current workout step or preparation countdown
