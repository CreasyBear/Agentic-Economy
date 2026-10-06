import { ArrowRightIcon, WrenchIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

import '../OnboardingComposition.css'

export function FirstToolStep() {
  return (
    <div className="arc-market arc-provider-setup-first">
      <AeAlert role="alert" tone="info" title="Step 2: Add Your First Tool" className="arc-provider-setup-notice">
          Paste a public HTTPS x402 endpoint to list your first Tool.
        </AeAlert>

      <DecisionPanel className="arc-provider-setup-empty" aria-label="Ready to connect supply">
        <WrenchIcon className="arc-provider-setup-empty-icon" />
        <div className="arc-provider-setup-empty-copy">
          <h3>Ready to connect supply</h3>
          <p>
            Preview checks the source on the server before publication.
          </p>
        </div>
        <div className="arc-provider-setup-actions">
          <Link
            to="/owner/operations/new"
            className={['arc-market', actionLinkClassName('primary', 'md'), 'arc-provider-setup-action'].join(' ')}
          >
            <span>Add Tool</span>
            <ArrowRightIcon className="arc-provider-setup-action-icon" aria-hidden />
          </Link>
          <Link
            to="/owner/operations"
            hash="provider-identity"
            className={['arc-market', actionLinkClassName('secondary', 'md'), 'arc-provider-setup-action'].join(' ')}
          >
            Manage Provider identity
          </Link>
        </div>
      </DecisionPanel>
    </div>
  )
}
