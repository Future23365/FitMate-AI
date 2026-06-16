# Minimal Example

## round-001-input 摘要

```json
{
  "runId": "shadow-2026-06-16-1554-demo",
  "roundId": "round-001",
  "messages": [
    {
      "role": "user",
      "content": "今天我想练胸，给我几个动作"
    }
  ],
  "tools": [
    {
      "name": "searchExerciseResources"
    }
  ]
}
```

## round-001-decision 示例

```json
{
  "runId": "shadow-2026-06-16-1554-demo",
  "roundId": "round-001",
  "decision": "call_tool",
  "toolName": "searchExerciseResources",
  "toolInput": {
    "suitabilities": ["training"],
    "executionProfile": "no_equipment",
    "muscles": ["胸部"],
    "muscleMatchRole": "primary"
  },
  "finalAnswer": null,
  "evidence": [
    {
      "source": "messages",
      "path": "$.messages[0].content",
      "summary": "用户要求具体胸部训练动作。"
    },
    {
      "source": "tools",
      "path": "$.tools[1].description",
      "summary": "需要展示具体数据库动作条目时，应先查询动作候选事实。"
    }
  ],
  "fieldRationale": [
    {
      "path": "$.toolInput.muscles",
      "source": "messages",
      "reason": "胸部来自用户明确目标。"
    }
  ],
  "missingFacts": [],
  "contractConcerns": [],
  "contaminationAudit": {
    "usedOnlyShadowInput": true,
    "suspectedExternalKnowledge": [],
    "notes": []
  }
}
```
