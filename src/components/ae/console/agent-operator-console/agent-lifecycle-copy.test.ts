import { describe, expect, it } from 'vitest'

import {
  lifecycleConfirmLabel,
  lifecycleDialogDescription,
  lifecycleDialogTitle,
  lifecycleFailureTriplet,
  lifecycleSuccessToast,
} from './agent-lifecycle-copy'

describe('agent-lifecycle-copy', () => {
  it('titles each lifecycle kind', () => {
    expect(lifecycleDialogTitle(undefined)).toBe('Change agent access?')
    expect(lifecycleDialogTitle({
      kind: 'connection',
      connectionRef: 'conn',
      revision: 1,
      connectorName: 'Codex',
      name: 'Agent A',
    })).toBe('Disconnect Codex from Agent A?')
    expect(lifecycleDialogTitle({
      kind: 'agent',
      principalRef: 'prn_test',
      name: 'Agent A',
    })).toBe('Remove Agent A everywhere?')
  })

  it('labels plain confirm actions per lifecycle kind', () => {
    expect(lifecycleConfirmLabel('agent')).toBe('Remove agent')
    expect(lifecycleConfirmLabel('connection')).toBe('Disconnect connection')
  })

  it('returns per-kind success toasts and failure triplets', () => {
    expect(lifecycleSuccessToast('connection')).toBe('Connection disconnected')
    expect(lifecycleSuccessToast('agent')).toBe('Agent access revoked')
    expect(lifecycleFailureTriplet('connection').whatHappened).toBe('Could not disconnect this connection.')
    expect(lifecycleFailureTriplet('agent').whatHappened).toBe('Could not revoke agent access.')
  })

  it('keeps connection body copy scoped to the connector', () => {
    const description = lifecycleDialogDescription({
      kind: 'connection',
      connectionRef: 'conn',
      revision: 2,
      connectorName: 'Codex',
      name: 'Route assistant',
    })
    expect(description).toContain('Other connections for Route assistant remain usable')
  })
})
