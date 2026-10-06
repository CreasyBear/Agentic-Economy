import { useId, useState } from 'react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Badge } from '@/components/arc/badge/badge'
import { DEVELOPERS_API_COPY, type DevelopersApiViewModel } from './developers-api.contracts'
import '../DeveloperReferenceComposition.css'

export type DevelopersApiPageProps = Readonly<{
  page: DevelopersApiViewModel
}>

export function DevelopersApiPage({ page }: DevelopersApiPageProps) {
  const outlineId = useId()
  const [outlineOpen, setOutlineOpen] = useState(false)
  const contents = [
    { id: 'api-requests-heading', title: DEVELOPERS_API_COPY.operationsHeading },
    { id: 'api-setup-heading', title: DEVELOPERS_API_COPY.setupHeading },
    { id: 'api-errors-heading', title: DEVELOPERS_API_COPY.errorsHeading },
  ]

  return (
    <AePublicPage kind="document" eyebrow={DEVELOPERS_API_COPY.eyebrow} title={DEVELOPERS_API_COPY.title} description={DEVELOPERS_API_COPY.description}>
      <div className="arc-market arc-developer-reference">
        <div className="arc-reference-reading">
          <div className="arc-reference-outline">
            <button type="button" className="arc-reference-outline-toggle" aria-expanded={outlineOpen} aria-controls={outlineId} onClick={() => setOutlineOpen((open) => !open)}>
              API reference contents
            </button>
            <div id={outlineId} className="arc-reference-outline-panel" data-open={outlineOpen}>
              <nav aria-label="API reference contents">
                <p className="arc-reference-outline-title">On this page</p>
                <ul>{contents.map((item) => <li key={item.id}><a href={`#${item.id}`} onClick={() => setOutlineOpen(false)}>{item.title}</a></li>)}</ul>
              </nav>
            </div>
          </div>
          <div className="arc-reference-content">
            <section className="arc-reference-region" aria-labelledby="api-requests-heading">
              <header>
                <h2 id="api-requests-heading" tabIndex={-1}>{DEVELOPERS_API_COPY.operationsHeading}</h2>
                <p>{DEVELOPERS_API_COPY.operationsDescription}</p>
              </header>
              {page.operationGroups.map((group) => (
                <div key={group.tag} className="arc-reference-operation-group">
                  <h3>{group.tag}</h3>
                  <div className="arc-reference-operations">
                    {group.operations.map((operation) => (
                      <article key={operation.operationId} className="arc-reference-operation">
                        <header className="arc-reference-operation-head">
                          <div><Badge tone="neutral">{operation.method}</Badge><code>{operation.path}</code></div>
                          <h4>{operation.summary}</h4>
                          <code>{operation.operationId}</code>
                        </header>
                        {operation.curl === undefined ? (
                          <div className="arc-reference-template">
                            <p>Request template · not runnable</p>
                            <p>{operation.authority}</p>
                            <pre><code>{operation.template}</code></pre>
                          </div>
                        ) : <AeCopyCommand comfortable prompt={false} label={`${operation.method} ${operation.path} cURL`} code={operation.curl} />}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </section>
            <section className="arc-reference-region" aria-labelledby="api-setup-heading">
              <header>
                <h2 id="api-setup-heading" tabIndex={-1}>{DEVELOPERS_API_COPY.setupHeading}</h2>
                <p>{DEVELOPERS_API_COPY.setupDescription}</p>
              </header>
              <div className="arc-reference-setup">
                <a className="arc-reference-openapi" href="/openapi.json">{DEVELOPERS_API_COPY.openApiLink}</a>
                <dl>
                  <div><dt>{DEVELOPERS_API_COPY.versionLabel}</dt><dd>{page.versionPolicy}</dd></div>
                  <div><dt>{DEVELOPERS_API_COPY.authenticationLabel}</dt><dd>{page.authDescription}</dd></div>
                  <div>
                    <dt>{DEVELOPERS_API_COPY.priceShapeLabel}</dt>
                    <dd><span>{DEVELOPERS_API_COPY.priceShape}</span><code>{page.priceExample.json}</code><span>{DEVELOPERS_API_COPY.priceExampleLabel}: {page.priceExample.formatted}</span></dd>
                  </div>
                </dl>
              </div>
            </section>
            <section className="arc-reference-region" aria-labelledby="api-errors-heading">
              <header>
                <h2 id="api-errors-heading" tabIndex={-1}>{DEVELOPERS_API_COPY.errorsHeading}</h2>
                <p>{DEVELOPERS_API_COPY.errorsDescription}</p>
              </header>
              <ul className="arc-reference-problems">
                {page.problems.map((problem) => (
                  <li key={problem.kind} className="arc-reference-problem">
                    <div><code>{problem.kind}</code><span>{problem.title}</span></div>
                    <p>{DEVELOPERS_API_COPY.problemTypeLabel}: <code>{problem.type}</code></p>
                    <p><span>{DEVELOPERS_API_COPY.nextStepLabel}:</span> {problem.nextStep}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AePublicPage>
  )
}
