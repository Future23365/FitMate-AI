## MODIFIED Requirements

### Requirement: Voice broadcast toggle and local preference
系统 SHALL 在训练执行页复用顶部音量按钮作为语音播报开关，并在本地持久化用户选择。

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
- **THEN** the system enables voice broadcast and stores the enabled preference in `localStorage`
- **AND** later visits to `/training` keep voice broadcast enabled until the user turns it off again

#### Scenario: User disables voice broadcast
- **WHEN** the user clicks the top volume button while voice broadcast is enabled
- **THEN** the system disables voice broadcast, cancels pending speech and rhythm cues, and stores the disabled preference in `localStorage`

#### Scenario: User returns after disabling voice broadcast
- **WHEN** the user opens `/training` after previously disabling voice broadcast locally
- **THEN** voice broadcast remains disabled until the user turns it on again

#### Scenario: Local storage is unavailable
- **WHEN** `localStorage` cannot be read or written
- **THEN** the system MUST keep the current page session usable and fall back to in-memory toggle state
