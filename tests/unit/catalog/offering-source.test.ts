import { describe, expect, it } from 'vitest'
import { changeOfferingStatusInState, createOfferingInState, reviseOfferingInState, upsertAccessPathInState, withdrawAccessPathInState, type OfferingSourceState } from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'

const businessId = brandNonEmpty('business:meridian', 'BusinessId')
const offeringRef = brandNonEmpty('offering:subgraph-query', 'OfferingRef')
const authority = { actorRef: 'owner:1', ownerRef: 'owner:1', businessOwnerRef: 'owner:1' }
const facts = { name: 'Subgraph query', category: 'Data', summary: 'Query indexed blockchain data.' }
const empty: OfferingSourceState = { offerings: [], revisions: [], accessPaths: [], operations: [] }

describe('Offering source commands', () => {
  it('creates idempotently and refuses conflicting operation-key reuse', () => {
    const first = createOfferingInState(empty, { authority, operationKey: 'op:1', businessId, offeringRef, facts, now: 10 })
    expect(first.kind).toBe('ok')
    if (first.kind !== 'ok') return
    const replay = createOfferingInState(first.state, { authority, operationKey: 'op:1', businessId, offeringRef, facts, now: 10 })
    expect(replay).toMatchObject({ kind: 'ok', code: 'replayed', value: first.value })
    expect(createOfferingInState(first.state, { authority, operationKey: 'op:1', businessId, offeringRef, facts: { ...facts, name: 'Changed' }, now: 11 })).toMatchObject({ kind: 'error', code: 'operation_conflict' })
  })

  it('refuses a response-lost details replay after a newer revision before any later step can advance', () => {
    const created = createOfferingInState(empty, { authority, operationKey: 'baseline', businessId, offeringRef, facts, now: 1 })
    if (created.kind !== 'ok') throw new Error('fixture')
    const first = reviseOfferingInState(created.state, {
      authority,
      operationKey: 'request-a:details',
      offeringRef,
      expectedRevision: 1,
      facts: { ...facts, name: 'Request A details' },
      now: 2,
    })
    if (first.kind !== 'ok') throw new Error('fixture')
    const newer = reviseOfferingInState(first.state, {
      authority,
      operationKey: 'request-b:details',
      offeringRef,
      expectedRevision: 2,
      facts: { ...facts, name: 'Request B details' },
      now: 3,
    })
    if (newer.kind !== 'ok') throw new Error('fixture')
    const paused = changeOfferingStatusInState(newer.state, {
      authority,
      operationKey: 'request-b:status',
      offeringRef,
      expectedRevision: 3,
      status: 'paused',
      now: 4,
    })
    if (paused.kind !== 'ok') throw new Error('fixture')

    const replay = reviseOfferingInState(paused.state, {
      authority,
      operationKey: 'request-a:details',
      offeringRef,
      expectedRevision: 1,
      facts: { ...facts, name: 'Request A details' },
      now: 5,
    })

    expect(replay).toMatchObject({ kind: 'error', code: 'revision_conflict' })
    expect(replay.state).toBe(paused.state)
    expect(replay.state.offerings).toContainEqual(expect.objectContaining({ offeringRef, currentRevision: 3, status: 'paused' }))
    expect(replay.state.operations).toHaveLength(paused.state.operations.length)
  })

  it('requires source-bound authority and exact revisions', () => {
    expect(createOfferingInState(empty, { authority: { ownerRef: 'owner:1', businessOwnerRef: 'owner:1' }, operationKey: 'a', businessId, offeringRef, facts, now: 1 })).toMatchObject({ kind: 'error', code: 'unauthenticated' })
    const created = createOfferingInState(empty, { authority, operationKey: 'b', businessId, offeringRef, facts, now: 1 })
    if (created.kind !== 'ok') throw new Error('fixture')
    expect(reviseOfferingInState(created.state, { authority, operationKey: 'c', offeringRef, expectedRevision: 0, facts, now: 2 })).toMatchObject({ kind: 'error', code: 'revision_conflict' })
  })

  it('publishes with no access paths and later withdraws a website path', () => {
    const created = createOfferingInState(empty, { authority, operationKey: 'create', businessId, offeringRef, facts, now: 1 })
    if (created.kind !== 'ok') throw new Error('fixture')
    const published = changeOfferingStatusInState(created.state, { authority, operationKey: 'publish', offeringRef, expectedRevision: 1, status: 'published', now: 2 })
    expect(published).toMatchObject({ kind: 'ok', value: { status: 'published' } })
    if (published.kind !== 'ok') return
    const accessPathRef = brandNonEmpty('access:website', 'AccessPathRef')
    const added = upsertAccessPathInState(published.state, { authority, operationKey: 'add-path', offeringRef, accessPathRef, expectedRevision: 1, status: 'published', now: 3, descriptor: { kind: 'human_request', channel: 'website', disclosure: 'Request a quote', url: 'https://meridian.example/quote' } })
    expect(added.kind).toBe('ok')
    if (added.kind !== 'ok') return
    expect(withdrawAccessPathInState(added.state, { authority, operationKey: 'withdraw', accessPathRef, expectedRevision: 1, now: 4 })).toMatchObject({ kind: 'ok', value: { status: 'withdrawn' } })
  })

  it('rejects private website targets and makes retirement immutable', () => {
    const created = createOfferingInState(empty, { authority, operationKey: 'create', businessId, offeringRef, facts, now: 1 })
    if (created.kind !== 'ok') throw new Error('fixture')
    expect(upsertAccessPathInState(created.state, { authority, operationKey: 'bad', offeringRef, accessPathRef: brandNonEmpty('access:bad', 'AccessPathRef'), expectedRevision: 1, status: 'published', descriptor: { kind: 'human_request', channel: 'website', disclosure: 'Open', url: 'https://localhost/private' }, now: 2 })).toMatchObject({ kind: 'error', code: 'invalid_access_path' })
    expect(upsertAccessPathInState(created.state, { authority, operationKey: 'private', offeringRef, accessPathRef: brandNonEmpty('access:private', 'AccessPathRef'), expectedRevision: 1, status: 'published', descriptor: { kind: 'human_request', channel: 'website', disclosure: 'Open', url: 'https://192.168.1.5/private' }, now: 2 })).toMatchObject({ kind: 'error', code: 'invalid_access_path' })
    const retired = changeOfferingStatusInState(created.state, { authority, operationKey: 'retire', offeringRef, expectedRevision: 1, status: 'retired', now: 2 })
    if (retired.kind !== 'ok') throw new Error('fixture')
    expect(reviseOfferingInState(retired.state, { authority, operationKey: 'revise', offeringRef, expectedRevision: 1, facts, now: 3 })).toMatchObject({ kind: 'error', code: 'retired_immutable' })
  })
})
