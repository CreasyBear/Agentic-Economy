import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'

import '../SupportComposition.css'

export function PrivateSupportSection() {
  return (
    <section className="arc-market arc-support-section">
      <h2>Contact support privately</h2>
      <p>For account, billing, security or Call problems, email support@aecon.ai with what you expected, what happened and a safe request reference. Do not include credentials, raw inputs or private results.</p>
      <div className="arc-support-actions">
        <Link to="/for-providers" className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}>Review Provider requirements</Link>
        <Link to="/privacy/remove-business" className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}>Request a listing correction</Link>
      </div>
    </section>
  )
}
