import { useEffect, useRef, useState } from 'react'
import { degrade } from '@/lib/observability/degrade'
import type { ChatNeedActions, ChatSaveNeed } from '@/modules/chat/tool-card'

export function useNeedSaveAction(input: ChatSaveNeed, actions: ChatNeedActions | null) {
  const key = useRef<string | null>(null)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [requestRef, setRequestRef] = useState<string | null>(null)
  const [withdrawn, setWithdrawn] = useState(false)
  const [message, setMessage] = useState('')
  const [lookupState, setLookupState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [lookupAttempt, setLookupAttempt] = useState(0)
  const latestActions = useRef(actions)
  useEffect(() => { latestActions.current = actions }, [actions])
  const latestInput = useRef(input)
  useEffect(() => { latestInput.current = input }, [input])
  const scopeKey = JSON.stringify(input)

  useEffect(() => {
    const current = latestActions.current
    if (!current?.authenticated) {
      setRequestRef(null)
      setLookupState('checking')
      return
    }
    let active = true
    setLookupState('checking')
    void current.onFind(latestInput.current).then(result => {
      if (!active) return
      if (result.kind === 'found') {
        setRequestRef(result.request.requestRef)
        setWithdrawn(false)
      }
      setLookupState(result.kind === 'error' ? 'error' : 'ready')
    }).catch(cause => {
      if (!active) return
      setLookupState(degrade(cause, 'error' as const, { site: 'chatNeed.find', reason: 'source_unavailable' }))
    })
    return () => { active = false }
  }, [actions?.authenticated, scopeKey, lookupAttempt])

  async function save() {
    if (actions === null || lookupState !== 'ready' || inFlight.current
      || (requestRef !== null && !withdrawn)) return
    inFlight.current = true
    setBusy(true)
    setMessage('')
    try {
      const existing = await actions.onFind(input)
      if (existing.kind === 'found') {
        setRequestRef(existing.request.requestRef)
        setWithdrawn(false)
        setMessage('Need already saved.')
        return
      }
      if (existing.kind !== 'not_found') {
        setLookupState('error')
        setMessage('Could not check saved needs. Try again.')
        return
      }
      key.current ??= crypto.randomUUID()
      const result = await actions.onSave({ ...input, idempotencyKey: key.current })
      if (result.kind === 'refused') {
        setMessage(result.code === 'current_match_exists'
          ? 'A Tool now matches this search. Search again.'
          : 'Could not save this need. Retry or search again.')
      } else {
        setRequestRef(result.requestRef)
        setWithdrawn(false)
        setMessage('Need saved. Matching runs for 30 days.')
      }
    } catch (cause) {
      setMessage(degrade(cause, 'Could not save this need. Retry or search again.', { site: 'chatNeed.save', reason: 'source_unavailable' }))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function checkStatus() {
    if (actions === null || requestRef === null || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await actions.onStatus(requestRef)
      if (result.kind === 'open') setMessage('Need is open for matching.')
      else if (result.kind === 'matched') setMessage(`${result.matchedCount} matching Tools are available. Search the Market to inspect them.`)
      else setMessage('Could not check status. Try again.')
    } catch (cause) {
      setMessage(degrade(cause, 'Could not check status. Try again.', { site: 'chatNeed.status', reason: 'source_unavailable' }))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function withdraw() {
    if (actions === null || requestRef === null || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await actions.onWithdraw(requestRef)
      if (result.kind === 'withdrawn') {
        key.current = null
        setWithdrawn(true)
        setMessage('Need withdrawn.')
      } else setMessage('Could not withdraw this need. Try again.')
    } catch (cause) {
      setMessage(degrade(cause, 'Could not withdraw this need. Try again.', { site: 'chatNeed.withdraw', reason: 'source_unavailable' }))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { busy, requestRef, withdrawn, message, lookupState, save, checkStatus, withdraw, retry: () => setLookupAttempt(attempt => attempt + 1) }
}
