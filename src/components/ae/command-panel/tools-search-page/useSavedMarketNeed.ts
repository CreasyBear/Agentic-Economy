import { useEffect, useRef, useState } from 'react'
import { degrade } from '@/lib/observability/degrade'
import {
  getOwnerMarketDemandStatus,
  findOwnerActiveMarketDemand,
  recordOwnerMarketDemand,
  withdrawOwnerMarketDemand,
  type OwnerMarketDemandStatusResult,
} from '@/modules/market-demand/market-demand.functions'

type SavedMarketNeedOptions = Readonly<{
  isSignedIn: boolean | undefined
  saveNeed: Readonly<{ query: string }> | undefined
  statusKind: string
  statusQuery: string | undefined
}>

export function useSavedMarketNeed({ isSignedIn, saveNeed, statusKind, statusQuery }: SavedMarketNeedOptions) {
  const [savedNeed, setSavedNeed] = useState<Extract<OwnerMarketDemandStatusResult, { kind: 'open' | 'matched' }>>()
  const [checkedNeedQuery, setCheckedNeedQuery] = useState<string>()
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const saveIntent = useRef<{ query: string; key: string } | undefined>(undefined)

  useEffect(() => {
    if (!isSignedIn || saveNeed === undefined || statusKind !== 'empty' || statusQuery !== saveNeed.query) {
      setCheckedNeedQuery(undefined)
      setSavedNeed(undefined)
      setSaveError(undefined)
      return
    }
    let current = true
    setCheckedNeedQuery(undefined)
    setSavedNeed(undefined)
    void (async () => {
      try {
        const found = await findOwnerActiveMarketDemand({ data: { query: saveNeed.query } })
        if (!current) return
        if (found.kind === 'error') {
          setSaveError('Saved needs are unavailable. Try again.')
          return
        }
        if (found.kind === 'not_found') {
          setCheckedNeedQuery(saveNeed.query)
          return
        }
        const currentStatus = await getOwnerMarketDemandStatus({ data: { requestRef: found.request.requestRef } })
        if (!current) return
        if (currentStatus.kind === 'open' || currentStatus.kind === 'matched') {
          setSavedNeed(currentStatus)
          setCheckedNeedQuery(saveNeed.query)
        } else if (currentStatus.kind === 'not_found') {
          saveIntent.current = undefined
          setCheckedNeedQuery(saveNeed.query)
        } else setSaveError('Saved need status is unavailable. Try again.')
      } catch (cause) {
        if (current) setSaveError(degrade(cause, 'Saved needs are unavailable. Try again.', { site: 'toolsSearch.savedNeed.lookup', reason: 'source_unavailable' }))
      }
    })()
    return () => { current = false }
  }, [isSignedIn, saveNeed, statusKind, statusQuery])

  async function saveCurrentNeed() {
    if (!isSignedIn || saveNeed === undefined || saveBusy || checkedNeedQuery !== saveNeed.query) return
    const intent = saveIntent.current?.query === saveNeed.query
      ? saveIntent.current
      : { query: saveNeed.query, key: globalThis.crypto.randomUUID() }
    saveIntent.current = intent
    setSaveBusy(true)
    setSaveError(undefined)
    try {
      const result = await recordOwnerMarketDemand({ data: { query: intent.query, idempotencyKey: intent.key } })
      if (saveIntent.current !== intent) return
      if (result.kind === 'recorded' || result.kind === 'replayed') {
        const currentStatus = await getOwnerMarketDemandStatus({ data: { requestRef: result.requestRef } })
        if (saveIntent.current !== intent) return
        if (currentStatus.kind === 'open' || currentStatus.kind === 'matched') setSavedNeed(currentStatus)
        else if (currentStatus.kind === 'not_found') {
          saveIntent.current = undefined
          setSaveError('That saved need has expired. Save again to start a new request.')
        } else setSaveError('Saved, but status is unavailable. Try again.')
      } else if (result.kind === 'refused') {
        setSaveError(result.code === 'current_match_exists'
          ? 'A Tool now matches this need. Search again.'
          : result.code === 'unauthenticated'
            ? 'Sign in to save this need.'
            : 'This need could not be saved. Try again.')
      }
    } catch (cause) {
      if (saveIntent.current === intent) setSaveError(degrade(cause, 'This need could not be saved. Try again.', { site: 'toolsSearch.savedNeed.save', reason: 'source_unavailable' }))
    } finally {
      setSaveBusy(false)
    }
  }

  async function withdrawCurrentNeed() {
    if (savedNeed === undefined || saveBusy) return
    setSaveBusy(true)
    setSaveError(undefined)
    try {
      const result = await withdrawOwnerMarketDemand({ data: { requestRef: savedNeed.requestRef } })
      if (result.kind === 'withdrawn' || result.kind === 'not_found') {
        setSavedNeed(undefined)
        saveIntent.current = undefined
      } else setSaveError('This need could not be withdrawn. Try again.')
    } catch (cause) {
      setSaveError(degrade(cause, 'This need could not be withdrawn. Try again.', { site: 'toolsSearch.savedNeed.withdraw', reason: 'source_unavailable' }))
    } finally {
      setSaveBusy(false)
    }
  }

  return {
    savedNeed, checkedNeedQuery, saveBusy, saveError, saveCurrentNeed, withdrawCurrentNeed,
    clearSaveIntent: () => { saveIntent.current = undefined },
  }
}
