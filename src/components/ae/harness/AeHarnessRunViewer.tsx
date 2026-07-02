'use client'

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileJsonIcon,
  LockKeyholeIcon,
} from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorFactGrid } from '@/components/ae/operator/AeOperatorFactGrid'
import { AeOperatorFilterCard } from '@/components/ae/operator/AeOperatorFilterCard'
import { AeOperatorQueueList } from '@/components/ae/operator/AeOperatorQueueList'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
        <Alert variant="destructive">
          <AlertTriangleIcon aria-hidden="true" className="size-4" />
          <AlertTitle>Run evidence not found</AlertTitle>
          <AlertDescription>{result.publicMessage} HTTP {result.httpStatus}.</AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle className="break-words">Turn {result.turnId}</CardTitle>
            <CardDescription>No private rows were returned for this detail request.</CardDescription>
          </CardHeader>
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
    <Alert data-readback-kind={result.kind} variant={denied ? 'destructive' : 'default'}>
      {denied ? (
        <LockKeyholeIcon aria-hidden="true" className="size-4" />
      ) : (
        <CheckCircle2Icon aria-hidden="true" className="size-4" />
      )}
      <AlertTitle>{denied ? 'Access withheld' : 'Run evidence surface ready'}</AlertTitle>
      <AlertDescription>
        {denied
          ? `${result.publicMessage} HTTP ${result.httpStatus}.`
          : `Run evidence is scoped to the admin operator surface. HTTP ${result.httpStatus}.`}
      </AlertDescription>
    </Alert>
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
    <Card>
      <CardHeader>
        <CardTitle>Private rows withheld</CardTitle>
        <CardDescription>Denied run evidence reads return no raw turn, tool, or model rows.</CardDescription>
      </CardHeader>
      <CardContent>
        <AeOperatorFactGrid
          facts={[
            { label: 'Decision', value: result.reason.replaceAll('_', ' ') },
            { label: 'Private rows returned', value: result.rows.length },
            { label: 'Generated', value: new Date(result.generatedAt).toISOString() },
          ]}
        />
      </CardContent>
    </Card>
  )
}

function AllowedList({ result }: { result: HarnessRunViewerListAllowed }) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Run evidence summary</CardTitle>
          <CardDescription>Rows are derived from private answer-turn evidence after admin access is resolved.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusBadgeVariant(detail.run.status)}>
            {detail.run.status.replaceAll('_', ' ')}
          </Badge>
          <Badge variant="outline">{detail.run.source.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}</Badge>
          {detail.publicProjection.leakedMarkers.length === 0 ? (
            <Badge variant="secondary">public diff clean</Badge>
          ) : (
            <Badge variant="destructive">public diff leak</Badge>
          )}
        </div>
        <CardTitle className="break-words font-mono text-lg">{detail.turn.turnId}</CardTitle>
        <CardDescription>{detail.turn.query}</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}

function RunDetailTabs({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Tabs defaultValue="overview" className="gap-4">
      <TabsList variant="line" aria-label="Run evidence detail tabs" className="max-w-full flex-wrap justify-start">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="tools">Tools</TabsTrigger>
        <TabsTrigger value="phases">Phases</TabsTrigger>
        <TabsTrigger value="evidence">Evidence</TabsTrigger>
        <TabsTrigger value="public">Public view</TabsTrigger>
        <TabsTrigger value="raw">Raw JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <OverviewTab detail={detail} />
      </TabsContent>
      <TabsContent value="tools">
        <ToolRows rows={detail.tools} />
      </TabsContent>
      <TabsContent value="phases">
        <PhaseRows rows={detail.phases} />
      </TabsContent>
      <TabsContent value="evidence">
        <EvidenceTab detail={detail} />
      </TabsContent>
      <TabsContent value="public">
        <PublicProjectionTab detail={detail} />
      </TabsContent>
      <TabsContent value="raw">
        <RawJsonTab detail={detail} />
      </TabsContent>
    </Tabs>
  )
}

function OverviewTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview</CardTitle>
        <CardDescription>Run identity, coverage, and terminal state.</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
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
      emptyDescription="This turn does not include tool-call evidence."
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
    <Card>
      <CardHeader>
        <CardTitle>Evidence</CardTitle>
        <CardDescription>Private evidence shape without expanding raw JSON.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
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
      </CardContent>
    </Card>
  )
}

function PublicProjectionTab({ detail }: { detail: HarnessRunViewerDetail }) {
  const diff = detail.publicProjection
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public projection comparison</CardTitle>
        <CardDescription>Public thread projection is an allowlist; raw tool and run evidence must stay absent.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
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
          <Alert>
            <CheckCircle2Icon aria-hidden="true" className="size-4" />
            <AlertTitle>Public projection is clean</AlertTitle>
            <AlertDescription>No configured raw-evidence markers appear in the public projection.</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangleIcon aria-hidden="true" className="size-4" />
            <AlertTitle>Public projection needs review</AlertTitle>
            <AlertDescription>{diff.leakedMarkers.join(', ')}</AlertDescription>
          </Alert>
        )}
        <JsonBlock label="Public projection JSON" value={diff.serializedPublicProjection} />
      </CardContent>
    </Card>
  )
}

function RawJsonTab({ detail }: { detail: HarnessRunViewerDetail }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <FileJsonIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <CardTitle>Raw JSON</CardTitle>
        </div>
        <CardDescription>Collapsed by default. This section is only for authorized admin/operator contexts.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <CollapsedJson label="Turn JSON" value={detail.rawJson.turnJson} />
        <CollapsedJson label="Evidence JSON" value={detail.rawJson.evidenceJson} />
        <CollapsedJson label="Prose JSON" value={detail.rawJson.proseJson} />
        <CollapsedJson label="Artifact kinds JSON" value={detail.rawJson.artifactKindsJson} />
      </CardContent>
    </Card>
  )
}

function CollapsedJson({ label, value }: { label: string; value: string }) {
  return (
    <details className="rounded-[var(--ae-radius-sm)] border bg-muted/20">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">{label}</summary>
      <div className="border-t p-3">
        <JsonBlock label={label} value={value} />
      </div>
    </details>
  )
}

function JsonBlock({ label, value }: { label: string; value: string }) {
  return (
    <ScrollArea className="ae-operator-scroll-panel border" style={{ maxHeight: 'min(60vh, 32rem)' }}>
      <pre aria-label={label} className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-foreground">
        {value}
      </pre>
    </ScrollArea>
  )
}

function TokenList({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">No values recorded.</p>
      ) : (
        <ul className="grid gap-2">
          {values.map((value) => (
            <li key={`${title}:${value}`} className="break-words rounded-[var(--ae-radius-sm)] border bg-muted/20 p-3 font-mono text-xs leading-5 text-foreground">
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

function statusBadgeVariant(status: Exclude<HarnessRunViewerStatusFilter, 'any'>): 'default' | 'secondary' | 'destructive' | 'outline' {
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
