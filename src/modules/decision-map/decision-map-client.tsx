import { useEffect, useState } from 'react'
import { useServerFn } from '@tanstack/react-start'

import {
  readDecisionMapServer,
  recordDecisionMapChoiceServer,
  recordDecisionMapConstraintChangeServer,
} from './decision-map.functions'
import type { DecisionMapChoiceInput, DecisionMapConstraintChangeInput, DecisionMapSnapshot } from './public'
import type { DecisionMapMutationServerResult } from './decision-map.functions'

export type DecisionMapMutationResult = DecisionMapMutationServerResult
export type DecisionMapChoiceResult = DecisionMapMutationResult
export type DecisionMapConstraintChangeResult = DecisionMapMutationResult

export type DecisionMapReadState = Readonly<
  | { status: 'loading'; snapshot?: undefined; message?: undefined; certainty?: undefined }
  | { status: 'empty'; snapshot?: undefined; message?: undefined; certainty?: undefined }
  | { status: 'ready'; snapshot: DecisionMapSnapshot; message?: undefined; certainty?: undefined }
  | { status: 'error'; snapshot?: undefined; message: string; certainty: 'definite' | 'ambiguous' }
>

export type DecisionMapActions = Readonly<{
  recordChoice: (input: DecisionMapChoiceInput) => Promise<DecisionMapChoiceResult>
  recordConstraintChange: (input: DecisionMapConstraintChangeInput) => Promise<DecisionMapConstraintChangeResult>
}>


export function useDecisionMapActions(): DecisionMapActions {
  const recordChoiceServer = useServerFn(recordDecisionMapChoiceServer)
  const recordConstraintChangeServer = useServerFn(recordDecisionMapConstraintChangeServer)
  return {
    recordChoice: async (input): Promise<DecisionMapChoiceResult> => await recordChoiceServer({ data: input }) as DecisionMapChoiceResult,
    recordConstraintChange: async (input): Promise<DecisionMapConstraintChangeResult> => await recordConstraintChangeServer({ data: input }) as DecisionMapConstraintChangeResult,
  }
}

export type DecisionMapReadback = DecisionMapReadState & DecisionMapActions & Readonly<{ retry: () => void }>

export function useDecisionMap(threadId: string | undefined): DecisionMapReadback {
  const readServer = useServerFn(readDecisionMapServer)
  const actions = useDecisionMapActions()
  const [state, setState] = useState<DecisionMapReadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (threadId === undefined || threadId.trim().length === 0) {
      setState({ status: 'empty' })
      return
    }
    let active = true
    setState({ status: 'loading' })
    void readServer({ data: { threadId } }).then((snapshot) => {
      if (!active) return
      setState(snapshot === null ? { status: 'empty' } : { status: 'ready', snapshot })
    }).catch((error: unknown) => {
      if (!active) return
      setState({ status: 'error', certainty: errorCertainty(error), message: errorMessage(error) })
    })
    return () => {
      active = false
    }
  }, [attempt, readServer, threadId])

  return { ...state, ...actions, retry: () => setAttempt((current) => current + 1) }
}

function errorCertainty(error: unknown): 'definite' | 'ambiguous' {
  const value = error instanceof Error ? error.message.toLowerCase() : ''
  return value.includes('not found') || value.includes('invalid') || value.includes('missing') ? 'definite' : 'ambiguous'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return 'The decision map could not be loaded right now.'
}
