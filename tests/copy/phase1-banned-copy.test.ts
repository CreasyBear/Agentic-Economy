import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { findFiles, scanCopyClaims } from '@/lib/ui/contract-scans'

import { fixtureTargets, isFixtureMode } from '../imports/scan-targets'

const cleanCopyTargets = [
  { root: 'src/routes', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/components/ae', includeExtensions: ['.ts', '.tsx'] },
  { root: 'src/lib/ui/copy.ts', includeExtensions: ['.ts'] },
  { root: 'src/modules/catalog', includeExtensions: ['.ts'] },
  { root: 'src/modules/discovery', includeExtensions: ['.ts'] },
  { root: 'src/modules/seo', includeExtensions: ['.ts'] },
  { root: 'src/modules/answer/internal/boundary-prose.ts', includeExtensions: ['.ts'] },
  { root: 'src/modules/answer/internal/follow-up-compact-prose.ts', includeExtensions: ['.ts'] },
  { root: 'src/lib/seo', includeExtensions: ['.ts', '.tsx', '.json', '.md'] },
  { root: 'src/lib/schema', includeExtensions: ['.ts', '.tsx', '.json', '.md'] },
  { root: 'src/generated', includeExtensions: ['.ts', '.tsx', '.json', '.md'] },
  { root: 'public', includeExtensions: ['.html', '.json', '.md', '.txt', '.xml'] },
] as const

const paymentBoundaryCopyTargets = cleanCopyTargets

type PaymentBoundaryRule = {
  readonly rule: string
  readonly message: string
  readonly pattern: RegExp
}

type PaymentBoundaryViolation = {
  readonly file: string
  readonly rule: string
  readonly message: string
  readonly excerpt: string
}

const paymentBoundaryRules = [
  {
    rule: 'payment-processing-overclaim',
    message: 'Public copy cannot imply AE charges cards, processes payments, or handles customer money.',
    pattern:
      /\b(?:(?:AE|Agentic Economy|we|platform|service)\s+(?:charges?|takes?|collects?|process(?:es)?|handles?)\s+(?:payments?|card payments?|cards?|customer funds?|your money)|(?:charge|charges|charged|charging|take|takes|taking|collect|collects|collecting|process|processes|processing|handle|handles|handling)\s+(?:payments?|card payments?|cards?|customer funds?|your money))\b|(?:處理\s*(?:付款|支付|款項)|(?:付款|支付|款項)\s*處理)/i,
  },
  {
    rule: 'payment-custody-escrow-overclaim',
    message: 'Public copy cannot imply AE holds funds, escrow, or payment custody.',
    pattern:
      /\b(?:hold(?:s|ing)?\s+(?:your\s+)?(?:money|funds|customer funds)|(?:money|funds|customer funds)\s+(?:are\s+)?held|funds held in escrow|escrow|custody|custodial)\b/i,
  },
  {
    rule: 'pci-compliance-overclaim',
    message: 'Public copy cannot claim PCI or card-data compliance on AE human surfaces.',
    pattern: /\b(?:PCI(?:[-\s]?DSS)?\s+compliant|PCI\s+compliance|SAQ[-\s]?A\s+compliant|card data compliant)\b/i,
  },
  {
    rule: 'verified-payment-overclaim',
    message: 'Public copy cannot claim verified, guaranteed, or assured payments.',
    pattern: /\b(?:verified payments?|payment verified|guaranteed payments?|payment guarantee|payment assurance)\b/i,
  },
  {
    rule: 'booking-dispatch-overclaim',
    message: 'Public copy cannot imply AE books, dispatches, or fulfils work.',
    pattern:
      /\b(?:book(?:s|ing)?\s+(?:and\s+)?dispatch(?:es)?|book,?\s*charge,?\s*(?:and\s*)?dispatch|dispatch(?:es|ed|ing)?\s+(?:a|the|your)?\s*(?:business|provider|job|technician|tradie|pro|team))\b/i,
  },
  {
    rule: 'instant-payout-overclaim',
    message: 'Public copy cannot imply instant or guaranteed payouts.',
    pattern: /\b(?:instant payouts?|payouts?\s+(?:are\s+)?(?:instant|guaranteed|available|live|ready|enabled)|guaranteed payouts?|merchant payouts?|seller payouts?)\b/i,
  },
  {
    rule: 'public-epistemic-label',
    message: 'Public human copy cannot expose internal epistemic labels.',
    pattern: /\b(?:KNOWN|UNKNOWN|UNAVAILABLE|NEXT_STEP)\b/,
  },
] as const satisfies readonly PaymentBoundaryRule[]

const paymentBoundaryInlineOverclaims = [
  {
    rule: 'payment-processing-overclaim',
    copy: 'AE processes payments for you and 處理付款 after the customer approves.',
  },
  {
    rule: 'payment-custody-escrow-overclaim',
    copy: 'Funds held in escrow by AE keep your money safe until the provider finishes.',
  },
  {
    rule: 'pci-compliance-overclaim',
    copy: 'Agentic Economy is PCI compliant for card payments.',
  },
  {
    rule: 'verified-payment-overclaim',
    copy: 'Every provider gets guaranteed payment and verified payments from AE.',
  },
  {
    rule: 'booking-dispatch-overclaim',
    copy: 'We book and dispatch the provider after the customer chooses a business.',
  },
  {
    rule: 'instant-payout-overclaim',
    copy: 'Providers receive instant payout from every customer inquiry.',
  },
  {
    rule: 'public-epistemic-label',
    copy: 'KNOWN provider match. UNKNOWN price. NEXT_STEP send payment.',
  },
] as const

const paymentBoundarySafeCopyExamples = [
  'Send a message to the business for owner review.',
  'The business reviews your inquiry and decides whether to reply.',
  'AE does not book, charge, dispatch, hold money, process payments, or guarantee payouts.',
  'Payments, booking, dispatch, PCI compliance, escrow, custody, and instant payouts remain unavailable.',
] as const

const boundaryHonestPaymentContextPattern =
  /\b(?:doesNotItems|does not|do not|doesn'?t|cannot|can't|never|no|not|without|unavailable|deferred|out of scope|outside|remain(?:s)? unavailable|stay(?:s)? out|future|currently not|not live|not available|not supported)\b/i

describe('Phase 1 public copy guardrail', () => {
  it('rejects unsupported owner/public capability claims', () => {
    const violations = scanCopyClaims(
      isFixtureMode() ? fixtureTargets('tests/fixtures/bad-copy') : cleanCopyTargets
    )

    if (isFixtureMode()) {
      expect(violations.map((violation) => violation.rule)).toEqual(
        expect.arrayContaining([
          'payment-or-booking-overclaim',
          'agent-action-overclaim',
          'marketplace-trust-overclaim',
          'p2-inquiry-overclaim',
          'p2-notification-provider-overclaim',
          'p3-read-only-discovery-overclaim',
          'p3-developer-platform-overclaim',
          'p4-protected-action-overclaim',
          'p4-autonomous-action-overclaim',
          'p5-paid-activation-overclaim',
          'p5-money-rail-overclaim',
          'p6-business-action-overclaim',
          'p6-autonomous-money-marketplace-overclaim',
        ])
      )
      return
    }

    expect(violations).toEqual([])
  })
  it.each(paymentBoundaryInlineOverclaims)('rejects payment-boundary overclaim: $rule', ({ copy, rule }) => {
    const violations = findPaymentBoundaryViolations([
      { root: 'public-copy/payment-boundary-overclaim.fixture', content: copy },
    ])

    expect(violations.map((violation) => violation.rule)).toContain(rule)
  })

  it.each(paymentBoundarySafeCopyExamples)('allows boundary-honest payment copy: %s', (copy) => {
    expect(findPaymentBoundaryViolations([{ root: 'public-copy/payment-boundary-safe.fixture', content: copy }])).toEqual([])
  })

  it('keeps public human copy free of payment custody, PCI, payout, dispatch, and epistemic-label overclaims', () => {
    const violations = findPaymentBoundaryViolations(paymentBoundaryCopyTargets)

    expect(violations).toEqual([])
  })
})


function findPaymentBoundaryViolations(
  targets: readonly { readonly root: string; readonly content?: string; readonly includeExtensions?: readonly string[] }[],
): readonly PaymentBoundaryViolation[] {
  return targets.flatMap((target) => {
    const files =
      target.content === undefined
        ? findFiles([{ root: target.root, ...(target.includeExtensions === undefined ? {} : { includeExtensions: target.includeExtensions }) }])
        : [target.root]

    return files.flatMap((file) => {
      const content = target.content ?? readFileSync(file, 'utf8')

      return scanPaymentBoundaryContent(file, content)
    })
  })
}

function scanPaymentBoundaryContent(file: string, content: string): readonly PaymentBoundaryViolation[] {
  const lines = content.split('\n')

  return lines.flatMap((line, index) => {
    const context = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)).join('\n')

    return line
      .split(/[.;]+|\bbut\b|\bwhile\b|\bwhereas\b/i)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .flatMap((excerpt) => {
        if (boundaryHonestPaymentContextPattern.test(`${context}\n${excerpt}`)) {
          return []
        }

        return paymentBoundaryRules.flatMap((rule) => {
          if (!rule.pattern.test(excerpt)) {
            return []
          }

          return [{ file, rule: rule.rule, message: rule.message, excerpt }]
        })
      })
  })
}

