import { describe, expect, it } from "vitest";

import {
  createBasicChatBlackboxRunOptionsFromEnv,
  runBasicChatBlackboxSuite,
} from "./basic-chat-runner";

const manualSuiteTimeoutMs = Number(process.env.MANUAL_LLM_BASIC_TIMEOUT_MS ?? 20 * 60 * 1000);

describe("manual basic homepage chat LLM blackbox suite", () => {
  it("validates final user-visible chat outputs against llm基础测试.md", { timeout: manualSuiteTimeoutMs }, async () => {
    const result = await runBasicChatBlackboxSuite(createBasicChatBlackboxRunOptionsFromEnv());

    if (result.exitCode !== 0) {
      console.error(`基础 LLM 黑盒套件失败，报告路径：${result.reportPath}`);
      for (const record of result.records.filter((item) => item.status !== "passed")) {
        console.error(`${record.flowId} 第 ${record.turnIndex} 轮：${record.failureReason ?? record.judge?.reason ?? record.status}`);
      }
    }

    expect(result.exitCode).toBe(0);
  });
});
