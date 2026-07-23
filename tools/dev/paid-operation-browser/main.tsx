import React from 'react'
import { createRoot } from 'react-dom/client'

import './browser.css'
import {
  AePaidOperationDevelopmentSurface,
  createStructuredPaidOperationDevelopmentHost,
} from '../paid-operation-surface-host'
import { paidOperationBrowserFixture } from './paid-operation-browser-fixture'

const parameters = new URLSearchParams(window.location.search)
const requestedState = parameters.get('state') ?? 'prepared'
const run = parameters.get('run') ?? 'default'
const fixture = paidOperationBrowserFixture(requestedState, {
  persistenceKey: `${requestedState}:${run}`,
  storage: window.localStorage,
  commandDelayMs: 75,
})
const root = document.getElementById('root')

if (root === null) throw new Error('paid_operation_browser_root_missing')

const structured = createStructuredPaidOperationDevelopmentHost(
  fixture.service,
  fixture.resolveReconciliationEvidence,
)
Object.assign(window, {
  __PAID_OPERATION_DEVELOPMENT_PROOF__: {
    fixtureBoundary:
      'local browser mechanics + authenticated route fixtures; not protected-route browser proof',
    snapshot: () => {
      const ref = fixture.currentRef()
      const inspected = fixture.service.inspect(ref)
      return {
        ...fixture.proof(),
        structured: structured.inspect(ref),
        humanDigest: inspected.kind === 'accepted'
          ? inspected.value.human.semanticDigest
          : null,
        agentDigest: inspected.kind === 'accepted'
          ? inspected.value.agent.semanticDigest
          : null,
        humanVersion: inspected.kind === 'accepted'
          ? inspected.value.human.semantics.identity.expectedInvocationVersion
          : null,
        agentVersion: inspected.kind === 'accepted'
          ? inspected.value.agent.semantics.identity.expectedInvocationVersion
          : null,
      }
    },
  },
})

createRoot(root).render(
  <React.StrictMode>
    <AePaidOperationDevelopmentSurface
      service={fixture.service}
      initialRef={fixture.ref}
      resolveReconciliationEvidence={fixture.resolveReconciliationEvidence}
      transportRescue={fixture.transportRescue}
      onReadOnlyInspect={fixture.inspectOnly}
    />
  </React.StrictMode>,
)
