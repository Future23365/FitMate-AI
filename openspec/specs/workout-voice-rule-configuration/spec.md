# workout-voice-rule-configuration Specification

## Purpose
TBD - created by archiving change refactor-workout-voice-scheduler-config. Update Purpose after archive.
## Requirements
### Requirement: Voice broadcast rule configuration file
系统 SHALL 提供一个开发者可维护的训练语音播报配置文件，用于集中配置 `/training` 语音播报的文案模板、语音参数、队列策略、时间间隔和失败降级参数。

#### Scenario: Developer adjusts voice broadcast wording
- **WHEN** a developer updates the voice broadcast wording templates in the configuration file
- **THEN** the workout voice cue generation MUST use the updated templates without requiring changes to React components or speech scheduling code
- **AND** the templates MUST continue to receive structured workout timeline data instead of reading visible UI text

#### Scenario: Developer adjusts timing parameters
- **WHEN** a developer updates preparation countdown interval, repetition cue interval, beep interval, speech fallback timeout, or silent fallback wait duration in the configuration file
- **THEN** the workout voice scheduler MUST use those values for subsequent training sessions
- **AND** no direct edits to `useWorkoutVoiceBroadcast` or `WorkoutSessionPage` SHOULD be required for those rule changes

#### Scenario: Configuration has invalid numeric values
- **WHEN** the configuration file contains invalid timing, volume, rate, priority, queue length, or fallback values
- **THEN** the system MUST fail validation in development or tests
- **AND** the scheduler MUST NOT silently run with invalid rule values

### Requirement: Voice configuration type safety
系统 SHALL define strong TypeScript types for voice broadcast configuration and SHALL keep default configuration values explicit and reviewable.

#### Scenario: Configuration is imported by scheduler
- **WHEN** the voice scheduler imports the default voice configuration
- **THEN** TypeScript MUST verify the shape of cue templates, speech settings, beep settings, queue policy, fallback policy, and timing parameters
- **AND** missing required configuration fields MUST produce a compile-time error or dedicated configuration validation failure

#### Scenario: Configuration preserves browser-only boundary
- **WHEN** the voice configuration is used by the training page
- **THEN** the configuration MUST NOT introduce server-side audio calls, AI calls, microphone access, speech recognition, database writes, or arbitrary SQL capability
- **AND** the configuration MUST be a deterministic local rule source

### Requirement: Configurable cue policy
系统 SHALL allow each voice cue type to define a scheduling policy that controls priority, interrupt behavior, queue behavior, deduplication, and staleness.

#### Scenario: High priority cue is active
- **WHEN** a high priority cue such as action preparation or step introduction is currently speaking
- **THEN** lower priority cues such as repetition count MUST follow the configured policy without interrupting the active high priority cue by default

#### Scenario: Cue becomes stale
- **WHEN** a queued cue belongs to an older workout step, canceled job id, or expired timestamp
- **THEN** the scheduler MUST discard that cue according to configuration
- **AND** stale cues MUST NOT update current workout preparation state or playback state

#### Scenario: Queue exceeds configured limit
- **WHEN** voice cues are produced faster than speech can complete and the queue reaches the configured maximum size
- **THEN** the scheduler MUST apply the configured overflow policy
- **AND** the default overflow policy MUST prefer dropping low priority stale cues over interrupting active step introduction or preparation cues

