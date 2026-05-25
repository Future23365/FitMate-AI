## MODIFIED Requirements

### Requirement: Voice broadcast toggle and local preference
系统 SHALL 在训练执行页复用顶部音量按钮作为语音播报开关，并在本地持久化用户选择，同时确保开关视觉状态不伪装成已成功播放，且语音激活入口必须是明确的开始或语音控制。

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

#### Scenario: User starts training with voice preference enabled
- **WHEN** the user clicks the training start button while local voice broadcast preference is enabled
- **THEN** the system MUST attempt silent audio unlock and current step broadcast within that start click flow
- **AND** the system MUST NOT require a separate pause, skip, list selection, or arbitrary page gesture to restore voice
- **AND** the system MUST NOT show a “刷新后需要点击一次恢复播报” style prompt
- **AND** the system MUST NOT speak the activation template such as “语音播报已开启”

#### Scenario: User disables voice broadcast
- **WHEN** the user clicks the top volume button while voice broadcast is enabled, activating, waiting for activation, speaking, or failed
- **THEN** the system disables voice broadcast, cancels pending speech and rhythm cues, clears current voice job state, and stores the disabled preference in `localStorage`

#### Scenario: User returns after disabling voice broadcast
- **WHEN** the user opens `/training` after previously disabling voice broadcast locally
- **THEN** voice broadcast remains disabled until the user turns it on again

#### Scenario: Local storage is unavailable
- **WHEN** `localStorage` cannot be read or written
- **THEN** the system MUST keep the current page session usable and fall back to in-memory toggle state

### Requirement: Exercise preparation voice sequence
系统 SHALL use a scheduled preparation voice sequence after the user explicitly starts training and before each exercise step starts timing, and SHALL ensure action preparation speech, preparation countdown cues, silent fallback, and failed voice states are ordered by the voice scheduler rather than competing speech effects.

#### Scenario: First exercise starts with voice enabled and activated
- **WHEN** the user clicks the training start button for a loaded workout timeline and voice broadcast is enabled and activated
- **THEN** the system announces the first action name and target amount as a high priority preparation cue
- **AND** repetition count cues, timed beep cues, and countdown cues MUST NOT interrupt that action preparation cue
- **AND** the system waits until the preparation cue finishes or reaches the configured fallback completion before announcing “3，2，1，开始” and starting the workout timer

#### Scenario: User enters training session with voice preference enabled
- **WHEN** `/training` loads a workout timeline and local voice preference is enabled but the user has not clicked start
- **THEN** the system MUST keep the workout in待开始状态
- **AND** the system MUST NOT automatically attempt action preparation speech
- **AND** the system MUST NOT show a restore voice prompt that asks the user to click another training control

#### Scenario: Exercise step starts with voice disabled
- **WHEN** the user clicks the training start button and voice broadcast is disabled
- **THEN** the system still waits for the configured silent preparation path before starting the workout timer without speaking prompts

#### Scenario: Exercise preparation speech fails
- **WHEN** the action preparation prompt cannot start or fails before completion
- **THEN** the system MUST mark the voice state as failed or requiring activation
- **AND** the system MUST continue into the visual preparation countdown after the configured silent fallback wait
- **AND** the workout MUST NOT remain indefinitely in the preparation state

#### Scenario: Later exercise step begins
- **WHEN** the active timeline moves to a later exercise step after a rest or skip and training has started
- **THEN** the system announces the action name and target amount when voice broadcast is enabled and activated
- **AND** the scheduler MUST treat the later exercise preparation cue as belonging to the current step key
- **AND** queued cues from the previous step MUST NOT interrupt or complete the later exercise preparation sequence
- **AND** the system waits until that action prompt finishes before announcing “3，2，1，开始” and starting that exercise step timer

#### Scenario: Rest step begins
- **WHEN** the active timeline moves to a rest step after training has started
- **THEN** the system starts the rest timer without an exercise preparation countdown
- **AND** any queued preparation cues from the previous exercise step MUST be canceled or discarded

### Requirement: Voice playback state and activation
系统 SHALL 在训练执行页维护可观察的语音播放状态，区分用户本地偏好、浏览器能力、页面音频激活状态、当前调度任务状态和失败状态，并把语音激活限制在明确的开始按钮和语音按钮交互中。

#### Scenario: Preference is enabled after refresh
- **WHEN** the user opens `/training` after previously enabling voice broadcast locally
- **THEN** the system MUST restore the enabled preference from `localStorage`
- **AND** the system MUST keep the workout session in待开始状态 until the user clicks start
- **AND** the system MUST NOT show voice broadcast as actively speaking before speech playback is confirmed
- **AND** the workout session page MUST NOT show a prompt that asks the user to click arbitrary training controls to restore voice

#### Scenario: Start button activates voice playback
- **WHEN** voice broadcast is enabled and the user clicks the training start button
- **THEN** the system MUST submit an activation event to the voice scheduler in the same user gesture flow
- **AND** the scheduler MUST attempt to speak the current workout step cue without letting immediate repetition or countdown cues cancel it
- **AND** the scheduler MUST reserve the configured activation cue for the top voice button enable action
- **AND** the system MUST update playback state from the resulting speech events or configured fallback timeout

#### Scenario: Voice button activates or retries voice playback
- **WHEN** voice broadcast is disabled, waiting for activation, or failed and the user clicks the top voice button
- **THEN** the system MUST use that click as the activation or retry gesture
- **AND** the system MUST NOT require the user to click pause, skip, next, previous, or a list item to recover voice

#### Scenario: Training control does not restore voice
- **WHEN** voice broadcast preference is enabled but speech has not been activated and the user clicks pause, continue, previous, next, skip rest, or a workout list item
- **THEN** the system MUST perform only the requested training control action
- **AND** the system MUST NOT show a restore voice prompt caused by that training control action

#### Scenario: Speech playback fails
- **WHEN** a speech attempt emits an error or does not start within the supported fallback window
- **THEN** the system MUST mark voice playback as failed or requiring activation
- **AND** the system MUST keep workout timers and controls usable
- **AND** the system MUST provide retry through the voice button and development diagnostic log

#### Scenario: Speech call never starts
- **WHEN** `speechSynthesis.speak()` is called but no `onstart` or `onend` event arrives within the configured speech start timeout
- **THEN** the system MUST mark the speech attempt as `speech_blocked`
- **AND** the system MUST NOT mark voice broadcast as activated solely from fallback timeouts or Web Audio beep availability
- **AND** the system MUST expose development diagnostics that show the speech request, voice count, selected voice, and blocked state

#### Scenario: Stale speech event arrives
- **WHEN** a canceled speech job later emits `onend` or `onerror`
- **THEN** the system MUST ignore that event and MUST NOT advance the current workout step or preparation countdown
- **AND** the scheduler MUST record or expose the stale event only as development diagnostic information
