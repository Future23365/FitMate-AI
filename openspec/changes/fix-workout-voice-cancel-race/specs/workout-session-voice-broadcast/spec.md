## MODIFIED Requirements

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
