# 手动 LLM 首页聊天黑盒流程测试报告
生成时间：2026-06-01T22:49:13.541+08:00
模型：deepseek-v4-flash
套件：基础
运行命令：npm run test:llm
runner 类型：api_route
旧兼容事件：开启
真实/跳过状态：真实模型已运行
## 汇总
- 流程用例数：9
- 轮次数：27
- 通过：5
- 失败：9
- 跳过：13
- 需复核：0
- 预计输入 token：333858
- 预计输出 token：30874
- 预计总 token：364732
- 估算来源：recent_real_report
- 估算口径：基于 manual-llm-blackbox-flow-detail-latest-report.md 的真实 token 均值校准：27 轮、total_tokens=364732。
- prompt_tokens：211663
- completion_tokens：7480
- total_tokens：219143
- token 偏差摘要：实际 total_tokens=219143，预估=364732，偏差=-145589 (-40%)。
## 运行范围
- 完整 fixture flow 数：9
- 完整 fixture turn 数：27
- 本次筛选 flow 数：9
- 本次筛选 turn 数：27
- 筛选条件：ids=all; groups=all; suites=all
- 未运行 flow 数：0
- 未运行原因：完整运行，无筛选排除。
- 并发数：1
- 去重检查：strictDuplicateGroups=0；unhandledStrictDuplicates=0；repeatedStartGroups=0；highOverlapGroups=5；missingMetadata=0
## Preflight
- 状态：ready
- 模型 key：可用
- 数据库：可用
- artifact 表：可用
- seed 数据：可用
## 最终状态枚举
- `passed`：卡片类型断言和语义断言都通过。
- `failed`：P0/P1/P2 自动断言失败。
- `skipped`：缺少 key、preflight 未满足或前序轮次失败导致未执行。
- `needs_review`：仅 P3 内容质量或自动断言无法稳定判断，需要人工复核，不计为通过。
## 断言分层
- 用户可见闭环：回复非空、训练卡片类型、artifact/patch/suggestion 事件与用户可见结果一致。
- Agent 执行证据：`AgentExecutionResult`、tool dependency graph、candidateSetId、validationId、revisionId 和 legacy path skip。
- 语义质量：目标继承、器械排除、引用解析和澄清边界。
- 人工复核：措辞质量、排序和非关键表达稳定性。
## 流程轮次结果
### F01 纯动作推荐到刷新推荐 / 第 1 轮：第 1 轮：胸部动作推荐

- 状态：失败
- 用户输入：今天我想练胸
- 期望结果：应触发胸部动作推荐卡片，不生成 routine 或 plan。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：抱歉，我暂时没有找到适合练胸的动作。可能是我对“胸”这个肌肉名称的理解有误，请问你能告诉我更具体的肌肉名称吗？比如胸大肌（pectoralis major）或胸小肌（pectoralis minor）？或者你有其他偏好的训练目标吗？
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 缺少期望卡片类型：exercise_recommendation；[P0] 出现未允许的卡片类型：answer
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises；toolResults=tool_result_mpvboofp_t98sc7；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbomho_aefq12hb
- traceId：trace_mpvbomii_o1tunpuf
- conversationId：manual-llm-F01-mpvbomhn-13firu

### F01 纯动作推荐到刷新推荐 / 第 2 轮：第 2 轮：刷新推荐

- 状态：跳过
- 用户输入：换一批
- 期望结果：应沿用胸部目标刷新推荐。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F01", "flowName": "纯动作推荐到刷新推荐", "turnIndex": 1, "turnName": "第 1 轮：胸部动作推荐", "userInput": "今天我想练胸", "expectedCardTypes": [ "exercise_recommendation" ], "actualCardTypes": [ "answer" ], "conversationId": "manu...
- conversationId：manual-llm-F01-mpvbomhn-13firu

### F01 纯动作推荐到刷新推荐 / 第 3 轮：第 3 轮：加入无器械条件

- 状态：跳过
- 用户输入：推荐几个不用器械的
- 期望结果：应继续推荐胸部方向，并纳入无器械条件。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F01", "flowName": "纯动作推荐到刷新推荐", "turnIndex": 1, "turnName": "第 1 轮：胸部动作推荐", "userInput": "今天我想练胸", "expectedCardTypes": [ "exercise_recommendation" ], "actualCardTypes": [ "answer" ], "conversationId": "manu...
- conversationId：manual-llm-F01-mpvbomhn-13firu

### F02 动作推荐升级为单次训练 / 第 1 轮：第 1 轮：腿部动作推荐

- 状态：失败
- 用户输入：推荐几个练腿动作
- 期望结果：应触发腿部动作推荐卡片。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：answer, exercise_recommendation

- 实际 Agent status：answered
- assistant 摘要：我为你推荐以下几个练腿动作： 1. **杠铃深蹲** - 初级，使用杠铃，主要锻炼股四头肌，同时加强核心和臀部。 2. **弹力带深蹲** - 初级，使用弹力带，适合家庭锻炼。 3. **史密斯机单腿分腿蹲** - 初级，固定器械，稳定核心。 4. **仰卧器械深蹲** - 中级，固定器械，安全有效。 5. **宽站距杠铃深蹲** - 中级，杠铃，侧重内侧大腿。 6. **双壶铃前蹲** - 中级，壶铃，提升平衡和力量。 7. **窄距...
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 出现未允许的卡片类型：answer
- artifact 诊断：recentSummaryCount=1；producedArtifact=true；kind=exercise_recommendation；artifactId=cmpvbovm90006nvnbbxygn77g；payload=readable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises；toolResults=tool_result_d2c8dadc68e703e0c7380538；candidateSetIds=candidate_set_d2c8dadc68e703e0c7380538；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbor9w_lp7l8y2l
- traceId：trace_mpvborb8_byu6kt33
- conversationId：manual-llm-F02-mpvbor9w-0qgdwf

### F02 动作推荐升级为单次训练 / 第 2 轮：第 2 轮：升级为 20 分钟训练

- 状态：跳过
- 用户输入：给我做成20分钟训练
- 期望结果：应继承腿部目标并触发单次 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F02", "flowName": "动作推荐升级为单次训练", "turnIndex": 1, "turnName": "第 1 轮：腿部动作推荐", "userInput": "推荐几个练腿动作", "expectedCardTypes": [ "exercise_recommendation" ], "actualCardTypes": [ "answer", "exercise_recommendati...
- conversationId：manual-llm-F02-mpvbor9w-0qgdwf

### F02 动作推荐升级为单次训练 / 第 3 轮：第 3 轮：改为无器械

- 状态：跳过
- 用户输入：我没有器械
- 期望结果：应基于同一目标调整为无器械 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F02", "flowName": "动作推荐升级为单次训练", "turnIndex": 1, "turnName": "第 1 轮：腿部动作推荐", "userInput": "推荐几个练腿动作", "expectedCardTypes": [ "exercise_recommendation" ], "actualCardTypes": [ "answer", "exercise_recommendati...
- conversationId：manual-llm-F02-mpvbor9w-0qgdwf

### F03 信息不足时逐步补齐 routine / 第 1 轮：第 1 轮：笼统要一套训练

- 状态：通过
- 用户输入：给我一套训练
- 期望结果：信息不足时不应直接推送训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：根据您的请求，我已生成一套训练草稿。请查看以下训练内容： ## 通用健身训练 **主要动作：** 侧平举 这是一个初级水平的力量训练，使用哑铃进行。您可以选择合适的重量，完成3组，每组10-15次。 训练前请进行适当热身，训练后进行拉伸。如果您需要调整动作或训练安排，请告诉我。如果您希望获得更多动作或详细组数，也请随时提出。
- 卡片类型断言：passed
- 语义断言：passed
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises,generateRoutineDraft；toolResults=tool_result_ea713bb3ea3bbee28e9ee393,tool_result_e6242b576cdc6060aeeffe24；candidateSetIds=candidate_set_ea713bb3ea3bbee28e9ee393；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbovmw_0jzvs095
- traceId：trace_mpvbovn8_08miknbe
- conversationId：manual-llm-F03-mpvbovmw-e5nneq

### F03 信息不足时逐步补齐 routine / 第 2 轮：第 2 轮：补齐目标和时长

- 状态：失败
- 用户输入：练胸，20分钟
- 期望结果：可继续追问器械/场地，也可在候选足够时生成 routine。
- 期望卡片类型：无训练卡片
- 实际卡片类型：failed

- 实际 Agent status：failed
- assistant 摘要：这次执行没有完成，我没有生成或修改训练结果。
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 出现未允许的卡片类型：failed
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=failed；tools=searchExercises；candidateSetIds=candidate_set_02a4b194e8442f6ab00fbeb7；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbp283_gj6l8y32
- traceId：trace_mpvbp28e_uskw3nsm
- conversationId：manual-llm-F03-mpvbovmw-e5nneq

### F03 信息不足时逐步补齐 routine / 第 3 轮：第 3 轮：补齐器械

- 状态：跳过
- 用户输入：没有器械
- 期望结果：条件补齐后应生成胸部 20 分钟无器械 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：第 2 轮失败：{ "flowId": "F03", "flowName": "信息不足时逐步补齐 routine", "turnIndex": 2, "turnName": "第 2 轮：补齐目标和时长", "userInput": "练胸，20分钟", "expectedCardTypes": [], "actualCardTypes": [ "failed" ], "conversationId": "manual-llm-F03-mpvbovm...
- conversationId：manual-llm-F03-mpvbovmw-e5nneq

### F04 单次训练条件一次给齐后继续调整 / 第 1 轮：第 1 轮：居家背部 30 分钟

- 状态：失败
- 用户输入：今天在家练背30分钟
- 期望结果：应生成居家背部 30 分钟 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：我已经为你生成了一个30分钟的居家练背训练草案，包括动态背部拉伸和上背部拉伸等动作。需要我保存这个训练计划吗？
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 缺少期望卡片类型：workout_routine；[P0] 出现未允许的卡片类型：answer
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises,generateRoutineDraft,evaluatePolicy；toolResults=tool_result_500e02fc52558ad49e48037d；candidateSetIds=candidate_set_4095485fabe5f68abf3566ac；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbp5lj_zy0pbszm
- traceId：trace_mpvbp5lt_jupp1qxn
- conversationId：manual-llm-F04-mpvbp5lj-9xyjao

### F04 单次训练条件一次给齐后继续调整 / 第 2 轮：第 2 轮：改成 45 分钟

- 状态：跳过
- 用户输入：改成45分钟
- 期望结果：应保留背部和居家条件，只调整训练量。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F04", "flowName": "单次训练条件一次给齐后继续调整", "turnIndex": 1, "turnName": "第 1 轮：居家背部 30 分钟", "userInput": "今天在家练背30分钟", "expectedCardTypes": [ "workout_routine" ], "actualCardTypes": [ "answer" ], "conversationId": ...
- conversationId：manual-llm-F04-mpvbp5lj-9xyjao

### F04 单次训练条件一次给齐后继续调整 / 第 3 轮：第 3 轮：降低难度

- 状态：跳过
- 用户输入：太难了，降低一点
- 期望结果：应保留 routine 目标并降低难度或强度。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F04", "flowName": "单次训练条件一次给齐后继续调整", "turnIndex": 1, "turnName": "第 1 轮：居家背部 30 分钟", "userInput": "今天在家练背30分钟", "expectedCardTypes": [ "workout_routine" ], "actualCardTypes": [ "answer" ], "conversationId": ...
- conversationId：manual-llm-F04-mpvbp5lj-9xyjao

### F05 长期计划逐步补齐 / 第 1 轮：第 1 轮：笼统长期计划

- 状态：通过
- 用户输入：给我一个每周训练计划
- 期望结果：长期计划缺关键条件时不应直接生成空泛 plan。
- 期望卡片类型：无训练卡片
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：我已经为你生成了一个每周训练计划草案。当前 draft 包含的动作是侧平举（Side Lateral Raise）。请告诉我你是否想要调整这个计划，比如增加更多动作、设定目标（如增肌或减脂）或者指定每周训练天数，我可以帮你进一步优化。
- 卡片类型断言：passed
- 语义断言：passed
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises,generateRoutineDraft；toolResults=tool_result_5dbd84b9b3098c7c99d0477f,tool_result_985db757c3487c984020cdd8；candidateSetIds=candidate_set_5dbd84b9b3098c7c99d0477f；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbpeay_zpxmw82q
- traceId：trace_mpvbpecb_nur042sg
- conversationId：manual-llm-F05-mpvbpeay-gv9tv8

### F05 长期计划逐步补齐 / 第 2 轮：第 2 轮：补齐频率和时长

- 状态：通过
- 用户输入：每周4练，每次45分钟
- 期望结果：应继续补齐目标或器械条件，不推送训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：blocked

- 实际 Agent status：blocked
- assistant 摘要：用户要求每周4练和每次45分钟，适合生成长周期计划（plan），但当前candidateSet是routine候选，需要先获取用户已有artifact或用searchArtifacts查找合适来源，再生成plan草稿。当前上下文缺少plan来源artifact，请先提供目标（如增肌、减脂等）或已有计划信息。
- 卡片类型断言：passed
- 语义断言：passed
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=blocked；tools=searchExercises；toolResults=tool_result_8fa9802a2144641e980ca3ae；candidateSetIds=candidate_set_8fa9802a2144641e980ca3ae；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbpkal_94dnpgam
- traceId：trace_mpvbpkau_4seta5ea
- conversationId：manual-llm-F05-mpvbpeay-gv9tv8

### F05 长期计划逐步补齐 / 第 3 轮：第 3 轮：补齐目标和器械

- 状态：失败
- 用户输入：增肌，有健身房器械
- 期望结果：应生成每周 4 练、45 分钟、增肌、健身房 plan。
- 期望卡片类型：workout_plan
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：我已经为你生成了一份每周4练的增肌训练草案，但当前草案只包含1个动作（Incline_Inner_Biceps_Curl）。需要我扩展动作列表以覆盖全身主要肌群吗？请确认是否要先查看当前草案详情，或者我直接重新生成一个包含更多动作的完整草案。
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 缺少期望卡片类型：workout_plan；[P0] 出现未允许的卡片类型：answer
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises,generateRoutineDraft；toolResults=tool_result_368bb0fcdb4e10d28534e609,tool_result_c96554395692123cbf0d0863；candidateSetIds=candidate_set_368bb0fcdb4e10d28534e609；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbpnbg_h66lgk5p
- traceId：trace_mpvbpnbu_s06ej97d
- conversationId：manual-llm-F05-mpvbpeay-gv9tv8

### F06 长期计划语义区分 / 第 1 轮：第 1 轮：6 天训练计划

- 状态：失败
- 用户输入：给我一个6天训练计划
- 期望结果：应识别为长期 plan，而不是单次 routine。
- 期望卡片类型：workout_plan
- 实际卡片类型：blocked

- 实际 Agent status：blocked
- assistant 摘要：找不到已有的计划 artifact，无法为 6 天计划生成 plan draft。需先 clarify 用户目标、可用设备和现有训练基础。
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 缺少期望卡片类型：workout_plan；[P0] 出现未允许的卡片类型：blocked
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=blocked；tools=searchExercises,generatePlanDraft,getUserMemory；toolResults=tool_result_708c7ede40e8cf21d726cde5；candidateSetIds=candidate_set_cbcfc92ac5bb00900ab6b8a0,candidate_set_96f2246c0f0df0129f6d92c6,candidate_set_a3839cbdba34e02107eac0b9；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbpwff_u4xxex5z
- traceId：trace_mpvbpwgn_0a4r5gnj
- conversationId：manual-llm-F06-mpvbpwff-uz9kp7

### F06 长期计划语义区分 / 第 2 轮：第 2 轮：每周 6 练

- 状态：跳过
- 用户输入：改成每周6练
- 期望结果：应保持 plan 语义并切换周频率。
- 期望卡片类型：workout_plan
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F06", "flowName": "长期计划语义区分", "turnIndex": 1, "turnName": "第 1 轮：6 天训练计划", "userInput": "给我一个6天训练计划", "expectedCardTypes": [ "workout_plan" ], "actualCardTypes": [ "blocked" ], "conversationId": "manual-llm-...
- conversationId：manual-llm-F06-mpvbpwff-uz9kp7

### F06 长期计划语义区分 / 第 3 轮：第 3 轮：未来 6 天每天练

- 状态：跳过
- 用户输入：未来6天每天练
- 期望结果：应保持 plan 语义并表达明确日历范围。
- 期望卡片类型：workout_plan
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F06", "flowName": "长期计划语义区分", "turnIndex": 1, "turnName": "第 1 轮：6 天训练计划", "userInput": "给我一个6天训练计划", "expectedCardTypes": [ "workout_plan" ], "actualCardTypes": [ "blocked" ], "conversationId": "manual-llm-...
- conversationId：manual-llm-F06-mpvbpwff-uz9kp7

### F07 当前消息覆盖历史条件 / 第 1 轮：第 1 轮：记录器械条件

- 状态：通过
- 用户输入：我有哑铃
- 期望结果：只记录器械条件，不应推送训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：我已经根据你的哑铃设备，为你生成了一个哑铃全身训练计划。不过生成的草稿中只包含了一个动作（侧平举），看起来不太完整。让我为你进一步优化，增加更多动作。
- 卡片类型断言：passed
- 语义断言：passed
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises,generateRoutineDraft；toolResults=tool_result_d1cf2f8c4fc7ce5fa7ebf655,tool_result_f4ff34fe0391c88c02af2076；candidateSetIds=candidate_set_d1cf2f8c4fc7ce5fa7ebf655；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbq9mc_hvsiu9va
- traceId：trace_mpvbq9mn_4834n8q9
- conversationId：manual-llm-F07-mpvbq9mc-1xjbm1

### F07 当前消息覆盖历史条件 / 第 2 轮：第 2 轮：继承哑铃条件

- 状态：失败
- 用户输入：今天练胸30分钟
- 期望结果：应继承哑铃条件生成胸部 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：我刚刚为你生成了一份今日胸肌训练草稿，但草稿中只包含一个动作（侧平举），虽然侧平举主要练肩，其他胸部动作候选不足。不过你之前已经搜索了练胸动作且有哑铃，让我为你重新生成更合适的训练计划。请稍等，我马上优化。
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 缺少期望卡片类型：workout_routine；[P0] 出现未允许的卡片类型：answer
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises,generateRoutineDraft；toolResults=tool_result_efcc1180a371786241036358,tool_result_8a22ee9b527835cabf5e4191；candidateSetIds=candidate_set_efcc1180a371786241036358；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbqfce_f5mr8j7n
- traceId：trace_mpvbqfcq_f8rinci7
- conversationId：manual-llm-F07-mpvbq9mc-1xjbm1

### F07 当前消息覆盖历史条件 / 第 3 轮：第 3 轮：覆盖为不用器械

- 状态：跳过
- 用户输入：但今天不用器械
- 期望结果：当前消息应覆盖历史器械条件。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：第 2 轮失败：{ "flowId": "F07", "flowName": "当前消息覆盖历史条件", "turnIndex": 2, "turnName": "第 2 轮：继承哑铃条件", "userInput": "今天练胸30分钟", "expectedCardTypes": [ "workout_routine" ], "actualCardTypes": [ "answer" ], "conversationId": "manual-llm...
- conversationId：manual-llm-F07-mpvbq9mc-1xjbm1

### F13 非健身话题不触发训练流程 / 第 1 轮：第 1 轮：非健身问题

- 状态：通过
- 用户输入：明天天气怎么样？
- 期望结果：非健身问题不得触发训练卡片。
- 期望卡片类型：无训练卡片
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：我无法查询天气信息，因为我没有访问天气预报或外部数据源的能力。我是一个专注于健身的AI助手，只能提供健身相关的建议和帮助。如果需要查询天气，请使用专门的天气应用或服务。
- 卡片类型断言：passed
- 语义断言：passed
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbqo49_undjacpj
- traceId：trace_mpvbqo4v_69ah8ee5
- conversationId：manual-llm-F13-mpvbqo49-3dl1dv

### F13 非健身话题不触发训练流程 / 第 2 轮：第 2 轮：切回胸部训练

- 状态：失败
- 用户输入：那我今天练胸
- 期望结果：应重新进入健身流程并触发胸部推荐。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：好的，我们今天来练胸！根据你的需求，我找到了一个适合初学者的胸部训练动作：**超幅度单臂壶铃地板推举**（Extended Range One-Arm Kettlebell Floor Press）。这个动作主要锻炼胸部，同时也涉及肩部和肱三头肌，使用壶铃完成。 不过，我注意到候选列表中只有这个动作直接针对胸部，其他动作主要锻炼肩部或腹肌。如果你想组成一套完整的胸部训练，可能需要更多动作。请问你是否有特定的动作偏好？比如，你是否想加入杠...
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 缺少期望卡片类型：exercise_recommendation；[P0] 出现未允许的卡片类型：answer
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises；toolResults=tool_result_47754a622062dcaefc4fa92a；candidateSetIds=candidate_set_47754a622062dcaefc4fa92a；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbqpdd_xvjqn975
- traceId：trace_mpvbqpdn_j2ivn2l4
- conversationId：manual-llm-F13-mpvbqo49-3dl1dv

### F13 非健身话题不触发训练流程 / 第 3 轮：第 3 轮：升级 routine

- 状态：跳过
- 用户输入：做成20分钟
- 期望结果：应继承胸部目标升级为 20 分钟 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：第 2 轮失败：{ "flowId": "F13", "flowName": "非健身话题不触发训练流程", "turnIndex": 2, "turnName": "第 2 轮：切回胸部训练", "userInput": "那我今天练胸", "expectedCardTypes": [ "exercise_recommendation" ], "actualCardTypes": [ "answer" ], "conversationId": "ma...
- conversationId：manual-llm-F13-mpvbqo49-3dl1dv

### F15 明确引用最近卡片 / 第 1 轮：第 1 轮：胸部推荐卡片

- 状态：失败
- 用户输入：今天想练胸
- 期望结果：应生成胸部推荐卡片。
- 期望卡片类型：exercise_recommendation
- 实际卡片类型：answer

- 实际 Agent status：answered
- assistant 摘要：好的！我已经根据你的需求生成了一套今日胸肌训练草稿，包含一个动作：**上斜哑铃飞鸟（加扭转）**。但训练动作偏少，你是否希望我完善这套训练，增加更多胸部动作或调整细节？
- 卡片类型断言：failed
- 语义断言：passed
- 失败等级：P0
- 失败原因：[P0] 缺少期望卡片类型：exercise_recommendation；[P0] 出现未允许的卡片类型：answer
- artifact 诊断：recentSummaryCount=0；producedArtifact=false；payload=not_applicable；reference=not_applicable
- Agent 诊断：executionResult=true；status=answered；tools=searchExercises,generateRoutineDraft；toolResults=tool_result_be0953c84af661d627eda498,tool_result_3b04bf2658abd3b026fc3397；candidateSetIds=candidate_set_be0953c84af661d627eda498；dependencyGraph=true；legacyPathSkip={"intentFirst":true,"normalize":true,"summaryOnlyContext":true,"referenceResolverFirst":true}
- responseMessageId：assistant_mpvbqt37_45uruqlo
- traceId：trace_mpvbqt3p_yc4yuyzm
- conversationId：manual-llm-F15-mpvbqt37-mack61

### F15 明确引用最近卡片 / 第 2 轮：第 2 轮：引用最近卡片升级

- 状态：跳过
- 用户输入：把它变成20分钟训练
- 期望结果：“它”应解析为最近推荐并生成 routine。
- 期望卡片类型：workout_routine
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F15", "flowName": "明确引用最近卡片", "turnIndex": 1, "turnName": "第 1 轮：胸部推荐卡片", "userInput": "今天想练胸", "expectedCardTypes": [ "exercise_recommendation" ], "actualCardTypes": [ "answer" ], "conversationId": "manual-...
- conversationId：manual-llm-F15-mpvbqt37-mack61

### F15 明确引用最近卡片 / 第 3 轮：第 3 轮：解释第一个动作

- 状态：跳过
- 用户输入：第一个动作怎么做
- 期望结果：应解释最近卡片或 routine 中的第一个动作，不重新推荐一批动作。
- 期望卡片类型：无训练卡片
- 实际卡片类型：无训练卡片


- assistant 摘要：未请求真实模型。
- 卡片类型断言：skipped
- 语义断言：skipped
- 跳过原因：首轮基础能力失败：{ "flowId": "F15", "flowName": "明确引用最近卡片", "turnIndex": 1, "turnName": "第 1 轮：胸部推荐卡片", "userInput": "今天想练胸", "expectedCardTypes": [ "exercise_recommendation" ], "actualCardTypes": [ "answer" ], "conversationId": "manual-...
- conversationId：manual-llm-F15-mpvbqt37-mack61
