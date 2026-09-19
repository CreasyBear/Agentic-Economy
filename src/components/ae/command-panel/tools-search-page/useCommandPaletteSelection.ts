'use client'

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'

import {
  NO_MOUNTED_CHOICE_VALUE,
  type MarketToolSearchStatus,
  type ToolSearchChoice,
} from './tools-search-page.contracts'

type PendingSelectionIntent = Readonly<{
  query: string
  edge: 'start' | 'end'
  offset: number
  activate: boolean
}>

type UseCommandPaletteSelectionOptions = Readonly<{
  isActive: boolean
  trimmedQuery: string
  choices: readonly ToolSearchChoice[]
  isAwaitingChoices: boolean
  toolChoiceValues: readonly string[]
  navChoiceValues: readonly string[]
  quickChoiceValues: readonly string[]
  choiceValues: readonly string[]
  choiceValuesKey: string
  inputRef: RefObject<HTMLInputElement | null>
  status: MarketToolSearchStatus
  onSelectTool: (toolRef: string) => void
  onQueryInputChange: (query: string) => void
}>

export function useCommandPaletteSelection({
  isActive,
  trimmedQuery,
  choices,
  isAwaitingChoices,
  toolChoiceValues,
  navChoiceValues,
  quickChoiceValues,
  choiceValues,
  choiceValuesKey,
  inputRef,
  status,
  onSelectTool,
  onQueryInputChange,
}: UseCommandPaletteSelectionOptions): Readonly<{
  selectedValue: string
  handleSelectedValueChange: (nextValue: string) => void
  handleKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  handleQueryInputChange: (nextQuery: string) => void
  clearPendingIntent: () => void
}> {
  const [selectedValue, setSelectedValue] = useState('')
  const selectedValueRef = useRef('')
  const pendingSelectionIntentRef = useRef<PendingSelectionIntent | null>(null)
  const latestLiveQueryRef = useRef(trimmedQuery)

  useEffect(() => {
    if (trimmedQuery !== '' && trimmedQuery !== latestLiveQueryRef.current) return
    latestLiveQueryRef.current = trimmedQuery
    if (pendingSelectionIntentRef.current?.query === trimmedQuery) return
    pendingSelectionIntentRef.current = null
  }, [trimmedQuery])

  useEffect(() => {
    if (!isActive) {
      pendingSelectionIntentRef.current = null
      return
    }
    if (status.kind === 'error' && status.tone === 'alert') {
      if (pendingSelectionIntentRef.current?.query === trimmedQuery) {
        pendingSelectionIntentRef.current = null
      }
      return
    }
    if (!('query' in status) || status.query !== trimmedQuery) return
    if (status.kind === 'error' && status.tone === 'recovery') {
      if (pendingSelectionIntentRef.current?.query === trimmedQuery) {
        pendingSelectionIntentRef.current = null
      }
      return
    }
    if (status.kind === 'empty') {
      if (pendingSelectionIntentRef.current?.query === trimmedQuery) {
        pendingSelectionIntentRef.current = null
      }
      return
    }
    if (status.kind !== 'success') return
    if (status.items.length === 0) {
      if (pendingSelectionIntentRef.current?.query === trimmedQuery) {
        pendingSelectionIntentRef.current = null
      }
      return
    }

    const intent = pendingSelectionIntentRef.current
    if (intent?.query !== trimmedQuery) return
    const lastIndex = status.items.length - 1
    const nextIndex = intent.edge === 'start'
      ? Math.min(lastIndex, intent.offset)
      : Math.max(0, lastIndex - intent.offset)
    const selected = status.items[nextIndex]
    pendingSelectionIntentRef.current = null
    if (selected === undefined) return
    selectedValueRef.current = selected.toolRef
    setSelectedValue(selected.toolRef)
    if (!intent.activate) return
    onSelectTool(selected.toolRef)
  }, [isActive, onSelectTool, status, trimmedQuery])

  useEffect(() => {
    if (isActive) inputRef.current?.focus()
  }, [isActive, inputRef])

  useEffect(() => {
    const nextChoiceValues = choiceValuesKey === '' ? [] : choiceValuesKey.split('\u001f')
    setSelectedValue(() => {
      if (nextChoiceValues.length === 0) return NO_MOUNTED_CHOICE_VALUE
      const nextValue = nextChoiceValues.includes(selectedValueRef.current)
        ? selectedValueRef.current
        : (nextChoiceValues[0] ?? '')
      selectedValueRef.current = nextValue
      return nextValue
    })
  }, [choiceValuesKey])

  function clearPendingIntent(): void {
    pendingSelectionIntentRef.current = null
  }

  function consumeNavigationKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
  }

  function preparePendingIntent(liveQuery: string): PendingSelectionIntent {
    const currentIntent = pendingSelectionIntentRef.current
    if (currentIntent?.query === liveQuery) return currentIntent
    const nextIntent: PendingSelectionIntent = {
      query: liveQuery,
      edge: 'start',
      offset: 0,
      activate: false,
    }
    pendingSelectionIntentRef.current = nextIntent
    return nextIntent
  }

  function updatePendingIntent(
    liveQuery: string,
    update: (intent: PendingSelectionIntent) => PendingSelectionIntent,
  ): void {
    pendingSelectionIntentRef.current = update(preparePendingIntent(liveQuery))
  }

  function handleQueryInputChange(nextQuery: string): void {
    latestLiveQueryRef.current = nextQuery.trim()
    pendingSelectionIntentRef.current = null
    onQueryInputChange(nextQuery)
  }

  function handleSelectedValueChange(nextValue: string): void {
    if (!choiceValues.includes(nextValue)) return
    selectedValueRef.current = nextValue
    setSelectedValue(nextValue)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const liveQuery = inputRef.current?.value.trim() ?? trimmedQuery
    const choicesMatchLiveQuery = liveQuery === trimmedQuery
    const liveChoices = choicesMatchLiveQuery ? choices : []
    const awaitingLiveChoices = liveQuery !== '' && (
      !choicesMatchLiveQuery
      || isAwaitingChoices
    )
    switch (event.key) {
      case 'Tab': {
        const groups: string[][] = []
        if (navChoiceValues.length > 0) groups.push([...navChoiceValues])
        if (quickChoiceValues.length > 0) groups.push([...quickChoiceValues])
        if (toolChoiceValues.length > 0) groups.push([...toolChoiceValues])

        if (groups.length > 1) {
          event.preventDefault()
          const currentGroupIndex = groups.findIndex((group) => group.includes(selectedValue))
          const direction = event.shiftKey ? -1 : 1
          const nextGroupIndex = currentGroupIndex === -1
            ? (direction === 1 ? 0 : groups.length - 1)
            : (currentGroupIndex + direction + groups.length) % groups.length

          const targetValue = groups[nextGroupIndex]?.[0]
          if (targetValue) {
            pendingSelectionIntentRef.current = null
            selectedValueRef.current = targetValue
            setSelectedValue(targetValue)
          }
        }
        break
      }
      case 'ArrowDown': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          offset: intent.edge === 'start' ? intent.offset + 1 : 0,
        }))
        break
      }
      case 'ArrowUp': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          offset: intent.edge === 'start' ? Math.max(0, intent.offset - 1) : intent.offset + 1,
        }))
        break
      }
      case 'Home': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          edge: 'start',
          offset: 0,
        }))
        break
      }
      case 'End': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          edge: 'end',
          offset: 0,
        }))
        break
      }
      case 'Enter': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({ ...intent, activate: true }))
        break
      }
      default:
        break
    }
  }

  return {
    selectedValue,
    handleSelectedValueChange,
    handleKeyDown,
    handleQueryInputChange,
    clearPendingIntent,
  }
}
