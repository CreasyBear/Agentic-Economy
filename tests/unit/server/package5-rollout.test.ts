import { describe, expect, it } from 'vitest'

import {
  package5RolloutDecision,
  package5SupplyActionRolloutDecision,
} from '@/lib/server/package5-rollout'

describe('Package 5 rollout declaration', () => {
  it.each([undefined, '', ' production ', 'Production', 'sandbox'])(
    'refuses writes despite explicit true flags when declaration is %j', (declaration) => {
      const environment = {
        AE_DEPLOYMENT_ENVIRONMENT: declaration,
        AE_PACKAGE5_WRITES_ENABLED: 'true',
        AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: 'true',
        AE_SUPPLY_MCP_OAUTH_ENABLED: 'true',
        AE_PROVIDER_OFFBOARDING_ENABLED: 'true',
      }
      expect(package5RolloutDecision('writes', environment)).toEqual({
        enabled: false, code: 'package5_writes_disabled',
      })
      expect(package5RolloutDecision('httpCredentials', environment)).toEqual({
        enabled: false, code: 'package5_writes_disabled',
      })
    },
  )

  it('defaults all capabilities on only for an exact development declaration', () => {
    const environment = { AE_DEPLOYMENT_ENVIRONMENT: 'development', NODE_ENV: 'production' }
    for (const capability of ['writes', 'httpCredentials', 'mcpOAuth', 'providerOffboarding'] as const) {
      expect(package5RolloutDecision(capability, environment)).toEqual({ enabled: true })
    }
    expect(package5RolloutDecision('writes', {
      ...environment, AE_PACKAGE5_WRITES_ENABLED: 'false',
    })).toEqual({ enabled: false, code: 'package5_writes_disabled' })
  })

  it('requires production switches and keeps independent disabled codes', () => {
    const environment = { AE_DEPLOYMENT_ENVIRONMENT: 'production', NODE_ENV: 'development' }
    expect(package5RolloutDecision('writes', environment)).toEqual({
      enabled: false, code: 'package5_writes_disabled',
    })
    const writesEnabled = { ...environment, AE_PACKAGE5_WRITES_ENABLED: 'true' }
    expect(package5RolloutDecision('httpCredentials', writesEnabled)).toEqual({
      enabled: false, code: 'supply_http_credentials_disabled',
    })
    expect(package5RolloutDecision('mcpOAuth', writesEnabled)).toEqual({
      enabled: false, code: 'supply_mcp_oauth_disabled',
    })
    expect(package5RolloutDecision('providerOffboarding', writesEnabled)).toEqual({
      enabled: false, code: 'provider_offboarding_disabled',
    })
    expect(package5RolloutDecision('httpCredentials', {
      ...writesEnabled, AE_SUPPLY_HTTP_CREDENTIALS_ENABLED: 'true',
    })).toEqual({ enabled: true })
  })

  it('keeps readback and revocation actions outside the write gate', () => {
    const environment = { AE_PACKAGE5_WRITES_ENABLED: 'true' }
    expect(package5SupplyActionRolloutDecision('supply.connection.revoke', {}, environment))
      .toEqual({ enabled: true })
    expect(package5SupplyActionRolloutDecision('supply.status', {}, environment))
      .toEqual({ enabled: true })
    expect(package5SupplyActionRolloutDecision('supply.connection.connect', {
      kind: 'http_credential',
    }, environment)).toEqual({ enabled: false, code: 'package5_writes_disabled' })
  })
})
