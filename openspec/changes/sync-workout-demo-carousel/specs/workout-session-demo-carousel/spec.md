## ADDED Requirements

### Requirement: Workout item demo images
The system SHALL preserve all available demo images for workout items used by the workout session page.

#### Scenario: Exercise is converted to workout item
- **WHEN** an exercise with multiple `imageUrls` is added to a workout
- **THEN** the resulting workout item includes those demo image URLs
- **AND** the workout item still exposes its primary `imageUrl`

#### Scenario: Existing workout item has only primary image
- **WHEN** a workout item does not include `imageUrls`
- **THEN** the system derives a one-item image list from `imageUrl`

### Requirement: Workout session demo carousel
The system SHALL show demo images for the currently relevant workout action on `/training` according to the action mode.

#### Scenario: Timed exercise is active
- **WHEN** the current timeline step is an exercise step with multiple demo images
- **AND** the exercise uses duration mode
- **THEN** the action demo area displays the last demo image by default
- **AND** the displayed image does not cycle independently during that timed step

#### Scenario: Repetition exercise is active
- **WHEN** the current timeline step is a repetition exercise with multiple demo images
- **THEN** the action demo area cycles through all demo images according to the calculated repetition timing
- **AND** the image sequence resets when the user enters another step

#### Scenario: Preparation countdown is active
- **WHEN** the current exercise is waiting for its preparation voice prompt or countdown
- **THEN** the action demo area shows the current exercise demo image selected by the action mode
- **AND** the workout step timer does not advance during preparation

#### Scenario: Training is paused
- **WHEN** the user pauses the workout session
- **THEN** the visible demo image remains aligned with the paused step time
- **AND** the demo carousel does not continue advancing independently

#### Scenario: User changes step
- **WHEN** the user clicks previous, next, skip, or selects an action from the session list
- **THEN** the action demo area immediately switches to the newly relevant action
- **AND** repetition action demo images start from the beginning of that action sequence
- **AND** duration action demo images show the last image by default

### Requirement: Rest step demo preview
The system SHALL use rest steps to visually prepare the next workout action without changing rest timing.

#### Scenario: Rest step has next action
- **WHEN** the current timeline step is a rest step and a next action exists
- **THEN** the action demo area shows the next action's demo images
- **AND** the rest timer and rest voice cue continue to describe the rest step

#### Scenario: Rest step has no next action
- **WHEN** the current timeline step is a rest step without a next action
- **THEN** the action demo area falls back to the most relevant completed action or placeholder

### Requirement: Demo image fallback
The system SHALL keep the workout session usable when demo images are incomplete or unavailable.

#### Scenario: Action has one demo image
- **WHEN** the relevant action has only one image URL
- **THEN** the action demo area displays that image without carousel errors

#### Scenario: Action has no usable demo image
- **WHEN** the relevant action has no usable image URL
- **THEN** the action demo area displays the existing fallback illustration or placeholder
