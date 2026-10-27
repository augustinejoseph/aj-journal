import { it, expect, vi, afterEach } from "vitest";
import { generate, diaryPrompt } from "../lib/ai";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
import { beforeEach } from "vitest";
beforeEach(() => vi.stubEnv("OPENROUTER_API_KEY", "test-key"));
it("reports missing configuration", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  await expect(generate("source", "model")).rejects.toThrow(
    "API key is missing",
  );
});
it("passes source material separately and validates output", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "A day",
                body: "I felt uncertain.",
                tags: ["life"],
              }),
            },
          },
        ],
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  expect((await generate("ഇന്ന് I felt uncertain", "test/model")).body).toBe(
    "I felt uncertain.",
  );
  const payload = JSON.parse(fetch.mock.calls[0][1].body);
  expect(payload.messages[1].content).toBe("ഇന്ന് I felt uncertain");
  expect(payload.messages[0].content).toBe(diaryPrompt);
  expect(payload.provider).toEqual({ require_parameters: true });
  expect(payload.response_format).toMatchObject({
    type: "json_schema",
    json_schema: {
      strict: true,
      schema: { required: ["title", "body", "tags"] },
    },
  });
});
it("rejects malformed output without fabricating a fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"title":"fake"}' } }],
        }),
      ),
    ),
  );
  await expect(generate("source", "model")).rejects.toThrow();
});
it("makes provider failures retryable and retains source upstream", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 429 })),
  );
  await expect(generate("source", "model")).rejects.toThrow(
    "Source transcript is safe",
  );
});

it("logs provider diagnostics without exposing the key or source", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "Insufficient credits test-key private-source" },
          }),
          {
            status: 402,
            headers: { "x-request-id": "provider-request" },
          },
        ),
      ),
    );
    await expect(
      generate("private-source", "test/model", {
        entryId: "entry-id",
        modelSource: "database",
      }),
    ).rejects.toThrow("credits are exhausted");
    expect(error).toHaveBeenCalledWith(
      "[journal:openrouter] provider failure",
      expect.objectContaining({
        status: 402,
        providerRequestId: "provider-request",
        entryId: "entry-id",
        modelSource: "database",
        providerMessage:
          "Insufficient credits [redacted key] [redacted transcript]",
      }),
    );
    const logs = JSON.stringify([info.mock.calls, error.mock.calls]);
    expect(logs).not.toContain("test-key");
    expect(logs).not.toContain("private-source");
  } finally {
    info.mockRestore();
    error.mockRestore();
  }
});

it("reports plain-text safety output without exposing it in the error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "safety-model",
          choices: [{ message: { content: "User Safety: safe" } }],
        }),
      ),
    ),
  );
  await expect(generate("private source", "openrouter/free")).rejects.toThrow(
    "Writing provider returned an invalid diary response",
  );
});
