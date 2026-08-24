import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getFunctionName } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { findAction, listOperationRouteDescriptors } from '@/modules/actions'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { OPERATION_MARKET_ACTION_ENTRIES } from '@/modules/registry/operation-entry'
import { api } from '../../../convex/_generated/api'
import {
  CURRENT_OPERATION_RELEASE_THRESHOLDS,
  EXPECTED_CLI_TARBALL_SHA256,
  OPERATION_ARCHITECTURE_WAVE_ROLLBACKS,
  operationReleaseSurfaceCanaries,
} from '../../../tools/release/operation-architecture-release-proof'

const expectedConvexPaths = [
  getFunctionName(api.capabilitySupplyOperations.search),
  getFunctionName(api.capabilitySupplyOperations.detail),
  getFunctionName(api.capabilitySupplyOperations.compare),
  getFunctionName(api.capabilitySupplyOperations.inspectPlan),
  getFunctionName(api.capabilitySupplyOperations.readKeylessExecutable),
  getFunctionName(api.capabilityOperationInvocations.invoke),
  getFunctionName(api.capabilityOperationInvocations.readInvocationStatus),
  getFunctionName(api.capabilityOperationInvocations.cancelInvocation),
  getFunctionName(api.capabilityOperationInvocations.reconcileInvocation),
]

describe('Operation architecture local release proof', () => {
  it('records every recovery class and observable trigger for each completed wave', () => {
    expect(OPERATION_ARCHITECTURE_WAVE_ROLLBACKS.map(({ wave }) => wave)).toEqual([
      'wave_0',
      'wave_1',
      'wave_2',
      'wave_3',
      'wave_4',
    ])
    for (const wave of OPERATION_ARCHITECTURE_WAVE_ROLLBACKS) {
      expect(Object.keys(wave.recovery).sort()).toEqual(['codeRedeploy', 'dataRepair', 'flagFlip'])
      expect(wave.recovery.codeRedeploy.availability).toBe('available')
      expect(wave.providerEffectShadowExecution).toBe(false)
      expect(wave.destructiveDownMigration).toBe(false)
      for (const recovery of Object.values(wave.recovery)) {
        if (recovery.availability === 'available') {
          expect(recovery.observableTrigger.trim().length).toBeGreaterThan(0)
          expect(recovery.action.trim().length).toBeGreaterThan(0)
        } else {
          expect(recovery.reason.trim().length).toBeGreaterThan(0)
        }
      }
    }
    const readModel = OPERATION_ARCHITECTURE_WAVE_ROLLBACKS.find(({ wave }) => wave === 'wave_2')
    expect(readModel?.recovery.flagFlip.availability).toBe('available')
    expect(readModel?.recovery.dataRepair.availability).toBe('available')
    expect(readModel?.recovery.flagFlip).toMatchObject({
      observableTrigger: expect.stringContaining('unexplained digest/typed-outcome mismatch'),
      action: expect.stringContaining('mode to old'),
    })
    expect(readModel?.recovery.dataRepair).toMatchObject({
      observableTrigger: expect.stringContaining('missing, stale, invalid, or orphan projection'),
      action: expect.stringContaining('idempotent current Operation rebuild/backfill'),
    })
  })

  it('canaries the stable browse, Call, status, and recovery surfaces without restating their contracts', () => {
    const canaries = operationReleaseSurfaceCanaries()
    expect(canaries.map(({ journeyStep }) => journeyStep)).toEqual([
      'search',
      'detail',
      'compare',
      'inspect_plan',
      'keyless_call',
      'authenticated_call',
      'status',
      'cancel',
      'reconcile',
    ])
    expect(canaries.map(({ actionId }) => actionId)).toEqual([
      ...OPERATION_MARKET_ACTION_ENTRIES.map(({ actionId }) => actionId),
      'operation.execute',
      OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
      OPERATION_INVOKE_ROUTE_CONTRACT.status.actionId,
      OPERATION_INVOKE_ROUTE_CONTRACT.cancel.actionId,
      OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.actionId,
    ])
    expect(canaries.map(({ convexFunctionPath }) => convexFunctionPath)).toEqual(expectedConvexPaths)
    const registeredRoutes = listOperationRouteDescriptors()
    for (const canary of canaries) {
      expect(findAction(canary.actionId), `${canary.actionId} must remain registered`).toBeDefined()
      if (canary.routePath !== undefined && canary.actionId.startsWith('operation.')) {
        expect(registeredRoutes).toContainEqual(expect.objectContaining({
          actionId: canary.actionId,
          path: canary.routePath,
        }))
      }
    }
    expect(canaries.find(({ journeyStep }) => journeyStep === 'keyless_call')?.surfaces).toEqual(['mcp', 'chat'])
    expect(canaries.find(({ journeyStep }) => journeyStep === 'authenticated_call')?.surfaces)
      .toEqual(['http', 'mcp', 'cli'])
  })

  it('pins the accepted benchmark, capacity, mismatch, and exact CLI artifact thresholds', () => {
    expect(CURRENT_OPERATION_RELEASE_THRESHOLDS).toEqual({
      twenty: { maximumP95Milliseconds: 19.9837, maximumDatabaseQueriesExclusive: 261 },
      twoHundredFiftySix: { maximumP95Milliseconds: 215.5186, maximumDatabaseQueriesExclusive: 3329 },
      maximumAcceptedSourceRows: 256,
      firstRefusedSourceRows: 257,
      maximumUnexplainedMismatchCount: 0,
    })
    expect(EXPECTED_CLI_TARBALL_SHA256).toBe(
      '109e14b023e883c72586825d8ba58d49766882dedd27d00dcb1a90158285c450',
    )
  })

  it('keeps the focused architecture gate in the credential-free source chain and the hosted gate opt-in', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts['test:release:source:after-codegen']).toContain(
      'npm run test:release:architecture',
    )
    expect(packageJson.scripts['test:release:architecture']).toContain(
      'tests/unit/release/operation-architecture-release-proof.test.ts',
    )
    expect(packageJson.scripts['test:release:architecture']).toContain(
      'tests/integration/current-operation-projection.test.ts',
    )
    expect(packageJson.scripts['test:release:architecture']).toContain(
      'tests/integration/current-operation-wave0.test.ts',
    )
    expect(packageJson.scripts['test:release:source:after-codegen']).not.toContain(
      'test:release:live-gateway',
    )
  })

  it('installs only the locked Chromium browser before the hosted source release suite', () => {
    const workflow = readFileSync(
      resolve(process.cwd(), '.github/workflows/kernel-release-gate.yml'),
      'utf8',
    )
    const sourceProofStart = workflow.indexOf('\n  source-proof:\n')
    const nextJobStart = workflow.indexOf('\n  chat-staging-proof:\n')
    expect(sourceProofStart).toBeGreaterThan(-1)
    expect(nextJobStart).toBeGreaterThan(sourceProofStart)

    const sourceProof = workflow.slice(sourceProofStart, nextJobStart)
    const frozenInstall = sourceProof.indexOf(
      '      - name: Frozen dependency install\n        run: npm ci',
    )
    const browserInstall = sourceProof.indexOf(
      '      - name: Install the source-proof Chromium browser\n' +
        '        run: npm exec -- playwright install --with-deps chromium',
    )
    const sourceRelease = sourceProof.indexOf(
      '      - name: Run source release contract without deployment credentials\n' +
        '        run: npm run test:release:source:after-codegen',
    )

    expect(frozenInstall).toBeGreaterThan(-1)
    expect(browserInstall).toBeGreaterThan(frozenInstall)
    expect(sourceRelease).toBeGreaterThan(browserInstall)
    expect(sourceProof.match(/playwright install/g)).toHaveLength(1)
  })
})
