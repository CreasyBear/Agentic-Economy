import { ArrowRightIcon, WrenchIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'
import buttonStyles from '@/components/arc/button/button.module.css'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import '../OnboardingComposition.css'

export function FirstToolStep() {
  return (
    <div className="arc-market arc-provider-setup-first">
      <Alert className="arc-provider-setup-notice">
        <WrenchIcon className="arc-provider-setup-notice-icon" />
        <AlertTitle>Step 2: Add Your First Tool</AlertTitle>
        <AlertDescription>
          Paste a public HTTPS x402 endpoint to list your first Tool.
        </AlertDescription>
      </Alert>

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
            className={['arc-market', buttonStyles.button, buttonStyles.primary, buttonStyles.md, 'arc-provider-setup-action'].join(' ')}
          >
            <span>Add Tool</span>
            <ArrowRightIcon className="arc-provider-setup-action-icon" aria-hidden />
          </Link>
          <Link
            to="/owner/operations"
            hash="provider-identity"
            className={['arc-market', buttonStyles.button, buttonStyles.secondary, buttonStyles.md, 'arc-provider-setup-action'].join(' ')}
          >
            Manage Provider identity
          </Link>
        </div>
      </DecisionPanel>
    </div>
  )
}
