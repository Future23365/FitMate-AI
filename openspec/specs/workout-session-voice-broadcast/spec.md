# workout-session-voice-broadcast Specification

## Purpose
Define the `/training` workout session voice broadcast behavior, including the local voice toggle, exercise preparation sequence, timed-action beep cues, repetition counting cues, and Web Speech API degradation rules.
## Requirements
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

### Requirement: Step transition voice cues
系统 SHALL announce relevant workout step transitions using existing workout timeline data through the voice scheduler, and SHALL cancel or ignore stale cues when the active step changes.

#### Scenario: Exercise step begins
- **WHEN** the active timeline step changes to an exercise step and voice broadcast is enabled and activated
- **THEN** the system schedules the exercise name, set index, total sets, and target duration or repetition count as a step introduction or preparation cue according to configuration
- **AND** low priority repetition cues MUST NOT cancel this step introduction cue

#### Scenario: Rest step begins
- **WHEN** the active timeline step changes to a rest step and voice broadcast is enabled and activated
- **THEN** the system announces the rest label, rest duration, and next action when a next action exists
- **AND** the rest cue MUST be associated with the current rest step key

#### Scenario: Next group begins
- **WHEN** a rest step leads to another set or next exercise and voice broadcast is enabled and activated
- **THEN** the system announces “下一组动作” with the next action name when applicable
- **AND** the scheduler MUST preserve the ordering between the next group cue and the following preparation countdown

#### Scenario: User skips to another step
- **WHEN** the user clicks previous, next, skip, or selects an action from the session list
- **THEN** the system cancels pending speech and rhythm cues for the previous step
- **AND** the system announces the newly active step if voice broadcast is enabled and activated
- **AND** stale speech callbacks from the previous step MUST NOT update preparation or active step state
- **AND** low priority queued cues from the previous step MUST be discarded

### Requirement: Timed exercise beep cues
系统 SHALL play short local “嘟” beep cues every configured interval during timed exercise steps when voice broadcast is enabled and the page audio session is activated, while keeping beep scheduling independent from speech playback state.

#### Scenario: Timed exercise is active
- **WHEN** an active exercise step uses duration mode and voice broadcast is enabled and activated
- **THEN** the system plays short beep cues according to the configured beep interval without changing the workout timer
- **AND** beep cues MUST NOT cancel, replace, or complete speech cues

#### Scenario: Voice preference is enabled but audio is not activated
- **WHEN** an active exercise step uses duration mode and local voice preference is enabled but page audio is not activated
- **THEN** the system MUST NOT mark beep cues as active
- **AND** the system MUST allow the next valid user gesture to activate speech and beep cues

#### Scenario: Timed exercise is paused or skipped
- **WHEN** the user pauses training, skips to another step, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system stops pending timed-action beep cues
- **AND** the system MUST NOT report speech playback as active solely because beep playback is available

#### Scenario: Timed beep sound is unavailable
- **WHEN** the browser cannot create or play the local beep sound
- **THEN** the system MUST continue the workout timer and voice broadcast without blocking the session
- **AND** the system MUST keep speech prompts independent from beep failures

### Requirement: Repetition counting voice cues
系统 SHALL announce numeric counting cues for repetition-based exercise steps through the voice scheduler when voice broadcast is enabled and activated.

#### Scenario: Repetition exercise is active
- **WHEN** an active exercise step uses reps mode and voice broadcast is enabled and activated
- **THEN** the system announces numeric counts such as “1，2，3...” according to the configured repetition interval until the target repetition count is reached
- **AND** repetition count cues MUST NOT interrupt active action preparation, step introduction, activation, or preparation countdown cues by default

#### Scenario: Repetition count advances
- **WHEN** the calculated completed repetition count increases
- **THEN** the system announces only the newly reached count according to configured deduplication and staleness rules
- **AND** the system MUST NOT replay previous counts for the same step

#### Scenario: Repetition exercise is paused or skipped
- **WHEN** the user pauses training, skips to another step, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system stops pending repetition counting cues
- **AND** queued repetition cues for the previous step MUST be discarded

#### Scenario: Repetition speech job is stale
- **WHEN** a repetition count speech job belongs to a previous step, previous job id, expired cue, or canceled scheduler session
- **THEN** the system MUST NOT speak that count or update current playback state from it

### Requirement: Browser speech synthesis behavior
系统 SHALL use browser Web Speech API speech synthesis for spoken prompts, confirm playback state from speech events, degrade gracefully when unsupported or blocked, and avoid canceling newly queued utterances during normal speech startup.

#### Scenario: Speech synthesis is supported
- **WHEN** `window.speechSynthesis` and `SpeechSynthesisUtterance` are available
- **THEN** the system speaks Chinese workout prompts using a Chinese language setting when possible
- **AND** the system observes `SpeechSynthesisUtterance` lifecycle events to update playback state
- **AND** the system MUST NOT call `speechSynthesis.cancel()` immediately before every normal `speechSynthesis.speak()` attempt

#### Scenario: Speech synthesis is unsupported
- **WHEN** speech synthesis APIs are unavailable
- **THEN** the system MUST keep all workout controls, timers, and visual guidance working without throwing user-facing errors
- **AND** the voice button MUST communicate that voice broadcast is unavailable

#### Scenario: Speech synthesis is blocked or errors
- **WHEN** `speechSynthesis.speak()` fails to start, emits `onerror`, or remains blocked by browser policy
- **THEN** the system MUST keep the workout session usable
- **AND** the system MUST expose a retryable voice state instead of silently showing voice as active

#### Scenario: User pauses, changes step, disables voice, or ends training
- **WHEN** the user pauses training, switches steps, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system cancels pending speech and rhythm cues
- **AND** stale speech callbacks MUST NOT update current voice or preparation state

#### Scenario: User runs voice self-check
- **WHEN** the user clicks the voice self-check control on `/training`
- **THEN** the system MUST directly attempt one minimal Web Speech utterance in that click flow
- **AND** the self-check MUST NOT call the workout voice scheduler
- **AND** the self-check MUST NOT call `speechSynthesis.cancel()` before submitting its own utterance
- **AND** the self-check result MUST show whether speech synthesis is unsupported, started, ended, errored, or blocked by timeout
- **AND** development logs MUST include voice count, selected voice, lifecycle events, and failure reason under a distinct diagnostic prefix

#### Scenario: Voice self-check receives canceled
- **WHEN** self-check receives `SpeechSynthesisUtterance.onerror` with `error: "canceled"`
- **THEN** the result MUST expose that browser error
- **AND** the self-check implementation MUST NOT be the source of that cancellation through a same-flow pre-speak cancel call

### Requirement: No AI or server-side audio
The system SHALL NOT use AI services, speech recognition, microphone input, or server-side audio persistence for workout session voice broadcast.

#### Scenario: Voice broadcast runs
- **WHEN** voice broadcast announces workout steps or plays rhythm cues
- **THEN** the system MUST NOT call AI endpoints, request microphone permissions, create speech recognition sessions, or persist audio state on the server

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

