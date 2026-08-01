export const ENGINE_MODELS = {
  proposal: {
    models: [
      { id: 'deepseek/deepseek-v4-flash-0731', structuredOutputs: false },
      { id: 'openai/gpt-5.4-mini', structuredOutputs: true },
      { id: 'google/gemini-3.1-pro-preview', structuredOutputs: true },
    ],
  },
} as const
