import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { AnswerModel, AnswerModelSelectorData } from '@/modules/answer/public'
import { readStoredAnswerModelId, writeStoredAnswerModelId } from '@/modules/answer/model-selection-storage'

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
  const [data, setData] = useState<AnswerModelSelectorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedModelId, setSelectedModelIdState] = useState('')

  useEffect(() => {
    let cancelled = false

    void fetch('/api/chat/models')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('models_unavailable')
        }
        return (await response.json()) as AnswerModelSelectorData
      })
      .then((payload) => {
        if (cancelled) return
        setData(payload)
        const stored = readStoredAnswerModelId()
        const nextId =
          stored !== null && modelExists(payload, stored) ? stored : payload.selectedModelId
        setSelectedModelIdState(nextId)
        if (nextId.length > 0) {
          writeStoredAnswerModelId(nextId)
        }
      })
      .catch(() => {
        if (cancelled) return
        setData({
          enabled: false,
          modelsByProvider: {},
          selectedModelId: '',
          hasAvailableModels: false,
        })
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const flatModels = useMemo(() => flattenModels(data?.modelsByProvider ?? {}), [data?.modelsByProvider])

  const selectedModel = useMemo(() => {
    if (selectedModelId.length === 0) {
      return null
    }
    return flatModels.find((model) => model.id === selectedModelId) ?? null
  }, [flatModels, selectedModelId])

  function setSelectedModelId(modelId: string) {
    setSelectedModelIdState(modelId)
    writeStoredAnswerModelId(modelId)
  }

  const value = useMemo(
    (): AeAnswerModelContextValue => ({
      enabled: data?.enabled === true && data.hasAvailableModels,
      loading,
      modelsByProvider: data?.modelsByProvider ?? {},
      selectedModel,
      selectedModelId,
      setSelectedModelId,
    }),
    [data, loading, selectedModel, selectedModelId],
  )

  return <AeAnswerModelContext.Provider value={value}>{children}</AeAnswerModelContext.Provider>
}

export function useAnswerModel(): AeAnswerModelContextValue {
  const context = use(AeAnswerModelContext)
  if (context === null) {
    return {
      enabled: false,
      loading: false,
      modelsByProvider: {},
      selectedModel: null,
      selectedModelId: '',
      setSelectedModelId: () => undefined,
    }
  }
  return context
}

function flattenModels(modelsByProvider: AnswerModelSelectorData['modelsByProvider']): AnswerModel[] {
  return Object.values(modelsByProvider).flat()
}

function modelExists(data: AnswerModelSelectorData, modelId: string): boolean {
  return flattenModels(data.modelsByProvider).some((model) => model.id === modelId)
}
