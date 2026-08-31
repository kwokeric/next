import Anthropic from "@anthropic-ai/sdk";

// Identity-linked API keys (issued under an org with identity federation
// enabled) are workspace-scoped — the SDK doesn't send that header on its
// own, so requests 400 without it.
export const anthropic = new Anthropic({
  defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
    ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID }
    : undefined,
});

export async function generateSubtasks(
  title: string,
  description?: string | null
): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          `Break this task down into 3-6 smaller, concrete, immediately actionable subtasks.`,
          `Task: "${title}"`,
          description ? `Additional context: ${description}` : null,
          `Each subtask should break the initial task down into smaller, more manageable pieces.`,
          `Try to keep tasks to around 10-15 words.`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            subtasks: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["subtasks"],
          additionalProperties: false,
        },
      },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  const parsed = JSON.parse(textBlock.text) as { subtasks: string[] };
  return parsed.subtasks;
}
