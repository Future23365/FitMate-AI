## ADDED Requirements

### Requirement: Training session voice broadcast scope
The system SHALL provide voice broadcast only on the `/training` workout session page.

#### Scenario: User enters training session
- **WHEN** a user opens `/training`
- **THEN** the workout session page exposes voice broadcast behavior through the existing top volume button

#### Scenario: User opens non-session workout pages
- **WHEN** a user opens `/plans` or `/composer`
- **THEN** the system MUST NOT start voice broadcast or render additional voice broadcast controls for those pages

### Requirement: Voice broadcast toggle and local preference
The system SHALL reuse the top volume button on the workout session page as the voice broadcast toggle and persist the user's choice locally.

#### Scenario: First training session visit
- **WHEN** no local voice broadcast preference exists and the user opens `/training`
- **THEN** voice broadcast is enabled by default

#### Scenario: User disables voice broadcast
- **WHEN** the user clicks the top volume button while voice broadcast is enabled
- **THEN** the system disables voice broadcast, cancels pending speech and countdown sound, and stores the disabled preference in `localStorage`

#### Scenario: User returns after disabling voice broadcast
- **WHEN** the user opens `/training` after previously disabling voice broadcast locally
- **THEN** voice broadcast remains disabled until the user turns it on again

#### Scenario: Local storage is unavailable
- **WHEN** `localStorage` cannot be read or written
- **THEN** the system MUST keep the current page session usable and fall back to in-memory toggle state

### Requirement: Startup voice sequence
The system SHALL automatically announce the workout overview and start countdown when voice broadcast is enabled for a training session.

#### Scenario: Training session starts with voice enabled
- **WHEN** `/training` loads a workout timeline and voice broadcast is enabled
- **THEN** the system announces the planned workout actions and then announces “3，2，1开始”

#### Scenario: Workout has many actions
- **WHEN** the workout contains more actions than are reasonable to announce in full
- **THEN** the system announces a concise action overview and total action count instead of reading an excessively long list

#### Scenario: User manually changes step after startup
- **WHEN** the user jumps to another step after the startup sequence has already run
- **THEN** the system MUST NOT replay the full workout overview and MUST only announce the current step context

### Requirement: Step transition voice cues
The system SHALL announce relevant workout step transitions using existing workout timeline data.

#### Scenario: Exercise step begins
- **WHEN** the active timeline step changes to an exercise step
- **THEN** the system announces the exercise name, set index, total sets, and target duration or repetition count

#### Scenario: Rest step begins
- **WHEN** the active timeline step changes to a rest step
- **THEN** the system announces the rest label, rest duration, and next action when a next action exists

#### Scenario: Next group begins
- **WHEN** a rest step leads to another set or next exercise
- **THEN** the system announces “下一组动作” with the next action name when applicable

#### Scenario: User skips to another step
- **WHEN** the user clicks previous, next, skip, or selects an action from the session list
- **THEN** the system cancels pending speech and announces the newly active step if voice broadcast is enabled

### Requirement: Countdown sound cues
The system SHALL play short local “嘟嘟声” countdown cues during key countdown moments when voice broadcast is enabled.

#### Scenario: Countdown reaches final seconds
- **WHEN** an active timed, rep-derived, or rest step reaches the configured final countdown seconds
- **THEN** the system plays short beep cues without changing the workout timer

#### Scenario: Countdown sound is unavailable
- **WHEN** the browser cannot create or play the local countdown sound
- **THEN** the system MUST continue the workout timer and voice broadcast without blocking the session

#### Scenario: Voice broadcast is disabled during countdown
- **WHEN** the user disables voice broadcast while countdown cues are pending
- **THEN** the system stops pending countdown cues and does not play additional beeps until voice broadcast is enabled again

### Requirement: Browser speech synthesis behavior
The system SHALL use browser Web Speech API speech synthesis for spoken prompts and degrade gracefully when unsupported.

#### Scenario: Speech synthesis is supported
- **WHEN** `window.speechSynthesis` and `SpeechSynthesisUtterance` are available
- **THEN** the system speaks Chinese workout prompts using a Chinese language setting when possible

#### Scenario: Speech synthesis is unsupported
- **WHEN** speech synthesis APIs are unavailable
- **THEN** the system MUST keep all workout controls, timers, and visual guidance working without throwing user-facing errors

#### Scenario: User pauses or ends training
- **WHEN** the user pauses training, finishes training, disables voice broadcast, or leaves `/training`
- **THEN** the system cancels pending speech and countdown cues

### Requirement: No AI or server-side audio
The system SHALL NOT use AI services, speech recognition, microphone input, or server-side audio persistence for workout session voice broadcast.

#### Scenario: Voice broadcast runs
- **WHEN** voice broadcast announces workout steps or plays countdown cues
- **THEN** the system MUST NOT call AI endpoints, request microphone permissions, create speech recognition sessions, or persist audio state on the server
