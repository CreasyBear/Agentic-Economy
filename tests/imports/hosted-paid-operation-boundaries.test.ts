import { globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const production = globSync(['src/**/*.ts', 'src/**/*.tsx', 'convex/**/*.ts']).sort()
const routesAndServers = production.filter((path) =>
  path.startsWith('src/routes/') || path.startsWith('src/lib/server/'))
const nonPaidActionModules = production.filter((path) =>
  path.startsWith('src/modules/')
  && !path.startsWith('src/modules/action-invocation/')
  && !path.startsWith('src/modules/capability-supply/'))

describe('Phase 3C hosted paid-operation ownership boundary', () => {
  it('keeps the Plan 02-05 hosted paid-operation surface inside its owned modules', () => {
    const hostedProduction = production.filter((path) =>
      /hosted-paid-operation|hostedPaidOperation|HostedPaidOperation/u
        .test(`${path}\n${readFileSync(path, 'utf8')}`))
    expect(hostedProduction).toEqual([
      'convex/hostedPaidOperation.ts',
      'convex/hostedPaidOperationGateway.ts',
      'src/components/ae/action-invocation/AePaidOperationCard.tsx',
      'src/lib/server/hosted-paid-operation-agent-api.ts',
      'src/lib/server/hosted-paid-operation-agent-auth.ts',
      'src/lib/server/hosted-paid-operation-human-api.ts',
      'src/lib/server/hosted-paid-operation-runtime.ts',
      'src/modules/action-invocation/hosted-paid-operation-composition.ts',
      'src/modules/action-invocation/hosted-paid-operation-creation.ts',
      'src/modules/action-invocation/hosted-paid-operation-payment-proposal.ts',
      'src/modules/action-invocation/hosted-paid-operation-port.ts',
      'src/modules/action-invocation/hosted-paid-operation-service-auth.ts',
      'src/modules/action-invocation/internal/convex-schema.ts',
      'src/modules/action-invocation/paid-operation-card-contract.ts',
      'src/routes/actions.paid.$invocationRef.tsx',
      'src/routes/actions.paid.new.tsx',
      'src/routes/api.v1.paid-operations.$invocationRef.commands.ts',
      'src/routes/api.v1.paid-operations.$invocationRef.ts',
      'src/routes/api.v1.paid-operations.ts',
    ])
  })

  it('keeps the client card contract server-free and operation-agnostic', () => {
    const sharedClient = [
      'src/components/ae/action-invocation/AePaidOperationCard.tsx',
      'src/modules/action-invocation/paid-operation-card-contract.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(sharedClient).not.toMatch(
      /from\s+['"][^'"]*(?:\/server\/|hosted-paid-operation-human-api|hosted-paid-operation-runtime)/u,
    )
    expect(sharedClient).not.toMatch(/\bBTC\b|\bcrypto\b|x402/u)
    expect(sharedClient).not.toMatch(
      /providerId\s*(?:===|!==|==|!=)|switch\s*\([^)]*providerId/u,
    )
  })

  it('keeps routes and server adapters above the paid-operation application seam', () => {
    const violations = routesAndServers.filter((path) =>
      /dynamic-published-adapter|x402-payment-|reconciliation-evidence|effectGeneration|executeAcquired/u
        .test(readFileSync(path, 'utf8')))
    expect(violations).toEqual([])
  })

  it('keeps non-paid action classes from importing paid-operation semantics or panels', () => {
    const violations = nonPaidActionModules.filter((path) =>
      /from\s+['"][^'"]*(paid-operation-semantics|AePaidOperationCard|hosted-paid-operation)/u
        .test(readFileSync(path, 'utf8')))
    expect(violations).toEqual([])
  })

  it('keeps Sandbox setup confined to setup registration and the exact detail backlink', () => {
    const violations = production.filter((path) =>
      /\/actions\/paid\/new|Sandbox setup/u.test(readFileSync(path, 'utf8')))
    expect(violations).toEqual([
      'src/routeTree.gen.ts',
      'src/routes/actions.paid.$invocationRef.tsx',
      'src/routes/actions.paid.new.tsx',
    ])

    const detail = readFileSync('src/routes/actions.paid.$invocationRef.tsx', 'utf8')
    const exactBacklink =
      /<Link className="[^"]*" to="\/actions\/paid\/new">\s*Back to Sandbox setup\s*<\/Link>/u
    expect(detail).toMatch(exactBacklink)
    expect(detail.replace(exactBacklink, '')).not.toMatch(
      /\/actions\/paid\/new|Sandbox setup/u,
    )
  })
})
