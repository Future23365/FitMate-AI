import { NextResponse } from "next/server";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type DeepSeekStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
};

const SYSTEM_PROMPT = `你是 FitMate AI，一个中文 AI 健身聊天助手。
你的职责是理解用户的健身目标、训练条件、时间安排和限制，并给出安全、可执行的训练建议。
如果用户描述疼痛、伤病、疾病、孕期或高风险健康情况，你必须提醒其咨询医生或专业人士，不能做医疗诊断。

如果你在对话中判定用户具有明确的“定制/生成/安排/制定训练计划”的意图，且你已经通过对话基本了解了（或合理默认推断了）他们的意图画像，你必须在你的自然语言回复结尾，**单独以一个 \`\`\`json 开头和结尾的代码块形式**，输出一个专属的 Trigger 对象用于智能触发后台计划生成。
这个代码块必须格式严格如下：
\`\`\`json
{
  "type": "workout_plan_trigger",
  "intent": {
    "intentType": "plan", // 只能是 "plan" | "routine" 之一。如果用户只是想要一份单次的动作编排/动作组/动作列表（类似术语），判定为 "routine"；如果用户是想制定一个整体的、长期的、或者周/月的健身计划，判定为 "plan"
    "goal": "用户的核心健身目标，如：胸肌增肌、全身减脂、提升心肺、力量提升等，中文描述",
    "experience": "beginner", // 只能是 "beginner" | "intermediate" | "advanced" 之一，默认 "beginner"
    "sessionMinutes": 45, // 单次训练时长，整数，单位分钟，默认 30
    "weeklyFrequency": 3, // 每周训练频次，整数，默认 3
    "equipment": ["dumbbell"], // 可用器械列表，如：none(自重), dumbbell(哑铃), barbell(杠铃), machine(固定器械)等，中文描述。若无限制默认为 ["none"]
    "injuryLimitations": [], // 疼痛或伤病限制，如 ["膝盖疼痛", "手腕不适"]。若无则为空数组
    "preferences": [], // 用户偏好，如 ["居家训练", "高强度"]。若无则为空数组
    "avoidances": [] // 用户希望避开的动作或部位，如 ["深蹲", "下肢"]。若无则为空数组
  }
}
\`\`\`

注意：
1. Trigger JSON 块必须紧跟在您自然的文字回复之后，**单独成行输出**，必须确保其 JSON 格式合法。
2. 如果用户描述包含任何严重的高风险健康情况（如胸痛、心脏病、心梗、晕厥、孕期、骨折、刚做完手术等），请在正文自然语言回复中予以极力警告并强烈建议其就医，**绝对不要**输出此 Trigger JSON 代码块。`;
const DEEPSEEK_REQUEST_TIMEOUT_MS = 45_000;
const LOG_PREVIEW_LENGTH = 4000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as Partial<ChatMessage>;

  return (
    (maybeMessage.role === "user" || maybeMessage.role === "assistant") &&
    typeof maybeMessage.content === "string" &&
    maybeMessage.content.trim().length > 0
  );
}

function encodeStreamEvent(type: string, delta = "") {
  return new TextEncoder().encode(`${JSON.stringify({ type, delta })}\n`);
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPSEEK_API_KEY environment variable." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: unknown;
    thinkingEnabled?: unknown;
  } | null;

  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json(
      { error: "Request body must include a messages array." },
      { status: 400 },
    );
  }

  const messages = body.messages.filter(isChatMessage).slice(-20);
  const thinkingEnabled = body.thinkingEnabled !== false;

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "At least one valid message is required." },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPSEEK_REQUEST_TIMEOUT_MS);
  let response: Response;

  console.info("[chat] deepseek_request", {
    model: "deepseek-v4-flash",
    messageCount: messages.length,
    thinkingEnabled,
    timeoutMs: DEEPSEEK_REQUEST_TIMEOUT_MS,
    payload: previewLogObject({
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      thinking: {
        type: thinkingEnabled ? "enabled" : "disabled",
      },
    }),
  });

  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
        thinking: {
          type: thinkingEnabled ? "enabled" : "disabled",
        },
      }),
    });
  } catch (error) {
    clearTimeout(timeout);
    console.warn("[chat] deepseek_failed", {
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "DeepSeek API request timed out."
          : "DeepSeek API request failed.",
      detail: error instanceof Error ? error.message : error,
    });

    return NextResponse.json(
      {
        error:
          error instanceof DOMException && error.name === "AbortError"
            ? "DeepSeek API request timed out."
            : "DeepSeek API request failed.",
      },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    clearTimeout(timeout);

    console.warn("[chat] deepseek_failed", {
      status: response.status,
      detail: errorText,
    });

    return NextResponse.json(
      {
        error: "DeepSeek API request failed.",
        detail: errorText,
      },
      { status: response.status },
    );
  }

  if (!response.body) {
    clearTimeout(timeout);
    console.warn("[chat] deepseek_failed", {
      status: 502,
      detail: "DeepSeek API returned an empty stream.",
    });

    return NextResponse.json(
      { error: "DeepSeek API returned an empty stream." },
      { status: 502 },
    );
  }

  console.info("[chat] deepseek_response", {
    status: response.status,
    contentType: response.headers.get("content-type"),
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let contentPreview = "";
      let reasoningPreview = "";

      if (!reader) {
        clearTimeout(timeout);
        controller.enqueue(encodeStreamEvent("error", "DeepSeek API returned an empty stream."));
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();

            if (!line.startsWith("data:")) {
              continue;
            }

            const data = line.replace(/^data:\s*/, "");

            if (data === "[DONE]") {
              clearTimeout(timeout);
              console.info("[chat] deepseek_stream_done", {
                content: previewLogText(contentPreview),
                reasoning: previewLogText(reasoningPreview),
              });
              controller.enqueue(encodeStreamEvent("done"));
              controller.close();
              return;
            }

            const chunk = JSON.parse(data) as DeepSeekStreamChunk;
            const delta = chunk.choices?.[0]?.delta;
            const reasoning = delta?.reasoning_content;
            const content = delta?.content;

            if (reasoning) {
              reasoningPreview += reasoning;
              controller.enqueue(encodeStreamEvent("reasoning", reasoning));
            }

            if (content) {
              contentPreview += content;
              controller.enqueue(encodeStreamEvent("content", content));
            }
          }
        }

        clearTimeout(timeout);
        console.info("[chat] deepseek_stream_done", {
          content: previewLogText(contentPreview),
          reasoning: previewLogText(reasoningPreview),
        });
        controller.enqueue(encodeStreamEvent("done"));
        controller.close();
      } catch (error) {
        clearTimeout(timeout);
        console.warn("[chat] deepseek_failed", {
          message:
            error instanceof DOMException && error.name === "AbortError"
              ? "DeepSeek API stream timed out."
              : "Failed to read DeepSeek stream.",
          detail: error instanceof Error ? error.message : error,
        });
        controller.enqueue(
          encodeStreamEvent(
            "error",
            error instanceof Error ? error.message : "Failed to read DeepSeek stream.",
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function previewLogObject(value: unknown) {
  const text = JSON.stringify(value);

  return previewLogText(text);
}

function previewLogText(value: string) {
  return value.length > LOG_PREVIEW_LENGTH ? `${value.slice(0, LOG_PREVIEW_LENGTH)}...` : value;
}
