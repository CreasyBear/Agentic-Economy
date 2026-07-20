import React from 'react'
import { createRoot } from 'react-dom/client'

import './browser.css'
import {
  AePaidOperationDevelopmentSurface,
  createStructuredPaidOperationDevelopmentHost,
} from '../paid-operation-surface-host'
import { paidOperationBrowserFixture } from './paid-operation-browser-fixture'

const fixture = paidOperationBrowserFixture(
  new URLSearchParams(window.location.search).get('state') ?? 'prepared',
)
const root = document.getElementById('root')

if (root === null) throw new Error('paid_operation_browser_root_missing')

const structured = createStructuredPaidOperationDevelopmentHost(fixture.service)
const inspected = fixture.service.inspect(fixture.ref)
Object.assign(window, {
  __PAID_OPERATION_DEVELOPMENT_PROOF__: {
    structured: structured.inspect(fixture.ref),
    humanDigest: inspected.kind === 'accepted'
      ? inspected.value.human.semanticDigest
      : null,
    agentDigest: inspected.kind === 'accepted'
      ? inspected.value.agent.semanticDigest
      : null,
  },
})

createRoot(root).render(
  <React.StrictMode>
    <AePaidOperationDevelopmentSurface
      service={fixture.service}
      initialRef={fixture.ref}
      resolveReconciliationEvidence={fixture.resolveReconciliationEvidence}
    />
  </React.StrictMode>,
)
