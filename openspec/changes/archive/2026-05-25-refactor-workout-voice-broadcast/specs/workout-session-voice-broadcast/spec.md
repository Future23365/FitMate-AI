## ADDED Requirements

### Requirement: Voice playback state and activation
系统 SHALL 在训练执行页维护可观察的语音播放状态，区分用户本地偏好、浏览器能力、页面音频激活状态和当前播报任务状态。

#### Scenario: Preference is enabled after refresh
- **WHEN** the user opens `/training` after previously enabling voice broadcast locally
- **THEN** the system MUST restore the enabled preference from `localStorage`
- **AND** the system MUST mark voice broadcast as waiting for page activation until a valid user gesture starts a real speech attempt
- **AND** the system MUST NOT show voice broadcast as actively speaking before speech playback is confirmed

#### Scenario: User gesture activates voice playback
- **WHEN** voice broadcast is enabled and the user performs a valid training page gesture such as clicking the voice button, pressing a key, clicking pause, or clicking skip
- **THEN** the system MUST attempt to speak the current workout step in the same user gesture flow
- **AND** the system MUST update playback state from the resulting speech events or fallback timeout

#### Scenario: Speech playback fails
- **WHEN** a speech attempt emits an error or does not start within the supported fallback window
- **THEN** the system MUST mark voice playback as failed or requiring activation
- **AND** the system MUST keep workout timers and controls usable
- **AND** the system MUST provide a user-visible retry state or development diagnostic log

#### Scenario: Stale speech event arrives
- **WHEN** a canceled speech job later emits `onend` or `onerror`
- **THEN** the system MUST ignore that event and MUST NOT advance the current workout step or preparation countdown

## MODIFIED Requirements

### Requirement: Voice broadcast toggle and local preference
系统 SHALL 在训练执行页复用顶部音量按钮作为语音播报开关，并在本地持久化用户选择，同时确保开关视觉状态不伪装成已成功播放。

#### Scenario: First training session visit
- **WHEN** no local voice broadcast preference exists and the user opens `/training`
- **THEN** voice broadcast is disabled by default
- **AND** the workout session page shows a lightweight tip with a small arrow pointing to the top volume button that tells the user they can enable sound there
- **AND** the system records locally that the voice broadcast tip has been shown

#### Scenario: User returns after seeing voice broadcast tip
- **WHEN** the voice broadcast tip has already been shown locally and the user opens `/training`
- **THEN** the workout session page MUST NOT automatically show the voice broadcast tip again

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

#### Scenario: Local storage is unavailable
- **WHEN** `localStorage` cannot be read or written
- **THEN** the system MUST keep the current page session usable and fall back to in-memory toggle state

### Requirement: Exercise preparation voice sequence
The system SHALL use a preparation voice countdown before each exercise step starts timing, and SHALL handle enabled, disabled, failed, and refresh-restored voice states consistently.

#### Scenario: First exercise starts with voice enabled and activated
- **WHEN** `/training` loads a workout timeline and voice broadcast is enabled and activated
- **THEN** the system announces the first action name and target amount
- **AND** the system waits until that action prompt finishes before announcing “3，2，1，开始” and starting the workout timer

#### Scenario: First exercise starts after refresh with voice preference enabled
- **WHEN** `/training` loads a workout timeline and local voice preference is enabled but the page is not yet activated
- **THEN** the system MUST show that voice activation is required
- **AND** the system MUST attempt the current action preparation prompt on the next valid user gesture
- **AND** the system MUST NOT silently skip the action preparation prompt while showing voice as active

#### Scenario: Exercise step starts with voice disabled
- **WHEN** `/training` loads a workout timeline and voice broadcast is disabled
- **THEN** the system still waits for the preparation countdown before starting the workout timer without speaking prompts

#### Scenario: Exercise preparation speech fails
- **WHEN** the action preparation prompt cannot start or fails before completion
- **THEN** the system MUST mark the voice state as failed or requiring activation
- **AND** the system MUST continue into the visual preparation countdown without blocking the workout indefinitely

#### Scenario: Later exercise step begins
- **WHEN** the active timeline moves to a later exercise step after a rest or skip
- **THEN** the system announces the action name and target amount when voice broadcast is enabled and activated
- **AND** the system waits until that action prompt finishes before announcing “3，2，1，开始” and starting that exercise step timer

#### Scenario: Rest step begins
- **WHEN** the active timeline moves to a rest step
- **THEN** the system starts the rest timer without an exercise preparation countdown

### Requirement: Step transition voice cues
The system SHALL announce relevant workout step transitions using existing workout timeline data and SHALL cancel or ignore stale cues when the active step changes.

#### Scenario: Exercise step begins
- **WHEN** the active timeline step changes to an exercise step and voice broadcast is enabled and activated
- **THEN** the system announces the exercise name, set index, total sets, and target duration or repetition count

#### Scenario: Rest step begins
- **WHEN** the active timeline step changes to a rest step and voice broadcast is enabled and activated
- **THEN** the system announces the rest label, rest duration, and next action when a next action exists

#### Scenario: Next group begins
- **WHEN** a rest step leads to another set or next exercise and voice broadcast is enabled and activated
- **THEN** the system announces “下一组动作” with the next action name when applicable

#### Scenario: User skips to another step
- **WHEN** the user clicks previous, next, skip, or selects an action from the session list
- **THEN** the system cancels pending speech and rhythm cues
- **AND** the system announces the newly active step if voice broadcast is enabled and activated
- **AND** stale speech callbacks from the previous step MUST NOT update preparation or active step state

### Requirement: Timed exercise beep cues
The system SHALL play short local “嘟” beep cues every second during timed exercise steps when voice broadcast is enabled and the page audio session is activated.

#### Scenario: Timed exercise is active
- **WHEN** an active exercise step uses duration mode and voice broadcast is enabled and activated
- **THEN** the system plays one short beep cue for each elapsed second of the timed action without changing the workout timer

#### Scenario: Voice preference is enabled but audio is not activated
- **WHEN** an active exercise step uses duration mode and local voice preference is enabled but page audio is not activated
- **THEN** the system MUST NOT mark beep cues as active
- **AND** the system MUST allow the next valid user gesture to activate speech and beep cues

#### Scenario: Timed exercise is paused or skipped
- **WHEN** the user pauses training, skips to another step, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system stops pending timed-action beep cues

#### Scenario: Timed beep sound is unavailable
- **WHEN** the browser cannot create or play the local beep sound
- **THEN** the system MUST continue the workout timer and voice broadcast without blocking the session
- **AND** the system MUST keep speech prompts independent from beep failures

### Requirement: Repetition counting voice cues
The system SHALL announce numeric counting cues for repetition-based exercise steps when voice broadcast is enabled and activated.

#### Scenario: Repetition exercise is active
- **WHEN** an active exercise step uses reps mode and voice broadcast is enabled and activated
- **THEN** the system announces numeric counts such as “1，2，3...” according to the workout repetition interval until the target repetition count is reached

#### Scenario: Repetition count advances
- **WHEN** the calculated completed repetition count increases
- **THEN** the system announces only the newly reached count and MUST NOT replay previous counts for the same step

#### Scenario: Repetition exercise is paused or skipped
- **WHEN** the user pauses training, skips to another step, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system stops pending repetition counting cues

#### Scenario: Repetition speech job is stale
- **WHEN** a repetition count speech job belongs to a previous step or previous job id
- **THEN** the system MUST NOT speak that count or update current playback state from it

### Requirement: Browser speech synthesis behavior
The system SHALL use browser Web Speech API speech synthesis for spoken prompts, confirm playback state from speech events, and degrade gracefully when unsupported or blocked.

#### Scenario: Speech synthesis is supported
- **WHEN** `window.speechSynthesis` and `SpeechSynthesisUtterance` are available
- **THEN** the system speaks Chinese workout prompts using a Chinese language setting when possible
- **AND** the system observes `SpeechSynthesisUtterance` lifecycle events to update playback state

#### Scenario: Speech synthesis is unsupported
- **WHEN** speech synthesis APIs are unavailable
- **THEN** the system MUST keep all workout controls, timers, and visual guidance working without throwing user-facing errors
- **AND** the voice button MUST communicate that voice broadcast is unavailable

#### Scenario: Speech synthesis is blocked or errors
- **WHEN** `speechSynthesis.speak()` fails to start, emits `onerror`, or remains blocked by browser policy
- **THEN** the system MUST keep the workout session usable
- **AND** the system MUST expose a retryable voice state instead of silently showing voice as active

#### Scenario: User pauses or ends training
- **WHEN** the user pauses training, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system cancels pending speech and rhythm cues
