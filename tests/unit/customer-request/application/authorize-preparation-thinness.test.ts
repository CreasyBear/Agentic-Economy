import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const portsSource = readFileSync('convex/customerRequestAuthorizePreparationPorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/authorize-preparation'
const preparationEgressRoot = 'src/modules/customer-request/application/preparation-egress'

const movedSymbols = [
  'authorizePreparation',
] as const

describe('customer-request authorize-preparation thinness', () => {
  it('does not redefine moved authorize helpers as local host functions', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps thin Convex authorizePreparation adapter that delegates through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('authorizePreparation as authorizePreparationApplication')
    expect(convexHost).toContain('authorizePreparationPorts')
    expect(convexHost).toMatch(/export const authorizePreparation\s*=/)

    const authorizeStart = convexHost.indexOf('export const authorizePreparation = action({')
    expect(authorizeStart).toBeGreaterThanOrEqual(0)
    const authorizeEnd = convexHost.indexOf('\nasync function interpretCompileCommit', authorizeStart)
    expect(authorizeEnd).toBeGreaterThan(authorizeStart)
    const authorizeBody = convexHost.slice(authorizeStart, authorizeEnd)
    expect(authorizeBody).toContain('authorizePreparationApplication')
    expect(authorizeBody).toContain('authorizePreparationPorts')
    expect(authorizeBody).toContain('ctx.auth.getUserIdentity')
    expect(authorizeBody).toContain('namespacedKey')
    expect(authorizeBody).toContain('canonicalDigest')
    expect(authorizeBody).toContain('toActionResult')
    expect(authorizeBody).not.toContain('loadCurrent(')
    expect(authorizeBody).not.toContain('getAgentPrincipal')
    expect(authorizeBody).not.toContain('customerRequestV2Preparation.prepare')
    expect(authorizeBody).not.toContain('runPreparationEgress(')
    expect(authorizeBody).not.toContain('preparationResultView')
    expect(authorizeBody).not.toContain('ownsDirectRequest')
    expect(authorizeBody.split('\n').length).toBeLessThanOrEqual(35)
  })

  it('wires prepare and ownership only through authorize-preparation ports', () => {
    expect(portsSource).toContain('getAgentPrincipal')
    expect(portsSource).toContain('customerRequestV2Preparation.prepare')
    expect(portsSource).toContain('preparationEgressPorts')
    expect(portsSource).not.toMatch(/compileCustomerRequest/)
    expect(portsSource).not.toMatch(/createConfiguredRequestInterpreter/)
    expect(portsSource).not.toMatch(/journal/)
    expect(portsSource).not.toMatch(/withdraw/)
  })

  it('keeps authorize-preparation free of Convex runtime and dual compilers', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/compileCustomerRequest/)
      expect(source).not.toMatch(/createConfiguredRequestInterpreter/)
      expect(source).not.toMatch(/customerRequestRouteMandate/)
      expect(source).not.toMatch(/compileRouteMandate/)
      expect(source).not.toMatch(/exportState/)
      expect(source).not.toMatch(/\bwithdraw\b/)
      expect(source).not.toMatch(/journal/)
    }
  })

  it('re-exports authorize-preparation through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './authorize-preparation'")
    expect(publicSource).toContain('authorizePreparation')
    expect(publicSource).toContain('AuthorizePreparationPorts')
    expect(publicSource).toContain('AuthorizePreparationInput')
  })

  it('composes preparation-egress instead of folding into it', () => {
    const authorizeSource = readFileSync(`${moduleRoot}/authorize.ts`, 'utf8')
    expect(authorizeSource).toContain("from '../preparation-egress'")
    expect(authorizeSource).toContain('runPreparationEgress')
    expect(authorizeSource).toContain('preparationResultView')
    for (const file of listTsFiles(preparationEgressRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/authorizePreparation/)
      expect(source).not.toMatch(/AuthorizePreparationPorts/)
      expect(source).not.toMatch(/getAgentPrincipal/)
    }
  })

  it('does not export use-prefixed authorize helpers', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+use[A-Z]/)
      expect(source).not.toMatch(/export\s+\{[^}]*\buse[A-Z]/)
    }
  })
})


