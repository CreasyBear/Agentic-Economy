import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { findOwnerActiveMarketDemand, getOwnerMarketDemandStatus, recordOwnerMarketDemand, withdrawOwnerMarketDemand, type OwnerMarketDemandStatusResult } from '@/modules/market-demand/market-demand.functions'
import type { MarketRequestScope } from '@/modules/market-demand/request-identity'

type NeedStatus = Extract<OwnerMarketDemandStatusResult, { kind: 'open' | 'matched' }>
type NeedState = Readonly<{ key: string; phase: 'loading' | 'ready' | 'saving' | 'withdrawing'; record?: NeedStatus; requestRef?: string; error?: string; withdrawn?: boolean }>

/** Results remain bound to the authenticated owner and exact query/filter scope. */
export function useMarketSavedNeed(input: MarketRequestScope, owner: string | undefined) {
  const key = JSON.stringify([owner, input])
  const currentKey = useRef(key)
  const inputRef = useRef(input)
  useLayoutEffect(() => { currentKey.current = key; inputRef.current = input }, [key, input])
  const [state, setState] = useState<NeedState>({ key, phase: 'loading' })
  const sequence = useRef(0)
  const intent = useRef<{ key: string; idempotencyKey: string } | undefined>(undefined)
  const known = useRef<{ key: string; requestRef: string } | undefined>(undefined)
  const pending = useRef(new Set<string>())
  const publish = useCallback((target: string, next: Omit<NeedState, 'key'>) => {
    if (currentKey.current === target) {
      if (next.withdrawn) known.current = undefined
      setState({ key: target, ...(known.current?.key === target ? { requestRef: known.current.requestRef } : {}), ...next })
    }
  }, [])
  const lookup = useCallback(async () => {
    if (owner === undefined) return
    const target = key, generation = ++sequence.current
    publish(target, { phase: 'loading' })
    try {
      let requestRef = known.current?.key === target ? known.current.requestRef : undefined
      if (requestRef === undefined) {
        const found = await findOwnerActiveMarketDemand({ data: inputRef.current })
        if (currentKey.current !== target || sequence.current !== generation) return
        if (found.kind === 'error') { publish(target, { phase: 'ready', error: 'Saved need status is unavailable. Try again.' }); return }
        if (found.kind === 'not_found') { publish(target, { phase: 'ready' }); return }
        requestRef = found.request.requestRef
        known.current = { key: target, requestRef }
      }
      const result = await getOwnerMarketDemandStatus({ data: { requestRef } })
      if (currentKey.current !== target || sequence.current !== generation) return
      if (result.kind === 'not_found') { known.current = undefined; intent.current = undefined }
      publish(target, result.kind === 'open' || result.kind === 'matched' ? { phase: 'ready', record: result }
        : result.kind === 'not_found' ? { phase: 'ready' } : { phase: 'ready', error: 'Saved need status is unavailable. Try again.' })
    } catch { if (sequence.current === generation) publish(target, { phase: 'ready', error: 'Saved need status is unavailable. Try again.' }) }
  }, [key, owner, publish])
  useEffect(() => { void lookup(); return () => { sequence.current += 1 } }, [lookup])
  const shown: NeedState = state.key === key ? state : { key, phase: 'loading' }
  async function save() {
    if (owner === undefined || shown.phase !== 'ready' || shown.error !== undefined || shown.record !== undefined || pending.current.has(key)) return
    const target = key, generation = ++sequence.current
    pending.current.add(target)
    const command = intent.current?.key === target ? intent.current : { key: target, idempotencyKey: crypto.randomUUID() }
    intent.current = command
    publish(target, { phase: 'saving' })
    try {
      const result = await recordOwnerMarketDemand({ data: { ...inputRef.current, idempotencyKey: command.idempotencyKey } })
      if (currentKey.current !== target || sequence.current !== generation) return
      if (result.kind === 'refused') { publish(target, { phase: 'ready', error: result.code === 'current_match_exists' ? 'A Tool now matches this need. Search again.' : 'This need could not be saved. Check status before retrying.' }); return }
      known.current = { key: target, requestRef: result.requestRef }
      const status = await getOwnerMarketDemandStatus({ data: { requestRef: result.requestRef } })
      if (currentKey.current !== target || sequence.current !== generation) return
      publish(target, status.kind === 'open' || status.kind === 'matched' ? { phase: 'ready', record: status }
        : { phase: 'ready', error: 'The need was saved, but its current status is unavailable. Check status.' })
    } catch { if (sequence.current === generation) publish(target, { phase: 'ready', error: 'Saving could not be confirmed. Check status before retrying.' }) }
    finally { pending.current.delete(target) }
  }
  async function withdraw() {
    const record = shown.record
    const requestRef = shown.requestRef
    if (owner === undefined || requestRef === undefined || shown.phase !== 'ready' || pending.current.has(key)) return
    const target = key, generation = ++sequence.current
    pending.current.add(target)
    publish(target, { phase: 'withdrawing', ...(record === undefined ? {} : { record }) })
    try {
      const result = await withdrawOwnerMarketDemand({ data: { requestRef } })
      if (currentKey.current !== target || sequence.current !== generation) return
      if (result.kind === 'withdrawn' || result.kind === 'not_found') { intent.current = undefined; publish(target, { phase: 'ready', withdrawn: true }) }
      else publish(target, { phase: 'ready', ...(record === undefined ? {} : { record }), error: 'This need could not be withdrawn. Try again.' })
    } catch { if (sequence.current === generation) publish(target, { phase: 'ready', ...(record === undefined ? {} : { record }), error: 'Withdrawal could not be confirmed. Check status.' }) }
    finally { pending.current.delete(target) }
  }
  return { ...shown, save, withdraw, lookup }
}
