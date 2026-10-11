import { Link } from '@tanstack/react-router'

import type { SignUpLegalFooterProps } from '../sign-up.contracts'
import '@/components/ae/website/AuthComposition.css'

export function SignUpLegalFooter({ switchSearch }: SignUpLegalFooterProps) {
  return (
    <div className="arc-market arc-auth-legal">
      <p>
        Already have an account?{' '}
        <Link
          to="/sign-in/$"
          params={{ _splat: '' }}
          search={switchSearch}
          className="arc-auth-legal-link"
        >
          Sign in
        </Link>
      </p>
      <p>You will be asked to accept the Terms and Privacy Policy next.</p>
    </div>
  )
}
