import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'
import {
  MALFORMED_CALL_REFERENCE_MESSAGE,
  OPEN_CALL_LABEL,
  OPEN_CALLS_LABEL,
  type SupportStatusSectionProps,
} from '../help.contracts'

import '../SupportComposition.css'

export function SupportStatusSection({ callRef }: SupportStatusSectionProps) {
  return (
    <section className="arc-market arc-support-section scroll-mt-anchor">
      <h2>Continue from the current status</h2>
      <p>Open the current status and follow the next action shown there.</p>
      {callRef.kind === 'malformed' ? (
        <p className="text-sm text-muted-foreground">{MALFORMED_CALL_REFERENCE_MESSAGE}</p>
      ) : null}
      <div id="message-troubleshooting" className="arc-support-actions">
        {callRef.kind === 'valid' ? (
          <Link
            to="/calls/$callRef"
            params={{ callRef: callRef.value }}
            className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}
          >
            {OPEN_CALL_LABEL}
          </Link>
        ) : (
          <Link
            to="/activity"
            className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}
          >
            {OPEN_CALLS_LABEL}
          </Link>
        )}
        <Link to="/owner/operations" className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}>Continue Provider setup</Link>
        <Link to="/owner/credit" className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}>Review account credit</Link>
      </div>
    </section>
  )
}
