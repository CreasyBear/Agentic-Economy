import { describe, expect, it } from 'vitest'

import {
  assemblePersonalDataExport,
  excludedPersonalDataSection,
  type PersonalDataExportSources,
} from './personal-data-export'

const personal = {
  contract: 'ae.personal-account.export:v1' as const,
  exportedAt: Date.parse('2026-09-22T01:02:03.000Z'),
  principal: {
    principalRef: 'prn_11111111111111111111111111111111',
    kind: 'human',
    lifecycle: 'active',
    displayName: 'Alex Owner',
  },
  memberships: [{
    membershipRef: 'mem_11111111111111111111111111111111',
    accountRef: 'acc_11111111111111111111111111111111',
    lifecycle: 'active',
    revision: 2,
    createdAt: 1,
  }],
  ownerships: [{
    ownershipRef: 'own_11111111111111111111111111111111',
    accountRef: 'acc_22222222222222222222222222222222',
    lifecycle: 'active',
    revision: 3,
    createdAt: 2,
  }],
  linkedAccounts: [{
    accountRef: 'acc_11111111111111111111111111111111',
    displayName: 'Example Account',
    lifecycle: 'active',
  }],
  sessionSelection: {
    activeAccountRef: 'acc_11111111111111111111111111111111',
    selectedAt: 3,
    revision: 1,
  },
  notificationPreferences: [{
    accountRef: 'acc_11111111111111111111111111111111',
    lowCreditBalance: true,
    lowCreditThresholdCents: 2500,
    spendCapWarning: true,
    callFailureSpike: true,
    invoiceReady: true,
    teamMembershipChanged: true,
    revision: 4,
    updatedAt: 4,
  }],
  securityHistory: [{
    eventRef: 'evt_1',
    eventType: 'session.created',
    actorKind: 'human',
    actorRef: 'prn_11111111111111111111111111111111',
    targetType: 'principal',
    targetRef: 'prn_11111111111111111111111111111111',
    outcome: 'recorded',
    sourceSystem: 'clerk',
    recordedAt: 5,
    correlationRef: 'corr_1',
  }],
}

function sources(overrides: Partial<PersonalDataExportSources> = {}): PersonalDataExportSources {
  return {
    personal,
    taxProfile: { kind: 'available', rows: [] },
    agentConnections: { kind: 'available', rows: [] },
    calls: { kind: 'available', rows: [] },
    invoices: { kind: 'available', rows: [] },
    ...overrides,
  }
}

describe('assemblePersonalDataExport', () => {
  it('produces the account export manifest from caller-readable records', () => {
    const result = assemblePersonalDataExport(sources())

    expect(result).toMatchObject({
      exportedAt: '2026-09-22T01:02:03.000Z',
      account: {
        principalRef: personal.principal.principalRef,
        displayName: 'Alex Owner',
        activeAccountRef: personal.sessionSelection.activeAccountRef,
      },
      sections: {
        workspaceProfile: personal.linkedAccounts,
        notificationPreferences: personal.notificationPreferences,
        securityHistory: personal.securityHistory,
      },
    })
    expect(result.sections.memberships).toEqual([
      expect.objectContaining({ access: 'member', accountRef: personal.memberships[0]?.accountRef }),
      expect.objectContaining({ access: 'owner', accountRef: personal.ownerships[0]?.accountRef }),
    ])
  })

  it('records a section exclusion instead of inventing unavailable records', () => {
    const result = assemblePersonalDataExport(sources({
      calls: excludedPersonalDataSection('The existing per-account Calls read was unavailable.'),
    }))

    expect(result.sections.calls).toEqual({
      excluded: 'The existing per-account Calls read was unavailable.',
    })
    expect(Object.keys(result.sections)).toEqual([
      'workspaceProfile',
      'memberships',
      'notificationPreferences',
      'taxProfile',
      'agentConnections',
      'securityHistory',
      'calls',
      'invoices',
    ])
  })

  it('never projects credential material into the export', () => {
    const result = assemblePersonalDataExport(sources({
      agentConnections: {
        kind: 'available',
        rows: [{
          principalRef: 'prn_agent',
          displayName: 'Invoice Agent',
          applicationRef: 'app_invoice',
          environment: 'production',
          status: 'connected',
          admissionLifecycle: 'active',
          authorityMode: 'spending_policy',
          scopes: ['market:read'],
          lastSeenAt: 6,
        }],
      },
    }))

    expect(JSON.stringify(result)).not.toMatch(/secret|token|key/i)
  })
})
