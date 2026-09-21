import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteBody, AeSiteHeading, AeSiteSection } from '@/components/ae/website'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

import { DEVELOPERS_API_COPY, type DevelopersApiViewModel } from './developers-api.contracts'

export type DevelopersApiPageProps = Readonly<{
  page: DevelopersApiViewModel
}>

export function DevelopersApiPage({ page }: DevelopersApiPageProps) {
  return (
    <AePublicPage
      kind="document"
      eyebrow={DEVELOPERS_API_COPY.eyebrow}
      title={DEVELOPERS_API_COPY.title}
      description={DEVELOPERS_API_COPY.description}
    >
      <AeSiteSection labelledBy="api-setup-heading" rhythm="flush" scheme="surface">
        <div className="grid gap-page py-10 md:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)] md:py-12">
          <div className="grid content-start gap-related">
            <AeSiteHeading as="h2" size="sm" id="api-setup-heading">
              {DEVELOPERS_API_COPY.setupHeading}
            </AeSiteHeading>
            <AeSiteBody muted size="sm">{DEVELOPERS_API_COPY.setupDescription}</AeSiteBody>
            <a className="w-fit text-sm font-medium text-brand underline underline-offset-4" href="/openapi.json">
              {DEVELOPERS_API_COPY.openApiLink}
            </a>
          </div>
          <dl className="grid gap-related text-sm">
            <div className="grid gap-1">
              <dt className="font-medium">{DEVELOPERS_API_COPY.versionLabel}</dt>
              <dd className="text-muted-foreground">{page.versionPolicy}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="font-medium">{DEVELOPERS_API_COPY.authenticationLabel}</dt>
              <dd className="text-muted-foreground">{page.authDescription}</dd>
            </div>
            <div className="grid gap-1">
              <dt className="font-medium">{DEVELOPERS_API_COPY.priceShapeLabel}</dt>
              <dd className="grid gap-1 text-muted-foreground">
                <span>{DEVELOPERS_API_COPY.priceShape}</span>
                <code className="break-all text-xs text-foreground">{page.priceExample.json}</code>
                <span>{DEVELOPERS_API_COPY.priceExampleLabel}: {page.priceExample.formatted}</span>
              </dd>
            </div>
          </dl>
        </div>
      </AeSiteSection>

      <AeSiteSection labelledBy="api-requests-heading" scheme="canvas">
        <div className="grid gap-page">
          <div className="grid gap-intra">
            <AeSiteHeading as="h2" size="md" id="api-requests-heading">
              {DEVELOPERS_API_COPY.operationsHeading}
            </AeSiteHeading>
            <AeSiteBody muted size="sm">{DEVELOPERS_API_COPY.operationsDescription}</AeSiteBody>
          </div>
          <div className="grid gap-related xl:grid-cols-2">
            {page.operations.map((operation) => (
              <Card key={operation.operationId} className="min-w-0">
                <CardContent className="grid min-w-0 gap-related">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline">{operation.method}</Badge>
                    <code className="min-w-0 break-all text-xs text-muted-foreground">{operation.path}</code>
                  </div>
                  <div className="grid gap-1">
                    <AeSiteHeading as="h3" size="xs">{operation.summary}</AeSiteHeading>
                    <code className="text-xs text-muted-foreground">{operation.operationId}</code>
                  </div>
                  <AeCopyCommand
                    comfortable
                    prompt={false}
                    label={`${operation.method} ${operation.path} cURL`}
                    code={operation.curl}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AeSiteSection>

      <AeSiteSection labelledBy="api-errors-heading" scheme="surface">
        <div className="grid gap-page">
          <div className="grid gap-intra">
            <AeSiteHeading as="h2" size="md" id="api-errors-heading">
              {DEVELOPERS_API_COPY.errorsHeading}
            </AeSiteHeading>
            <AeSiteBody muted size="sm">{DEVELOPERS_API_COPY.errorsDescription}</AeSiteBody>
          </div>
          <div className="grid gap-related md:grid-cols-2">
            {page.problems.map((problem) => (
              <Card key={problem.kind} className="min-w-0">
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-medium">{problem.kind}</code>
                    <span className="text-muted-foreground">{problem.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{DEVELOPERS_API_COPY.problemTypeLabel}: <code>{problem.type}</code></p>
                  <p><span className="font-medium">{DEVELOPERS_API_COPY.nextStepLabel}:</span> {problem.nextStep}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AeSiteSection>
    </AePublicPage>
  )
}
