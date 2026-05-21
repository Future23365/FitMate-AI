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
当前项目还没有接入动作数据库，因此你不能声称已经保存计划或调用了真实动作库。`;
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
