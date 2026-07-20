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
  it('has no hosted paid-operation production lifecycle before Plan 02', () => {
    const hostedProduction = production.filter((path) =>
      /hosted-paid-operation|hostedPaidOperation/u.test(`${path}\n${readFileSync(path, 'utf8')}`))
    expect(hostedProduction).toEqual([])
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

  it('keeps Sandbox setup out of canonical routes and shared card logic in Plan 01', () => {
    const violations = production.filter((path) =>
      /\/actions\/paid\/new|Sandbox setup/u.test(readFileSync(path, 'utf8')))
    expect(violations).toEqual([])
  })
})
