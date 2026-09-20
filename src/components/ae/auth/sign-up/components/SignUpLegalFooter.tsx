import { Link } from '@tanstack/react-router'

import type { SignUpLegalFooterProps } from '../sign-up.contracts'

export function SignUpLegalFooter({ switchSearch }: SignUpLegalFooterProps) {
  return (
    <div className="grid gap-related">
      <p>
        Already have an account?{' '}
        <Link
          to="/sign-in/$"
          params={{ _splat: '' }}
          search={switchSearch}
          className="inline-flex min-h-touch items-center font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </Link>
      </p>
      <p>
        By continuing you agree to the{' '}
        <Link
          to="/terms"
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Terms
        </Link>
        {' '}and{' '}
        <Link
          to="/privacy"
          className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Privacy
        </Link>
        .
      </p>
    </div>
  )
}
