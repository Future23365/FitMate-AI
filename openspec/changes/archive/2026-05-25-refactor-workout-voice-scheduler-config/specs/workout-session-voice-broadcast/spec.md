## MODIFIED Requirements

### Requirement: Exercise preparation voice sequence
系统 SHALL use a scheduled preparation voice sequence before each exercise step starts timing, and SHALL ensure action preparation speech, preparation countdown cues, silent fallback, and failed voice states are ordered by the voice scheduler rather than competing speech effects.

#### Scenario: First exercise starts with voice enabled and activated
- **WHEN** `/training` loads a workout timeline and voice broadcast is enabled and activated
- **THEN** the system announces the first action name and target amount as a high priority preparation cue
- **AND** repetition count cues, timed beep cues, and countdown cues MUST NOT interrupt that action preparation cue
- **AND** the system waits until the preparation cue finishes or reaches the configured fallback completion before announcing “3，2，1，开始” and starting the workout timer

#### Scenario: First exercise starts after refresh with voice preference enabled
- **WHEN** `/training` loads a workout timeline and local voice preference is enabled but the page is not yet activated
- **THEN** the system MUST show that voice activation is required
- **AND** the system MUST attempt the current action preparation prompt on the next valid user gesture through the scheduler
- **AND** the system MUST NOT silently skip the action preparation prompt while showing voice as active

#### Scenario: Exercise step starts with voice disabled
- **WHEN** `/training` loads a workout timeline and voice broadcast is disabled
- **THEN** the system still waits for the configured silent preparation path before starting the workout timer without speaking prompts

#### Scenario: Exercise preparation speech fails
- **WHEN** the action preparation prompt cannot start or fails before completion
- **THEN** the system MUST mark the voice state as failed or requiring activation
- **AND** the system MUST continue into the visual preparation countdown after the configured silent fallback wait
- **AND** the workout MUST NOT remain indefinitely in the preparation state

#### Scenario: Later exercise step begins
- **WHEN** the active timeline moves to a later exercise step after a rest or skip
- **THEN** the system announces the action name and target amount when voice broadcast is enabled and activated
- **AND** the scheduler MUST treat the later exercise preparation cue as belonging to the current step key
- **AND** queued cues from the previous step MUST NOT interrupt or complete the later exercise preparation sequence
- **AND** the system waits until that action prompt finishes before announcing “3，2，1，开始” and starting that exercise step timer

#### Scenario: Rest step begins
- **WHEN** the active timeline moves to a rest step
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
系统 SHALL use browser Web Speech API speech synthesis through a single scheduler-controlled adapter, confirm playback state from speech events and scheduler state, and degrade gracefully when unsupported or blocked.

#### Scenario: Speech synthesis is supported
- **WHEN** `window.speechSynthesis` and `SpeechSynthesisUtterance` are available
- **THEN** the system speaks Chinese workout prompts using the configured Chinese language and voice selection settings when possible
- **AND** the system observes `SpeechSynthesisUtterance` lifecycle events to update playback state
- **AND** every speech callback MUST be checked against the current scheduler job id and step key before mutating state

#### Scenario: Speech synthesis is unsupported
- **WHEN** speech synthesis APIs are unavailable
- **THEN** the system MUST keep all workout controls, timers, and visual guidance working without throwing user-facing errors
- **AND** the voice button MUST communicate that voice broadcast is unavailable
- **AND** the scheduler MUST route preparation flow through the configured silent fallback path

#### Scenario: Speech synthesis is blocked or errors
- **WHEN** `speechSynthesis.speak()` fails to start, emits `onerror`, or remains blocked by browser policy
- **THEN** the system MUST keep the workout session usable
- **AND** the system MUST expose a retryable voice state instead of silently showing voice as active
- **AND** the scheduler MUST continue or discard queued cues according to the configured fallback policy

#### Scenario: User pauses or ends training
- **WHEN** the user pauses training, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system cancels pending speech and rhythm cues
- **AND** active speech jobs MUST detach or ignore delayed `onend` and `onerror` callbacks

### Requirement: Voice playback state and activation
系统 SHALL 在训练执行页维护可观察的语音播放状态，区分用户本地偏好、浏览器能力、页面音频激活状态、当前调度任务状态和失败状态，并通过醒目的状态提示帮助用户恢复语音播报。

#### Scenario: Preference is enabled after refresh
- **WHEN** the user opens `/training` after previously enabling voice broadcast locally
- **THEN** the system MUST restore the enabled preference from `localStorage`
- **AND** the system MUST mark voice broadcast as waiting for page activation until a valid user gesture starts a real speech attempt
- **AND** the system MUST NOT show voice broadcast as actively speaking before speech playback is confirmed
- **AND** the workout session page MUST show a visible activation prompt that is stronger than a small icon color change

#### Scenario: User gesture activates voice playback
- **WHEN** voice broadcast is enabled and the user performs a valid training page gesture such as clicking the voice button, pressing a key, clicking pause, or clicking skip
- **THEN** the system MUST submit an activation event to the voice scheduler in the same user gesture flow
- **AND** the scheduler MUST attempt to speak the configured activation cue and current workout step cue without letting immediate repetition or countdown cues cancel them
- **AND** the system MUST update playback state from the resulting speech events or configured fallback timeout

#### Scenario: Speech playback fails
- **WHEN** a speech attempt emits an error or does not start within the supported fallback window
- **THEN** the system MUST mark voice playback as failed or requiring activation
- **AND** the system MUST keep workout timers and controls usable
- **AND** the system MUST provide a prominent user-visible retry state and development diagnostic log

#### Scenario: Stale speech event arrives
- **WHEN** a canceled speech job later emits `onend` or `onerror`
- **THEN** the system MUST ignore that event and MUST NOT advance the current workout step or preparation countdown
- **AND** the scheduler MUST record or expose the stale event only as development diagnostic information
