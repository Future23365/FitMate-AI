## MODIFIED Requirements

### Requirement: Browser speech synthesis behavior
系统 SHALL use browser Web Speech API speech synthesis for spoken prompts, confirm playback state from speech events, degrade gracefully when unsupported or blocked, and provide an isolated self-check path on the `/training` page for diagnosing browser speech synthesis availability.

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

#### Scenario: User runs voice self-check
- **WHEN** the user clicks the voice self-check control on `/training`
- **THEN** the system MUST directly attempt one minimal Web Speech utterance in that click flow
- **AND** the self-check MUST NOT call the workout voice scheduler
- **AND** the self-check MUST NOT change training started, paused, active step, preparation countdown, or voice preference state
- **AND** the self-check result MUST show whether speech synthesis is unsupported, started, ended, errored, or blocked by timeout
- **AND** development logs MUST include voice count, selected voice, lifecycle events, and failure reason under a distinct diagnostic prefix

#### Scenario: Voice self-check is blocked
- **WHEN** the self-check calls `speechSynthesis.speak()` but no `onstart` or `onend` event arrives within the configured start timeout
- **THEN** the system MUST mark the result as blocked
- **AND** the workout session MUST remain usable
- **AND** the formal voice broadcast state MUST remain unchanged
