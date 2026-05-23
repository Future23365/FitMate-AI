## 1. Voice Cue Model

- [ ] 1.1 Add a workout voice cue utility that converts `WorkoutTimelineStep` data into Chinese startup, exercise, rest, next-group, and repetition-count prompt text.
- [ ] 1.2 Add concise workout overview generation that limits long action lists while preserving total action count.
- [ ] 1.3 Add focused tests for cue generation across duration steps, rep steps, repetition counts, set rests, exercise transitions, loop rests, and long workouts.

## 2. Browser Audio Hook

- [ ] 2.1 Implement a client-only `useWorkoutVoiceBroadcast` hook that wraps `window.speechSynthesis` and `SpeechSynthesisUtterance`.
- [ ] 2.2 Implement speech queue cancellation for pause, resume, skip, finish, disable, and component unmount flows.
- [ ] 2.3 Implement short local beep cues for every elapsed second during duration-mode exercise steps, with graceful fallback when browser audio is unavailable.
- [ ] 2.4 Implement numeric counting speech cues for reps-mode exercise steps, deduped so each reached count is announced once per step.
- [ ] 2.5 Prefer `zh-CN` speech settings and Chinese voices when available, while falling back to the browser default voice.

## 3. Training Page Integration

- [ ] 3.1 Replace the existing top audio button behavior in `WorkoutSessionPage` with the voice broadcast toggle while preserving the current visual affordance.
- [ ] 3.2 Default voice broadcast to enabled unless `localStorage` contains a disabled preference.
- [ ] 3.3 Persist toggle changes under a `fitmate.*` localStorage key without adding server persistence.
- [ ] 3.4 Wire the hook to workout timeline state so startup sequence, step transitions, manual step changes, pauses, resumes, and training finish trigger the correct audio behavior.
- [ ] 3.5 Keep `/plans`, `/composer`, AI routes, workout persistence APIs, and training data schemas unchanged.

## 4. Verification

- [ ] 4.1 Run the relevant TypeScript and lint checks for changed files.
- [ ] 4.2 Verify unsupported `speechSynthesis`, unavailable `localStorage`, and unavailable audio context paths do not break the training page.
- [ ] 4.3 Manually verify `/training` starts with voice enabled, the volume button toggles and persists local preference, startup says “3，2，1开始”, step changes announce current or next-group action, duration-mode actions beep every second, and reps-mode actions announce “1，2，3...” according to the repetition interval.
