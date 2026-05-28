# 手动 LLM 一致性测试验收报告

生成时间：2026-05-28T07:33:41.376Z

## 汇总

- 用例总数：20
- 通过：20
- 失败：0
- prompt_tokens：25253
- completion_tokens：4461
- total_tokens：29714

## 样例验收结果

- 通过：用户提问：训练前热身应该注意什么？，大模型回答：{ "type": "general_fitness_advice", "needsExerciseContext": false, "workoutIntent": null, "requestedExerciseName": "", "canTriggerAction": false, "missingActionFields": [], "sugges...。本地意图解析结果：type=general_fitness_advice，canTriggerAction=false，token=1439
- 通过：用户提问：新手在家自重练胸，请直接推荐4个动作，不要安排组数流程。，大模型回答：{ "type": "exercise_recommendation", "needsExerciseContext": true, "workoutIntent": { "intentType": "routine", "goal": "练胸", "experience": "beginner", "sessionMinutes": 30, "weekly...。本地意图解析结果：type=exercise_recommendation，intentType=routine，canTriggerAction=true，token=1518
- 通过：用户提问：这批不太喜欢，换一批，大模型回答：{ "type": "exercise_recommendation", "needsExerciseContext": true, "workoutIntent": { "intentType": "routine", "goal": "胸肌训练", "experience": "beginner", "sessionMinutes": 30, "week...。本地意图解析结果：type=exercise_recommendation，intentType=routine，canTriggerAction=true，token=1705
- 通过：用户提问：帮我做一个每周三次、持续一个月的胸肌增肌计划，每次45分钟，在家自重练。，大模型回答：{ "type": "workout_plan", "needsExerciseContext": true, "workoutIntent": { "intentType": "plan", "goal": "胸肌增肌", "experience": "beginner", "sessionMinutes": 45, "weeklyFrequency": ...。本地意图解析结果：type=workout_plan，intentType=plan，canTriggerAction=true，token=1522
- 通过：用户提问：今天在家自重练胸 30 分钟，帮我安排一套。，大模型回答：{ "type": "routine", "needsExerciseContext": true, "workoutIntent": { "intentType": "routine", "goal": "练胸", "experience": "beginner", "sessionMinutes": 30, "weeklyFrequency": 1, "...。本地意图解析结果：type=routine，intentType=routine，canTriggerAction=true，token=1509
- 通过：用户提问：把当前训练里的俯卧撑替换成不伤手腕的动作。，大模型回答：{ "type": "exercise_replacement", "needsExerciseContext": true, "workoutIntent": { "intentType": "routine", "goal": "胸肌训练", "experience": "beginner", "sessionMinutes": 30, "weeklyF...。本地意图解析结果：type=exercise_replacement，intentType=routine，canTriggerAction=true，token=1706
- 通过：用户提问：俯卧撑怎么做才标准？，大模型回答：{ "type": "exercise_explanation", "needsExerciseContext": true, "workoutIntent": { "intentType": "routine", "goal": "动作讲解", "experience": "beginner", "sessionMinutes": 30, "weeklyF...。本地意图解析结果：type=exercise_explanation，intentType=routine，canTriggerAction=false，token=1688
- 通过：用户提问：明天上海会下雨吗？，大模型回答：{ "type": "non_fitness", "needsExerciseContext": false, "requestedExerciseName": "", "canTriggerAction": false, "missingActionFields": [], "suggestedReplies": [] }。本地意图解析结果：type=non_fitness，canTriggerAction=false，token=1427
- 通过：用户提问：今天练什么？，大模型回答：{ "type": "routine", "needsExerciseContext": true, "workoutIntent": { "intentType": "routine", "goal": "今天练什么", "experience": "beginner", "sessionMinutes": 30, "weeklyFrequency": 1...。本地意图解析结果：type=routine，intentType=routine，canTriggerAction=false，token=1542
- 通过：用户提问：把俯卧撑、平板支撑、开合跳、胸部拉伸编成一套训练。，大模型回答：{ "type": "routine", "needsExerciseContext": true, "workoutIntent": { "intentType": "routine", "goal": "编成一套训练", "experience": "beginner", "sessionMinutes": 30, "weeklyFrequency": ...。本地意图解析结果：type=routine，intentType=routine，canTriggerAction=true，token=1516
- 通过：用户提问：今天在家自重练胸 30 分钟，帮我安排一套。，大模型回答：好的！你今天是居家自重练胸30分钟，我先按这个时间和你新手阶段的节奏，整理一次完整的训练安排。训练会包括热身、正式动作和拉伸，重点放在胸肌上，同时也会带一下核心和全身参与的部分来提升整体效果。。本地意图解析结果：自然语言回复已检查禁止项和关键语义。，token=2053
- 通过：用户提问：我最近运动时胸痛，还想做高强度训练。，大模型回答：听到你最近运动时出现胸痛的情况，我非常关注。**这必须严肃对待**——运动时胸痛可能是心脏相关问题的信号，比如心绞痛、心律不齐甚至心肌炎。在健康没有明确保障的情况下，**绝对不能继续高强度训练**。 **我强烈建议你：** 1. **立刻停止所有运动**，直到去看医生并得到专业许可。 2. **尽快预约心内科或全科医生**，做一个全面检查（如心电图、心脏彩超...。本地意图解析结果：自然语言回复已检查禁止项和关键语义。，token=857
- 通过：用户提问：膝盖疼，只用壶铃练跳跃爆发力，给我动作。，大模型回答：你的膝盖疼痛一定要注意，**在开始任何训练前，强烈建议先咨询医生或专业康复师**，明确膝盖疼的具体原因，避免盲目训练加重损伤。跳跃动作对膝盖冲击较大，带伤训练风险很高。 目前根据你“膝盖疼、壶铃、跳跃爆发力、新手”这几个条件，我这边能匹配到的相关动作非常有限，暂时无法组合成一套完整的训练。 为了帮你更好地实现“跳跃爆发力”的目标同时保护膝盖，建议你考虑放宽一...。本地意图解析结果：自然语言回复已检查禁止项和关键语义。，token=2015
- 通过：用户提问：新手在家自重练胸，推荐几个动作。，大模型回答：{ "title": "新手居家自重胸肌训练计划", "goal": "胸肌训练", "summary": "3个针对胸肌的自重动作，配合热身和拉伸，适合新手在家30分钟完成。", "items": [ { "exerciseId": "push-up", "reasons": ["高效训练胸肌", "新手友好，可调整难度"] }, { "exerciseI...。本地意图解析结果：items=5，token=1495
- 通过：用户提问：换一批，不要俯卧撑。，大模型回答：{ "title": "居家自重胸肌训练", "goal": "胸肌训练", "summary": "为您挑选了适合新手、居家无器械的胸部训练动作，并增加了全身热身和拉伸，确保安全有效。", "items": [ { "exerciseId": "knee-push-up", "reasons": ["新手友好，降低难度", "有效刺激胸肌", "适合居家环...。本地意图解析结果：items=4，token=1513
- 通过：用户提问：帮我做一个每周三次、持续一个月的胸肌增肌计划，每次45分钟，在家自重练。，大模型回答：{ "intentType": "plan", "goal": "胸肌增肌", "experience": "beginner", "sessionMinutes": 45, "weeklyFrequency": 3, "equipment": [], "injuryLimitations": [], "preferences": [], "avoidanc...。本地意图解析结果：intentType=plan，token=298
- 通过：用户提问：今天在家自重练胸 30 分钟，帮我安排一套。，大模型回答：{ "intentType": "routine", "goal": "在家自重练胸", "experience": "beginner", "sessionMinutes": 30, "weeklyFrequency": 3, "equipment": [], "injuryLimitations": [], "preferences": [], "avo...。本地意图解析结果：intentType=routine，token=290
- 通过：用户提问：给我安排综合体能训练。，大模型回答：{ "intentType": "plan", "goal": "综合体能训练", "experience": "beginner", "sessionMinutes": 30, "weeklyFrequency": 3, "equipment": [], "injuryLimitations": [], "preferences": [], "avoida...。本地意图解析结果：intentType=plan，token=281
- 通过：用户提问：每周三次居家胸肌增肌计划，每次45分钟。，大模型回答：{ "title": "居家胸肌增肌计划", "goal": "胸肌增肌", "summary": "适合新手居家进行的自重胸肌增肌计划，每周3次，每次45分钟。", "weeklyFrequency": 3, "estimatedSessionMinutes": 45, "safetyNotes": [ "训练前进行充分热身，避免肌肉拉伤", "保持动作规...。本地意图解析结果：days=3，token=2966
- 通过：用户提问：今天在家自重练胸 30 分钟，帮我安排一套。，大模型回答：{ "kind": "routine", "title": "居家自重胸肌训练", "goal": "胸肌训练", "summary": "一套适合初学者的居家自重胸肌训练，包含热身、主训练和拉伸，可在30分钟内完成。", "estimatedSessionMinutes": 30, "trainingLoopRounds": 3, "trainingLoo...。本地意图解析结果：sections=3，token=2374
