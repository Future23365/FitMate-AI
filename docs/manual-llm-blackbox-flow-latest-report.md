# 手动 LLM 首页聊天黑盒流程测试报告

生成时间：2026-05-31T12:43:47.466Z
模型：deepseek-v4-flash

## 汇总

- 流程用例数：9
- 轮次数：27
- 通过：27
- 失败：0
- 跳过：0
- 预计输入 token：59782
- 预计输出 token：18900
- 预计总 token：78682
- prompt_tokens：372222
- completion_tokens：40414
- total_tokens：412636

## 流程轮次结果

### F01 纯动作推荐到刷新推荐 / 第 1 轮：第 1 轮：胸部动作推荐

- 状态：通过
- 用户输入：今天我想练胸
- 期望结果：应触发胸部动作推荐卡片，不生成 routine 或 plan。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：exercise_recommendation
- assistant 摘要：好的！我来按你的条件整理一组适合新手的胸部训练动作，这次训练按30分钟来安排。
- responseMessageId：assistant_mptrnhpm_fwdj7t68
- traceId：trace_mptrnhpm_r2lkk6l1
- conversationId：manual-llm-F01-mptrnhpk-hztp1v

### F01 纯动作推荐到刷新推荐 / 第 2 轮：第 2 轮：刷新推荐

- 状态：通过
- 用户输入：换一批
- 期望结果：应沿用胸部目标刷新推荐。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：exercise_recommendation
- assistant 摘要：好的，我明白你的意思了，希望看到更多不同的动作选择。 我先按居家、自重、适合新手的方向重新整理一组新的动作。
- responseMessageId：assistant_mptrnqcw_7afrl7v3
- traceId：trace_mptrnqcw_c9zsyfb2
- conversationId：manual-llm-F01-mptrnhpk-hztp1v

### F01 纯动作推荐到刷新推荐 / 第 3 轮：第 3 轮：加入无器械条件

- 状态：通过
- 用户输入：推荐几个不用器械的
- 期望结果：应继续推荐胸部方向，并纳入无器械条件。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：exercise_recommendation
- assistant 摘要：好的，我按居家自重、适合新手的条件，先整理一组胸部动作推荐。
- responseMessageId：assistant_mptrnwpg_wj3qjf2j
- traceId：trace_mptrnwpg_8syoml99
- conversationId：manual-llm-F01-mptrnhpk-hztp1v

### F02 动作推荐升级为单次训练 / 第 1 轮：第 1 轮：腿部动作推荐

- 状态：通过
- 用户输入：推荐几个练腿动作
- 期望结果：应触发腿部动作推荐卡片。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：exercise_recommendation
- assistant 摘要：好的，我先按你的条件整理一组适合新手的练腿动作推荐。
- responseMessageId：assistant_mptro3al_72qoabrl
- traceId：trace_mptro3al_qacyh0an
- conversationId：manual-llm-F02-mptro3ak-aa7cwb

### F02 动作推荐升级为单次训练 / 第 2 轮：第 2 轮：升级为 20 分钟训练

- 状态：通过
- 用户输入：给我做成20分钟训练
- 期望结果：应继承腿部目标并触发单次 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，我来按你的条件整理这次20分钟的居家练腿训练。
- responseMessageId：assistant_mptro8k0_w139zyq2
- traceId：trace_mptro8k0_y8nay3qn
- conversationId：manual-llm-F02-mptro3ak-aa7cwb

### F02 动作推荐升级为单次训练 / 第 3 轮：第 3 轮：改为无器械

- 状态：通过
- 用户输入：我没有器械
- 期望结果：应基于同一目标调整为无器械 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，我刚才已经按你的需求整理好了这次训练安排。考虑到你希望完全用自重完成，且这次是新手入门级的居家练腿，我把训练时长定在20分钟左右，频率暂定每周1次。训练内容已经准备好了，你可以看看是否合适。
- responseMessageId：assistant_mptrof66_1xgonlwu
- traceId：trace_mptrof66_i7x94g9b
- conversationId：manual-llm-F02-mptro3ak-aa7cwb

### F03 信息不足时逐步补齐 routine / 第 1 轮：第 1 轮：笼统要一套训练

- 状态：通过
- 用户输入：给我一套训练
- 期望结果：信息不足时不应直接推送训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：无训练卡片
- assistant 摘要：好的！我看一下你提到想练全身，而且偏向新手，不过还需要知道一件事：**你手边大概有什么器械？或者是在家里练还是去健身房？** 比如你可以说： - **“在家练，徒手就行。”** - **“有哑铃和瑜伽垫。”** - **“在健身房，器械基本都有。”** 这样我好按你的条件来安排这轮训练。
- responseMessageId：assistant_mptrold8_orb9il6u
- traceId：trace_mptrold8_hnmt7qkm
- conversationId：manual-llm-F03-mptrold8-q1ovju

### F03 信息不足时逐步补齐 routine / 第 2 轮：第 2 轮：补齐目标和时长

- 状态：通过
- 用户输入：练胸，20分钟
- 期望结果：可继续追问器械/场地，也可在候选足够时生成 routine。
- 期望卡片类型：无训练卡片
- 实际卡片类型：workout_routine
- assistant 摘要：好的，我来按你的条件整理这次 20 分钟的居家徒手胸部训练。
- responseMessageId：assistant_mptropfo_lvey1mi1
- traceId：trace_mptropfo_fj21vuz4
- conversationId：manual-llm-F03-mptrold8-q1ovju

### F03 信息不足时逐步补齐 routine / 第 3 轮：第 3 轮：补齐器械

- 状态：通过
- 用户输入：没有器械
- 期望结果：条件补齐后应生成胸部 20 分钟无器械 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，明白了！我按你居家无器械的条件，20分钟，目标练胸，帮你整理好这次训练了。
- responseMessageId：assistant_mptrowlf_bsk8pqhs
- traceId：trace_mptrowlf_r2wvjltf
- conversationId：manual-llm-F03-mptrold8-q1ovju

### F04 单次训练条件一次给齐后继续调整 / 第 1 轮：第 1 轮：居家背部 30 分钟

- 状态：通过
- 用户输入：今天在家练背30分钟
- 期望结果：应生成居家背部 30 分钟 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，我先按你居家、30分钟、新手练背的条件整理这次训练。
- responseMessageId：assistant_mptrp27d_ixono4cs
- traceId：trace_mptrp27d_52lcdx3e
- conversationId：manual-llm-F04-mptrp27d-t8mbn1

### F04 单次训练条件一次给齐后继续调整 / 第 2 轮：第 2 轮：改成 45 分钟

- 状态：通过
- 用户输入：改成45分钟
- 期望结果：应保留背部和居家条件，只调整训练量。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，已经按你的需求，把训练时长调整到45分钟，开始为你整理这次居家新手背部训练。
- responseMessageId：assistant_mptrp8t1_nu5zau60
- traceId：trace_mptrp8t1_l3sbkm3k
- conversationId：manual-llm-F04-mptrp27d-t8mbn1

### F04 单次训练条件一次给齐后继续调整 / 第 3 轮：第 3 轮：降低难度

- 状态：通过
- 用户输入：太难了，降低一点
- 期望结果：应保留 routine 目标并降低难度或强度。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，刚才那版编排没有通过校验，而且整体强度对你来说可能还是偏高了。我把这次训练调整为更轻柔、适合新手居家练背的版本，先按你想要的 45 分钟来整理。
- responseMessageId：assistant_mptrpj2g_7ylhcju3
- traceId：trace_mptrpj2h_3hwcdahj
- conversationId：manual-llm-F04-mptrp27d-t8mbn1

### F05 长期计划逐步补齐 / 第 1 轮：第 1 轮：笼统长期计划

- 状态：通过
- 用户输入：给我一个每周训练计划
- 期望结果：长期计划缺关键条件时不应直接生成空泛 plan。
- 期望卡片类型：无训练卡片
- 实际卡片类型：无训练卡片
- assistant 摘要：好的，我很乐意帮你制定一个每周训练计划！ 为了给你安排一个真正适合你的计划，我需要先了解几个关键信息： 1. **你的主要训练目标是什么？** 比如是增肌、减脂、提升体能，还是保持健康？ 2. **你每周打算练几天？** 比如2天、3天还是更多？ 3. **你手头有什么器械？** 是在家自重训练，还是有哑铃、弹力带，或者可以去健身房？ 你可以直接告诉我，比如“我想减脂，每周练3天，在家自重训练就行”，我就能为你整理出一份合适的计划。
- responseMessageId：assistant_mptrprum_vakkfdx6
- traceId：trace_mptrprum_wensolko
- conversationId：manual-llm-F05-mptrprum-jwl0je

### F05 长期计划逐步补齐 / 第 2 轮：第 2 轮：补齐频率和时长

- 状态：通过
- 用户输入：每周4练，每次45分钟
- 期望结果：应继续补齐目标或器械条件，不推送训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：无训练卡片
- assistant 摘要：你提了每周4练、每次45分钟，这个节奏很适合新手入门。不过要帮你把每周计划具体排出来，还需要两样信息： 1. **训练目标**——你主要想往哪个方向走？比如增肌、减脂、提升体能，还是保持健康？ 2. **可用器械或场地**——你平时在家练（自重）、有哑铃或弹力带，还是去健身房？ 举个例子，你可以直接告诉我：“我想减脂，在家自重练。”或者“我想增肌，有哑铃和弹力带。”这样我就能按你的条件把每周4练的安排整理出来。
- responseMessageId：assistant_mptrpw89_0i221aas
- traceId：trace_mptrpw89_eeqw5c8z
- conversationId：manual-llm-F05-mptrprum-jwl0je

### F05 长期计划逐步补齐 / 第 3 轮：第 3 轮：补齐目标和器械

- 状态：通过
- 用户输入：增肌，有健身房器械
- 期望结果：应生成每周 4 练、45 分钟、增肌、健身房 plan。
- 期望卡片类型：workout_plan
- 实际卡片类型：workout_plan
- assistant 摘要：了解，你的目标是增肌，每周可以在健身房练4次，每次45分钟左右。我先按这些条件整理你的每周训练安排。
- responseMessageId：assistant_mptrq0dt_z0mmp4pz
- traceId：trace_mptrq0dt_txy17bnt
- conversationId：manual-llm-F05-mptrprum-jwl0je

### F06 长期计划语义区分 / 第 1 轮：第 1 轮：6 天训练计划

- 状态：通过
- 用户输入：给我一个6天训练计划
- 期望结果：应识别为长期 plan，而不是单次 routine。
- 期望卡片类型：workout_plan
- 实际卡片类型：workout_plan
- assistant 摘要：好的，我先按你的目标整理一个为期6天、每天约30分钟的新手训练计划。我会以力量训练为主，并穿插一些拉伸放松动作，帮你逐步建立运动习惯。
- responseMessageId：assistant_mptrqd3n_1t0dcvez
- traceId：trace_mptrqd3n_vk0by936
- conversationId：manual-llm-F06-mptrqd3n-zqli4y

### F06 长期计划语义区分 / 第 2 轮：第 2 轮：每周 6 练

- 状态：通过
- 用户输入：改成每周6练
- 期望结果：应保持 plan 语义并切换周频率。
- 期望卡片类型：workout_plan
- 实际卡片类型：workout_plan
- assistant 摘要：好的，我注意到你目前有一个六天训练计划，但刚才生成时服务端校验没通过，提示训练量需要调整。我会按每周 6 练、每次 30 分钟、适合新手的条件重新整理安排，同时把这版的时长或动作组数再协调一下。 你希望我帮你压缩每节课的动作数量、降低每组的次数，还是想保持完整训练量但适当延长单次时长？
- responseMessageId：assistant_mptrrbkz_x11sdg2j
- traceId：trace_mptrrbkz_6v98rh92
- conversationId：manual-llm-F06-mptrqd3n-zqli4y

### F06 长期计划语义区分 / 第 3 轮：第 3 轮：未来 6 天每天练

- 状态：通过
- 用户输入：未来6天每天练
- 期望结果：应保持 plan 语义并表达明确日历范围。
- 期望卡片类型：workout_plan
- 实际卡片类型：workout_plan
- assistant 摘要：好的，我先按你的周期目标整理训练安排。目前按新手、每次30分钟、居家无器械的条件来构建这个6天计划，你可以先看看框架，后续随时可以调整时长或补充器械偏好。
- responseMessageId：assistant_mptrs4q9_tv6e3c9a
- traceId：trace_mptrs4q9_5acvty9x
- conversationId：manual-llm-F06-mptrqd3n-zqli4y

### F07 当前消息覆盖历史条件 / 第 1 轮：第 1 轮：记录器械条件

- 状态：通过
- 用户输入：我有哑铃
- 期望结果：只记录器械条件，不应推送训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：无训练卡片
- assistant 摘要：你手边有哑铃，这个很好，很多上肢和下肢的动作都可以用它来增加负重。 方便说一下你这次训练的目标或想法吗？比如是想用哑铃做一次全身训练，还是重点练某个部位（比如手臂、肩膀或胸肌）？另外，你计划练多长时间呢？ 不用太复杂，直接说一句就行，比如“想练20分钟胸和手臂”或者“今天就想全身随便动一动”。
- responseMessageId：assistant_mptrsldg_60kstldi
- traceId：trace_mptrsldg_xlhye591
- conversationId：manual-llm-F07-mptrsldg-xqrmyh

### F07 当前消息覆盖历史条件 / 第 2 轮：第 2 轮：继承哑铃条件

- 状态：通过
- 用户输入：今天练胸30分钟
- 期望结果：应继承哑铃条件生成胸部 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：收到！我来按你的条件整理一次 **30分钟居家胸肌哑铃训练**，主要针对新手、用哑铃在家就能完成，帮你高效练到胸。
- responseMessageId：assistant_mptrsnzp_1m9kb8sv
- traceId：trace_mptrsnzp_5fcdxrou
- conversationId：manual-llm-F07-mptrsldg-xqrmyh

### F07 当前消息覆盖历史条件 / 第 3 轮：第 3 轮：覆盖为不用器械

- 状态：通过
- 用户输入：但今天不用器械
- 期望结果：当前消息应覆盖历史器械条件。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，明白了，今天我们就用自重来完成训练。我先按30分钟、自重、适合新手的条件整理这次居家胸部训练。
- responseMessageId：assistant_mptrsuhs_ct0rian2
- traceId：trace_mptrsuhs_0gawd2x1
- conversationId：manual-llm-F07-mptrsldg-xqrmyh

### F13 非健身话题不触发训练流程 / 第 1 轮：第 1 轮：非健身问题

- 状态：通过
- 用户输入：明天天气怎么样？
- 期望结果：非健身问题不得触发训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：无训练卡片
- assistant 摘要：抱歉，我无法查询实时天气信息。如果你有健身相关的问题，比如如何根据天气调整训练计划、室内替代动作等，我很乐意帮忙。
- responseMessageId：assistant_mptrt083_73wnapng
- traceId：trace_mptrt083_2zl5g403
- conversationId：manual-llm-F13-mptrt082-stmzq5

### F13 非健身话题不触发训练流程 / 第 2 轮：第 2 轮：切回胸部训练

- 状态：通过
- 用户输入：那我今天练胸
- 期望结果：应重新进入健身流程并触发胸部推荐。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：exercise_recommendation
- assistant 摘要：好的，今天练胸，我先按你这边的情况整理一组适合新手的胸部训练动作。
- responseMessageId：assistant_mptrt2ao_iz7h8qj0
- traceId：trace_mptrt2ao_a6qed37z
- conversationId：manual-llm-F13-mptrt082-stmzq5

### F13 非健身话题不触发训练流程 / 第 3 轮：第 3 轮：升级 routine

- 状态：通过
- 用户输入：做成20分钟
- 期望结果：应继承胸部目标升级为 20 分钟 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，那我按20分钟的时长，为你整理这次新手胸部训练。已经开始安排，稍后就能看到具体内容。
- responseMessageId：assistant_mptrt99x_uw9lz8sd
- traceId：trace_mptrt99x_yodkk2z9
- conversationId：manual-llm-F13-mptrt082-stmzq5

### F15 明确引用最近卡片 / 第 1 轮：第 1 轮：胸部推荐卡片

- 状态：通过
- 用户输入：今天想练胸
- 期望结果：应生成胸部推荐卡片。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：exercise_recommendation
- assistant 摘要：好的，那我先根据你的目标，按 30 分钟、新手友好的方向，为你整理一组练胸的动作推荐。
- responseMessageId：assistant_mptrtfar_kh4swbm4
- traceId：trace_mptrtfar_noasx1bv
- conversationId：manual-llm-F15-mptrtfar-cahfr9

### F15 明确引用最近卡片 / 第 2 轮：第 2 轮：引用最近卡片升级

- 状态：通过
- 用户输入：把它变成20分钟训练
- 期望结果：“它”应解析为最近推荐并生成 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：workout_routine
- assistant 摘要：好的，我们现在就按 20 分钟、新手、无器械的条件，把练胸安排成一次完整的循环训练。
- responseMessageId：assistant_mptrtkbu_gwwwh9gy
- traceId：trace_mptrtkbu_9l66q42r
- conversationId：manual-llm-F15-mptrtfar-cahfr9

### F15 明确引用最近卡片 / 第 3 轮：第 3 轮：解释第一个动作

- 状态：通过
- 用户输入：第一个动作怎么做
- 期望结果：应解释最近卡片或 routine 中的第一个动作，不重新推荐一批动作。
- 期望卡片类型：无训练卡片
- 实际卡片类型：无训练卡片
- assistant 摘要：我找到了你引用的训练内容，但没有安全读取到对应的动作详情。你可以把动作名称再发我一次，我再按动作库内容给你讲解。
- responseMessageId：assistant_mptrtqrg_2umv3yjm
- traceId：trace_mptrtqrg_a7k64i2p
- conversationId：manual-llm-F15-mptrtfar-cahfr9

