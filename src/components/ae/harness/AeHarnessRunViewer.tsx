'use client'

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileJsonIcon,
  LockKeyholeIcon,
} from 'lucide-react'
import { useState } from 'react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import type {
  HarnessRunViewerDetail,
  HarnessRunViewerDetailResult,
  HarnessRunViewerFilters,
  HarnessRunViewerStatusFilter,
  HarnessRunViewerListAllowed,
  HarnessRunViewerListResult,
  HarnessRunViewerListRow,
  HarnessRunViewerPhaseRow,
  HarnessRunViewerToolRow,
} from '@/modules/harness/run-viewer.schema'

export function AeHarnessRunList({
  result,
  filters,
}: {
  result: HarnessRunViewerListResult
  filters: HarnessRunViewerFilters
}) {
  return (
    <>
      <RunViewerAccess result={result} />
      <RunViewerFilters filters={filters} />
      {result.kind === 'denied' ? (
        <DeniedRows result={result} />
      ) : (
        <AllowedList result={result} />
      )}
    </>
  )
}

export function AeHarnessRunDetail({ result }: { result: HarnessRunViewerDetailResult }) {
  if (result.kind === 'denied') {
    return (
      <>
        <RunViewerAccess result={result} />
        <DeniedRows result={result} />
      </>
    )
  }

  if (result.kind === 'not_found') {
    return (
      <>
        <Banner
          status="error"
          icon={<AlertTriangleIcon aria-hidden="true" className="size-4" />}
          title="Run evidence not found"
          description={`${result.publicMessage} HTTP ${result.httpStatus}.`}
        />
        <Card padding={5}>
          <div className="grid gap-1.5">
            <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words">Turn {result.turnId}</Text>
            <Text as="div" type="supporting" color="secondary" display="block">No private rows were returned for this detail request.</Text>
          </div>
        </Card>
      </>
    )
  }

  return (
    <>
      <RunViewerAccess result={result} />
      <RunDetailHeader detail={result.detail} />
      <RunDetailTabs detail={result.detail} />
    </>
  )
}

function RunViewerAccess({
  result,
}: {
  result: HarnessRunViewerListResult | HarnessRunViewerDetailResult
}) {
  const denied = result.kind === 'denied'
  return (
    <Banner
      data-readback-kind={result.kind}
      status={denied ? 'error' : 'success'}
      icon={denied ? <LockKeyholeIcon aria-hidden="true" className="size-4" /> : <CheckCircle2Icon aria-hidden="true" className="size-4" />}
      title={denied ? 'Access withheld' : 'Run evidence surface ready'}
      description={
        denied
          ? `${result.publicMessage} HTTP ${result.httpStatus}.`
          : `Run evidence is scoped to the admin operator surface. HTTP ${result.httpStatus}.`
      }
    />
  )
}

function RunViewerFilters({ filters }: { filters: HarnessRunViewerFilters }) {
  return (
    <AeOperatorFilterCard
      action="/admin/runs"
      title="Find run evidence"
      description="Filter by status, turn, thread, date, or whether a turn has run evidence."
      fields={[
        {
          id: 'status',
          name: 'status',
          label: 'Status',
          description: 'any, ok, error, blocked, timeout, aborted, missing, pending, or complete.',
          defaultValue: filters.status ?? '',
        },
        {
          id: 'turnId',
          name: 'turnId',
          label: 'Turn ID',
          description: 'Exact or partial turn identifier.',
          defaultValue: filters.turnId ?? '',
        },
        {
          id: 'threadId',
          name: 'threadId',
          label: 'Thread ID',
          description: 'Exact or partial thread identifier.',
          defaultValue: filters.threadId ?? '',
        },
        {
          id: 'date',
          name: 'date',
          label: 'Date',
          description: 'ISO date prefix, for example 2026-07-02.',
          defaultValue: filters.date ?? '',
        },
        {
          id: 'hasRunEvidence',
          name: 'hasRunEvidence',
          label: 'Run evidence',
          description: 'any, yes, or no.',
          defaultValue: filters.hasRunEvidence ?? '',
        },
      ]}
    />
  )
}

function DeniedRows({
  result,
}: {
  result: Extract<HarnessRunViewerListResult | HarnessRunViewerDetailResult, { kind: 'denied' }>
}) {
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <Text as="div" type="large" weight="semibold" color="primary" display="block">Private rows withheld</Text>
        <Text as="div" type="supporting" color="secondary" display="block">Denied run evidence reads return no raw turn, tool, or model rows.</Text>
      </div>
      <div className="grid gap-4">
        <AeOperatorFactGrid
          facts={[
            { label: 'Decision', value: result.reason.replaceAll('_', ' ') },
            { label: 'Private rows returned', value: result.rows.length },
            { label: 'Generated', value: new Date(result.generatedAt).toISOString() },
          ]}
        />
      </div>
    </Card>
  )
}

function AllowedList({ result }: { result: HarnessRunViewerListAllowed }) {
  return (
    <>
      <Card padding={5}>
        <div className="grid gap-1.5">
          <Text as="div" type="large" weight="semibold" color="primary" display="block">Run evidence summary</Text>
          <Text as="div" type="supporting" color="secondary" display="block">Rows are derived from private answer-turn evidence after admin access is resolved.</Text>
        </div>
        <div className="grid gap-4">
          <AeOperatorFactGrid
            facts={[
              { label: 'Turns', value: result.summary.turns },
              { label: 'Harness runs', value: result.summary.withHarnessRun },
              { label: 'Legacy backfills', value: result.summary.legacyBackfilled },
              { label: 'Missing evidence', value: result.summary.missingRunEvidence },
              { label: 'Needs attention', value: result.summary.attention },
              { label: 'Generated', value: new Date(result.generatedAt).toISOString() },
            ]}
          />
        </div>
      </Card>
      {result.rows.length === 0 ? (
        <AeEmptyState
          title="No run rows"
          description="No answer turns match the current run evidence filters."
        />
      ) : (
        <AeOperatorQueueList
          scroll
          rows={result.rows.map((row) => ({
            id: row.rowId,
            href: `/admin/runs/${encodeURIComponent(row.turnId)}`,
            badges: [
              { label: row.runStatus.replaceAll('_', ' '), variant: statusBadgeVariant(row.runStatus) },
              { label: row.runSource.replaceAll(/([A-Z])/g, ' $1').toLowerCase(), variant: 'outline' },
            ],
            title: row.turnId,
            description: row.queryPreview,
            facts: listRowFacts(row),
          }))}
          emptyTitle="No run rows"
          emptyDescription="No answer turns match the current run evidence filters."
        />
      )}
    </>
  )
}

function RunDetailHeader({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={toAstryxHarnessBadgeVariant(statusBadgeVariant(detail.run.status))} label={detail.run.status.replaceAll('_', ' ')} />
          <Badge variant="neutral" label={detail.run.source.replaceAll(/([A-Z])/g, ' $1').toLowerCase()} />
          {detail.publicProjection.leakedMarkers.length === 0 ? (
            <Badge variant="info" label="public diff clean" />
          ) : (
            <Badge variant="error" label="public diff leak" />
          )}
        </div>
        <Text as="div" type="large" weight="semibold" color="primary" display="block" className="break-words font-mono text-lg">{detail.turn.turnId}</Text>
        <Text as="div" type="supporting" color="secondary" display="block">{detail.turn.query}</Text>
      </div>
      <div className="grid gap-4">
        <AeOperatorFactGrid
          facts={[
            { label: 'Thread', value: detail.turn.threadId },
            { label: 'Turn status', value: detail.turn.status.replaceAll('_', ' ') },
            { label: 'Intent', value: detail.turn.intent.replaceAll('_', ' ') },
            { label: 'Duration', value: `${detail.run.durationMs}ms` },
            { label: 'Tools', value: detail.tools.length },
            { label: 'Phases', value: detail.phases.length },
          ]}
        />
      </div>
    </Card>
  )
}

function RunDetailTabs({ detail }: { detail: HarnessRunViewerDetail }) {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <div className="grid gap-4">
      <TabList value={activeTab} onChange={setActiveTab} hasDivider aria-label="Run evidence detail tabs" className="max-w-full flex-wrap justify-start">
        <Tab value="overview" label="Overview" />
        <Tab value="tools" label="Tools" />
        <Tab value="phases" label="Phases" />
        <Tab value="evidence" label="Evidence" />
        <Tab value="public" label="Public view" />
        <Tab value="raw" label="Raw JSON" />
      </TabList>
      {activeTab === 'overview' ? <OverviewTab detail={detail} /> : null}
      {activeTab === 'tools' ? <ToolRows rows={detail.tools} /> : null}
      {activeTab === 'phases' ? <PhaseRows rows={detail.phases} /> : null}
      {activeTab === 'evidence' ? <EvidenceTab detail={detail} /> : null}
      {activeTab === 'public' ? <PublicProjectionTab detail={detail} /> : null}
      {activeTab === 'raw' ? <RawJsonTab detail={detail} /> : null}
    </div>
  )
}

function OverviewTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <Text as="div" type="large" weight="semibold" color="primary" display="block">Overview</Text>
        <Text as="div" type="supporting" color="secondary" display="block">Run identity, coverage, and terminal state.</Text>
      </div>
      <div className="grid gap-4">
        <AeOperatorFactGrid
          facts={[
            { label: 'Run ID', value: detail.run.runId ?? 'not recorded' },
            { label: 'Session ID', value: detail.run.sessionId ?? 'not recorded' },
            { label: 'Snapshot hash', value: detail.turn.snapshotHash },
            { label: 'Started', value: detail.run.startedAt === undefined ? 'not recorded' : new Date(detail.run.startedAt).toISOString() },
            { label: 'Ended', value: detail.run.endedAt === undefined ? 'not recorded' : new Date(detail.run.endedAt).toISOString() },
            { label: 'Errors', value: detail.run.report?.summary.errors.count ?? 0 },
          ]}
        />
      </div>
    </Card>
  )
}

function ToolRows({ rows }: { rows: readonly HarnessRunViewerToolRow[] }) {
  if (rows.length === 0) {
    return <AeEmptyState title="No tool rows" description="This turn does not include tool-call evidence." />
  }

  return (
    <AeOperatorQueueList
      rows={rows.map((row) => ({
        id: row.id,
        badges: [
          { label: row.status.replaceAll('_', ' '), variant: statusBadgeVariant(row.status) },
          { label: `${row.durationMs}ms`, variant: 'outline' },
        ],
        title: row.toolId,
        description: row.errorCode ?? row.resultHash ?? 'No error code recorded.',
        facts: [
          { label: 'Count', value: String(row.count) },
          { label: 'Sequence', value: row.seq === undefined ? 'summary' : String(row.seq) },
          { label: 'Result hash', value: row.resultHash ?? 'not recorded' },
        ],
      }))}
      emptyTitle="No tool rows"
      emptyDescription="This turn does not include tool evidence."
    />
  )
}

function PhaseRows({ rows }: { rows: readonly HarnessRunViewerPhaseRow[] }) {
  if (rows.length === 0) {
    return <AeEmptyState title="No phase rows" description="This run report has no phase counters yet." />
  }

  return (
    <AeOperatorQueueList
      rows={rows.map((row) => ({
        id: row.id,
        badges: [
          { label: row.status.replaceAll('_', ' '), variant: statusBadgeVariant(row.status) },
          { label: `${row.durationMs}ms`, variant: 'outline' },
        ],
        title: row.phase,
        description: row.errorCode ?? 'No phase error code recorded.',
        facts: [
          { label: 'Events', value: String(row.count) },
          { label: 'Duration', value: `${row.durationMs}ms` },
          { label: 'Error code', value: row.errorCode ?? 'none' },
        ],
      }))}
      emptyTitle="No phase rows"
      emptyDescription="This run report has no phase counters yet."
    />
  )
}

function EvidenceTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <Text as="div" type="large" weight="semibold" color="primary" display="block">Evidence</Text>
        <Text as="div" type="supporting" color="secondary" display="block">Private evidence shape without expanding raw JSON.</Text>
      </div>
      <div className="grid gap-5">
        <AeOperatorFactGrid
          facts={[
            { label: 'Providers', value: detail.evidence.providerCount },
            { label: 'Allowed slugs', value: detail.evidence.allowedSlugCount },
            { label: 'Tool calls', value: detail.evidence.toolCallCount },
            { label: 'Timings', value: detail.evidence.timingCount },
            { label: 'Work log', value: detail.evidence.workLogCount },
            { label: 'Agent JSON', value: detail.evidence.agentJsonUrl ?? 'not recorded' },
          ]}
        />
        <TokenList title="Result hashes" values={detail.evidence.resultHashes} />
        <TokenList title="Artifact kinds" values={detail.evidence.artifactKinds} />
      </div>
    </Card>
  )
}

function PublicProjectionTab({ detail }: { detail: HarnessRunViewerDetail }) {
  const diff = detail.publicProjection
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <Text as="div" type="large" weight="semibold" color="primary" display="block">Public projection comparison</Text>
        <Text as="div" type="supporting" color="secondary" display="block">Public thread projection is an allowlist; raw tool and run evidence must stay absent.</Text>
      </div>
      <div className="grid gap-5">
        <AeOperatorFactGrid
          facts={[
            { label: 'Leaked markers', value: diff.leakedMarkers.length },
            { label: 'Excluded markers', value: diff.excludedPrivateMarkers.length },
            { label: 'Artifacts', value: diff.publicTurn.artifacts.length },
            { label: 'Work steps', value: diff.publicTurn.workLog.length },
            { label: 'Checks failed', value: diff.publicTurn.answerCheckSummary?.checksFailed ?? 0 },
            { label: 'Checks passed', value: diff.publicTurn.answerCheckSummary?.checksPassed ?? 0 },
          ]}
        />
        {diff.leakedMarkers.length === 0 ? (
          <Banner
            status="success"
            icon={<CheckCircle2Icon aria-hidden="true" className="size-4" />}
            title="Public projection is clean"
            description="No configured raw-evidence markers appear in the public projection."
          />
        ) : (
          <Banner
            status="error"
            icon={<AlertTriangleIcon aria-hidden="true" className="size-4" />}
            title="Public projection needs review"
            description={diff.leakedMarkers.join(', ')}
          />
        )}
        <JsonBlock label="Public projection JSON" value={diff.serializedPublicProjection} />
      </div>
    </Card>
  )
}

function RawJsonTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <FileJsonIcon aria-hidden="true" className="size-4 text-secondary" />
          <Text as="div" type="large" weight="semibold" color="primary" display="block">Raw JSON</Text>
        </div>
        <Text as="div" type="supporting" color="secondary" display="block">Collapsed by default. This section is only for authorized admin/operator contexts.</Text>
      </div>
      <div className="grid gap-3">
        <CollapsedJson label="Turn JSON" value={detail.rawJson.turnJson} />
        <CollapsedJson label="Evidence JSON" value={detail.rawJson.evidenceJson} />
        <CollapsedJson label="Prose JSON" value={detail.rawJson.proseJson} />
        <CollapsedJson label="Artifact kinds JSON" value={detail.rawJson.artifactKindsJson} />
      </div>
    </Card>
  )
}

function CollapsedJson({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-sm border bg-muted/20">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-primary">{label}</summary>
      <div className="border-t p-3">
        <JsonBlock label={label} value={value} />
      </div>
    </details>
  )
}

function JsonBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-auto rounded-md border border-border" style={{ maxHeight: 'min(60vh, 32rem)' }}>
      <pre aria-label={label} className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-primary">
        {value}
      </pre>
    </div>
  )
}

function TokenList({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-primary">{title}</h2>
      {values.length === 0 ? (
        <p className="text-sm text-secondary">No values recorded.</p>
      ) : (
        <ul className="grid gap-2">
          {values.map((value) => (
            <li key={`${title}:${value}`} className="break-words rounded-sm border bg-muted/20 p-3 font-mono text-xs leading-5 text-primary">
              {value}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function listRowFacts(row: HarnessRunViewerListRow): readonly { label: string; value: string }[] {
  return [
    { label: 'Thread', value: row.threadId },
    { label: 'Turn status', value: row.turnStatus.replaceAll('_', ' ') },
    { label: 'Providers', value: String(row.providerCount) },
    { label: 'Tools', value: String(row.toolCallCount) },
    { label: 'Checks', value: `${row.checksPassed} passed / ${row.checksFailed} failed` },
    { label: 'Created', value: new Date(row.createdAt).toISOString() },
  ]
}

type HarnessBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

function statusBadgeVariant(status: Exclude<HarnessRunViewerStatusFilter, 'any'>): HarnessBadgeVariant {
  if (status === 'error' || status === 'blocked' || status === 'timeout' || status === 'aborted') {
    return 'destructive'
  }
  if (status === 'missing' || status === 'skipped' || status === 'pending') {
    return 'secondary'
  }
  if (status === 'complete' || status === 'ok') {
    return 'default'
  }
  return 'outline'
}

function toAstryxHarnessBadgeVariant(variant: HarnessBadgeVariant): 'neutral' | 'info' | 'error' {
  if (variant === 'destructive') return 'error'
  if (variant === 'secondary') return 'info'
  return 'neutral'
}
