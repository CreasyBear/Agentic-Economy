/**
 * Proposal fallbacks are ordered by measured wall-clock latency on a full
 * decision-map authoring prompt (2026-08-01): `gpt-5.4-mini` 8.7s,
 * `gemini-3.1-pro-preview` 27.4s. `deepseek-v4-flash-0731` was dropped at
 * 62.1s per attempt — it consumed the whole role budget on its own while
 * still failing decision-map invariants, so it bought latency and nothing else.
 *
 * `structuredOutputs` selects OpenRouter's strict `json_schema` response
 * format. Gemini rejects that format for this schema ("Request contains an
 * invalid argument"), so it is driven through coarse JSON mode with the schema
 * carried in the prompt, and it needs reasoning left enabled ("Reasoning is
 * mandatory for this endpoint and cannot be disabled").
 */
export const ENGINE_MODELS = {
  proposal: {
    models: [
      { id: 'openai/gpt-5.4-mini', structuredOutputs: true, excludeReasoning: false },
      { id: 'google/gemini-3.1-pro-preview', structuredOutputs: false, excludeReasoning: false },
    ],
  },
} as const
