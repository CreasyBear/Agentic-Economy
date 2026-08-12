import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import { render } from '@react-email/render'
import type { ReactElement } from 'react'
import { formatCurrencyAmount } from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'
import type { WorkTreeDecisionReceipt } from '../work-tree.functions'
import type { WorkTree } from './contract'
import { projectDecisionInbox, type DecisionInboxProjection } from './inbox-projection'
import { safeReadbackUrl } from './memo-notification'
import { rollupTree } from './rollup'
// Layout provenance: adapted from shadcn-labs/emailcn (MIT),
// https://raw.githubusercontent.com/shadcn-labs/emailcn/main/registry/bases/react-email/blocks/notification-default.tsx.
// The donor block was reachable through GitHub; this module keeps its
// container/section/row composition while using AE-owned content and no copied
// vendor code. License: https://raw.githubusercontent.com/shadcn-labs/emailcn/main/LICENSE
// React Email API citations: @react-email/components re-exports the layout
export type WeeklyMemoException = Readonly<{
  title: string
  detail: string
  severity?: 'info' | 'warning' | 'error'
}>

export type WeeklyMemoDecision = Readonly<{
  title: string
  detail?: string
  moneyYes?: boolean
}>

export type WeeklyMemoChange = Readonly<{
  title: string
  detail: string
}>

export type WeeklyMemoReceipt = Readonly<{
  title: string
  detail: string
  status: 'accepted' | 'replayed' | 'refused'
}>

export type WeeklyMemoNextAction = Readonly<{
  title: string
  detail: string
}>

export type WeeklyMemoData = Readonly<{
  title: string
  periodLabel: string
  nextDecision: string
  cost: Readonly<{
    committed: ExactAmount
    envelope: ExactAmount
  }>
  timingCriticalPathSummary: string
  effortMinutes: number
  scopeCoverage: Readonly<{
    accepted: number
    total: number
  }>
  exceptions: readonly WeeklyMemoException[]
  waitingDecisions?: readonly WeeklyMemoDecision[]
  changes?: readonly WeeklyMemoChange[]
  receipts?: readonly WeeklyMemoReceipt[]
  nextActions?: readonly WeeklyMemoNextAction[]
  readbackUrl?: string
}>

export type WorkTreeMemoEvent = Readonly<{
  kind: string
  operationKey: string
  seq: number
  generation: number
  revision: number
  at: number
}>

export type WorkTreeMemoProjectionInput = Readonly<{
  projectId: string
  revision: number
  tree: WorkTree
  events: readonly WorkTreeMemoEvent[]
  receipts: readonly WorkTreeDecisionReceipt[]
  inbox?: DecisionInboxProjection
  readbackUrl: string
  nowMs?: number
  title?: string
  periodLabel?: string
}>

/** Project source readback into the weekly memo without writing source state. */
export function projectWeeklyMemo(input: WorkTreeMemoProjectionInput): WeeklyMemoData {
  const rollup = rollupTree(input.tree)
  const nowMs = input.nowMs ?? Date.now()
  const inbox = projectDecisionInbox(input.tree, { nowMs })
  const currency = firstCurrency(rollup.cost.byCurrency)
  const criticalSchedule = rollup.timing.knownMinDays > 0
    ? rollup.timing.schedules.find((schedule) => schedule.isCritical)
    : undefined
  const criticalPath = criticalSchedule === undefined
    ? undefined
    : input.tree.nodes.find((node) => node.nodeId === criticalSchedule.nodeId)

  const pendingItems = inbox.items
  const waitingDecisions = pendingItems.map((item) => ({
    title: item.title,
    detail: item.requiresStepUp ? 'Review this exact consequence before Lock.' : 'Choose Lock, Adjust, or Park.',
    ...(item.moneyYes ? { moneyYes: true } : {}),
  }))
  const changes = input.events
    .slice()
    .sort((left, right) => left.seq - right.seq)
    .map((event) => ({
      title: eventTitle(event.kind),
      detail: `Revision ${event.revision} recorded at source event ${event.seq}.`,
    }))
  const receiptProjection = input.receipts.map((receipt) => ({
    title: `${receipt.decision} · ${receipt.nodeId}`,
    detail: receipt.kind === 'refused'
      ? `Refused: ${receipt.refusalCode}.`
      : `Revision ${receipt.revision} · ${receipt.disposition}.`,
    status: receipt.kind,
  }))
  const exceptions: readonly WeeklyMemoException[] = input.receipts.flatMap((receipt): readonly WeeklyMemoException[] => {
    if (receipt.kind !== 'refused') return []
    return [{
      title: `${receipt.decision} refused`,
      detail: `The source kept the WorkTree unchanged (${receipt.refusalCode}).`,
      severity: 'warning' as const,
    }]
  })
  const nextActions = pendingItems.map((item) => ({
    title: item.title,
    detail: item.requiresStepUp
      ? 'Review the exact consequence and approve this item.'
      : 'Review the current proposal and choose an exit.',
  }))
  return {
    title: input.title ?? 'Your WorkTree weekly memo',
    periodLabel: input.periodLabel ?? `Week ending ${new Date(nowMs).toISOString().slice(0, 10)}`,
    nextDecision: inbox.nextDecision,
    cost: {
      committed: rollup.cost.committedByCurrency[currency] ?? { currency: 'AUD', units: '0', exponent: 2 },
      envelope: rollup.cost.byCurrency[currency]?.envelope ?? { currency: 'AUD', units: '0', exponent: 2 },
    },
    timingCriticalPathSummary: criticalPath === undefined
      ? 'No committed timing yet'
      : `${criticalPath.title} · ${rollup.timing.knownMinDays} days`,
    effortMinutes: rollup.effort.totalHumanMinutes,
    scopeCoverage: { accepted: rollup.scope.accepted, total: rollup.scope.total },
    exceptions,
    ...(waitingDecisions === undefined ? {} : { waitingDecisions }),
    ...(changes.length === 0 ? {} : { changes }),
    ...(receiptProjection.length === 0 ? {} : { receipts: receiptProjection }),
    ...(nextActions === undefined ? {} : { nextActions }),
    readbackUrl: safeReadbackUrl(input.readbackUrl),
  }
}

function firstCurrency(byCurrency: Readonly<Record<string, unknown>>): string {
  const first = Object.keys(byCurrency)[0]
  return first === undefined ? 'AUD' : first
}

function eventTitle(kind: string): string {
  if (kind === 'created') return 'WorkTree created'
  if (kind === 'elaborated') return 'WorkTree elaborated'
  if (kind === 'study_started') return 'Study started'
  if (kind === 'decision_proposed') return 'Decision proposed'
  return 'WorkTree updated'
}


function WeeklyMemo({ data }: Readonly<{ data: WeeklyMemoData }>): ReactElement {
  const waitingDecisions = data.waitingDecisions?.slice(0, 3) ?? []
  const changes = data.changes?.slice(0, 12) ?? []
  const receipts = data.receipts?.slice(0, 12) ?? []
  const nextActions = data.nextActions?.slice(0, 3) ?? []
  return (
    <Html>
      <Head />
      <Preview>{data.nextDecision}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={sectionStyle}>
            <Text style={eyebrowStyle}>{data.periodLabel}</Text>
            <Heading as="h1" style={headingStyle}>{data.title}</Heading>
            <Text style={nextDecisionStyle}>{data.nextDecision}</Text>
            {data.readbackUrl === undefined ? null : (
              <Link href={data.readbackUrl} style={linkStyle}>Open the current decision inbox</Link>
            )}
          </Section>

          <Section style={sectionStyle}>
            <Text style={sectionHeadingStyle}>This week at a glance</Text>
            <Row>
              <Column style={metricColumnStyle}>
                <Text style={metricLabelStyle}>Cost</Text>
                <Text style={metricValueStyle}>{formatCurrencyAmount(data.cost.committed)} committed</Text>
                <Text style={metricDetailStyle}>{formatCurrencyAmount(data.cost.envelope)} envelope</Text>
              </Column>
              <Column style={metricColumnStyle}>
                <Text style={metricLabelStyle}>Timing</Text>
                <Text style={metricValueStyle}>{data.timingCriticalPathSummary}</Text>
              </Column>
            </Row>
            <Row>
              <Column style={metricColumnStyle}>
                <Text style={metricLabelStyle}>Effort</Text>
                <Text style={metricValueStyle}>{data.effortMinutes} min</Text>
              </Column>
              <Column style={metricColumnStyle}>
                <Text style={metricLabelStyle}>Scope</Text>
                <Text style={metricValueStyle}>{data.scopeCoverage.accepted}/{data.scopeCoverage.total} accepted</Text>
              </Column>
            </Row>
          </Section>

          {changes.length === 0 ? null : (
            <MemoRows heading="What moved" items={changes} />
          )}

          {waitingDecisions.length === 0 ? null : (
            <Section style={sectionStyle}>
              <Text style={sectionHeadingStyle}>Decisions waiting</Text>
              {waitingDecisions.map((decision) => (
                <Row key={decision.title} style={itemRowStyle}>
                  <Column>
                    <Text style={itemTitleStyle}>{decision.title}{decision.moneyYes === true ? ' — money yes' : ''}</Text>
                    {decision.detail === undefined ? null : <Text style={itemDetailStyle}>{decision.detail}</Text>}
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {receipts.length === 0 ? null : (
            <Section style={sectionStyle}>
              <Text style={sectionHeadingStyle}>Decision receipts</Text>
              {receipts.map((receipt) => (
                <Row key={`${receipt.status}:${receipt.title}`} style={itemRowStyle}>
                  <Column>
                    <Text style={itemTitleStyle}>{receipt.title} · {receipt.status}</Text>
                    <Text style={itemDetailStyle}>{receipt.detail}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {nextActions.length === 0 ? null : (
            <MemoRows heading="Next actions" items={nextActions} />
          )}

          <Section style={sectionStyle}>
            <Text style={sectionHeadingStyle}>Exceptions</Text>
            {data.exceptions.length === 0 ? <Text style={emptyStyle}>No exceptions.</Text> : data.exceptions.map((exception) => (
              <Row key={`${exception.severity ?? 'info'}:${exception.title}`} style={itemRowStyle}>
                <Column>
                  <Text style={itemTitleStyle}>{exception.title}</Text>
                  <Text style={itemDetailStyle}>{exception.detail}</Text>
                </Column>
              </Row>
            ))}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

function MemoRows({ heading, items }: Readonly<{
  heading: string
  items: readonly Readonly<{ title: string; detail: string }>[]
}>): ReactElement {
  return (
    <Section style={sectionStyle}>
      <Text style={sectionHeadingStyle}>{heading}</Text>
      {items.map((item) => (
        <Row key={`${heading}:${item.title}`} style={itemRowStyle}>
          <Column>
            <Text style={itemTitleStyle}>{item.title}</Text>
            <Text style={itemDetailStyle}>{item.detail}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  )
}

export async function renderWeeklyMemo(data: WeeklyMemoData): Promise<string> {
  return render(<WeeklyMemo data={data} />)
}


const bodyStyle = {
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  fontFamily: 'Arial, sans-serif',
  margin: 0,
  padding: '24px 0',
} as const

const containerStyle = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  maxWidth: '640px',
  padding: '32px',
} as const

const sectionStyle = {
  borderBottom: '1px solid #e2e8f0',
  padding: '0 0 24px',
  margin: '0 0 24px',
} as const

const eyebrowStyle = {
  color: '#64748b',
  fontSize: '12px',
  letterSpacing: '0.12em',
  margin: '0 0 8px',
  textTransform: 'uppercase' as const,
} as const

const headingStyle = {
  color: '#0f172a',
  fontSize: '28px',
  fontWeight: 600,
  lineHeight: '36px',
  margin: '0 0 12px',
} as const

const nextDecisionStyle = {
  color: '#334155',
  fontSize: '18px',
  fontWeight: 600,
  margin: 0,
} as const
const linkStyle = {
  backgroundColor: '#0f172a',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: 600,
  marginTop: '16px',
  padding: '10px 14px',
  textDecoration: 'none',
} as const

const sectionHeadingStyle = {
  color: '#0f172a',
  fontSize: '16px',
  fontWeight: 600,
  margin: '0 0 12px',
} as const

const metricColumnStyle = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  padding: '12px',
  width: '50%',
} as const

const metricLabelStyle = {
  color: '#64748b',
  fontSize: '12px',
  margin: '0 0 4px',
} as const

const metricValueStyle = {
  color: '#0f172a',
  fontSize: '15px',
  fontWeight: 600,
  margin: 0,
} as const

const metricDetailStyle = {
  color: '#64748b',
  fontSize: '12px',
  margin: '4px 0 0',
} as const

const itemRowStyle = {
  borderTop: '1px solid #e2e8f0',
  padding: '12px 0',
} as const

const itemTitleStyle = {
  color: '#0f172a',
  fontSize: '15px',
  fontWeight: 600,
  margin: 0,
} as const

const itemDetailStyle = {
  color: '#475569',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '4px 0 0',
} as const

const emptyStyle = {
  color: '#64748b',
  fontSize: '14px',
  margin: 0,
} as const
