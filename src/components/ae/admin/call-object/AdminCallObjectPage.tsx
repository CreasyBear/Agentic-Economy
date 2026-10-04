import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { ErrorBoundary } from '@sentry/react'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { Badge } from '@/components/ui/badge'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { PageHeader } from '@/components/arc/blocks/page-header/page-header'
import { aeStatusToneVariants } from '@/lib/ui/status-presentation'
import { AdminCallActivity } from './components/AdminCallActivity'
import { AdminCallEvidence } from './components/AdminCallEvidence'
import { AdminCallReferences } from './components/AdminCallReferences'
import { CallContentReview } from './CallContentReview'
import {
  ADMIN_CALL_OBJECT_COPY,
  type AdminCallLoaderResult,
  type AdminCallObjectFoundProps,
} from './call-object.contracts'
import { useAdminCallObject } from './useAdminCallObject'
import '../RecordWorkspaceComposition.css'

export type AdminCallObjectPageProps = Readonly<{
  result: AdminCallLoaderResult
}>

export function AdminCallObjectPage({ result }: AdminCallObjectPageProps) {
  if (result.kind === 'malformed' || result.kind === 'object_not_found') {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={ADMIN_CALL_OBJECT_COPY.backToSearch}
      />
    )
  }
  if (result.kind === 'refused') {
    return (
      <AePageState
        title={ADMIN_CALL_OBJECT_COPY.refusedTitle}
        description={ADMIN_CALL_OBJECT_COPY.refusedDescription}
        tone="danger"
      />
    )
  }
  return <AdminCallObjectFound view={result} />
}

function AdminCallObjectFound({ view }: AdminCallObjectFoundProps) {
  const model = useAdminCallObject(view)
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={ADMIN_CALL_OBJECT_COPY.title}
      description=""
      contentOwnsHeading
      currentPath={`/admin/calls/${encodeURIComponent(view.ref)}`}
      stickyHeader
      breadcrumbs={[
        { label: ADMIN_CALL_OBJECT_COPY.adminBreadcrumb, href: '/admin' },
        { label: ADMIN_CALL_OBJECT_COPY.callsBreadcrumb, href: '/admin/search' },
        { label: view.ref },
      ]}
    >
      <PageHeader
        title={ADMIN_CALL_OBJECT_COPY.title}
        description={ADMIN_CALL_OBJECT_COPY.description}
        breadcrumbs={[
          {
            id: 'admin',
            label: ADMIN_CALL_OBJECT_COPY.adminBreadcrumb,
            renderLink: ({ children, ...linkProps }) => <Link to="/admin" {...linkProps}>{children}</Link>,
          },
          {
            id: 'section',
            label: ADMIN_CALL_OBJECT_COPY.callsBreadcrumb,
            renderLink: ({ children, ...linkProps }) => <Link to="/admin/search" {...linkProps}>{children}</Link>,
          },
          { id: 'record', label: view.ref },
        ]}
        actions={(
          <Badge variant={aeStatusToneVariants[model.status.tone]}>
            {model.status.compactLabel}
          </Badge>
        )}
        detail={(
          <div className="flex min-w-0 flex-wrap items-center gap-intra text-sm text-muted-foreground">
            <span>{ADMIN_CALL_OBJECT_COPY.referenceLabel}</span>
            <AeCopyReference label={ADMIN_CALL_OBJECT_COPY.referenceLabel} value={view.ref} />
          </div>
        )}
      />
      <div className="arc-market arc-admin-call-layout">
        <AdminCallEvidence model={model} />
        <AdminCallReferences refs={model.relatedRefs} />
      </div>
      <AdminCallActivity rows={model.activity} />
      <ErrorBoundary key={view.ref} fallback={({ resetError }) => (
        <AeSection title="Founder content review">
          <p role="status">Content review access is unavailable.</p>
          <Button type="button" variant="secondary" onClick={resetError}>Retry content review access</Button>
        </AeSection>
      )}>
        <CallContentReview callRef={view.ref} />
      </ErrorBoundary>
    </AeOperatorPage>
  )
}
