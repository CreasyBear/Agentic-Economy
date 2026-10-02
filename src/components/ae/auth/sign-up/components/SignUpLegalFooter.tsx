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
      <p>
        By continuing you agree to the{' '}
        <Link
          to="/terms"
          className="arc-auth-legal-link"
        >
          Terms
        </Link>
        {' '}and{' '}
        <Link
          to="/privacy"
          className="arc-auth-legal-link"
        >
          Privacy
        </Link>
        .
      </p>
    </div>
  )
}
