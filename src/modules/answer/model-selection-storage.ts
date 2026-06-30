export const ANSWER_MODEL_STORAGE_KEY = 'ae.selectedModel'

export function readStoredAnswerModelId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const value = window.localStorage.getItem(ANSWER_MODEL_STORAGE_KEY)?.trim()
    return value !== undefined && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function writeStoredAnswerModelId(modelId: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(ANSWER_MODEL_STORAGE_KEY, modelId)
  } catch {
    // Ignore quota / privacy mode failures.
  }
}
