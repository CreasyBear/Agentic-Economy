import { createContext, use, type ReactNode } from 'react'

import type { AnswerModel, AnswerModelSelectorData } from '@/modules/answer/public'

type AeAnswerModelContextValue = {
  enabled: boolean
  loading: boolean
  modelsByProvider: AnswerModelSelectorData['modelsByProvider']
  selectedModel: AnswerModel | null
  selectedModelId: string
  setSelectedModelId: (modelId: string) => void
}

const AeAnswerModelContext = createContext<AeAnswerModelContextValue | null>(null)

export type AeAnswerModelProviderProps = {
  children: ReactNode
}

export function AeAnswerModelProvider({ children }: AeAnswerModelProviderProps) {
  return <AeAnswerModelContext.Provider value={disabledModelContext}>{children}</AeAnswerModelContext.Provider>
}

export function useAnswerModel(): AeAnswerModelContextValue {
  const context = use(AeAnswerModelContext)
  if (context === null) {
    return disabledModelContext
  }
  return context
}

const disabledModelContext: AeAnswerModelContextValue = Object.freeze({
  enabled: false,
  loading: false,
  modelsByProvider: {},
  selectedModel: null,
  selectedModelId: '',
  setSelectedModelId: () => undefined,
})
