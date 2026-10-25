import { it, expect, vi, afterEach } from "vitest";
import { generate, diaryPrompt } from "../lib/ai";
afterEach(() => vi.unstubAllGlobals());
it("passes source material separately and validates output", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
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
});
it("rejects malformed output without fabricating a fallback", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
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
