import { SignUp } from '@clerk/tanstack-react-start'
import type { SignUpProps } from '@clerk/shared/types'
import { useEffect, type ReactNode } from 'react'
import { recordProductJourney } from '@/lib/observability/product-journey'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  AeSiteAuthPanel,
  AeSiteAuthStage,
  clerkAuthSurfaceAppearance,
} from '@/components/ae/website'

import { SignUpClerkFallback } from './components/SignUpClerkFallback'
import { SignUpLegalFooter } from './components/SignUpLegalFooter'
import type { AeSignUpPageProps } from './sign-up.contracts'
import { useSignUpPage } from './useSignUpPage'

export type { AeSignUpPageProps } from './sign-up.contracts'
export { SignUpClerkFallback } from './components/SignUpClerkFallback'

export function AeSignUpPage(props: AeSignUpPageProps) {
  const model = useSignUpPage(props)
  useEffect(() => {
    recordProductJourney({ action: 'auth_viewed', phase: 'observed', surface: 'sign_up', hasReturnDestination: props.redirect !== undefined })
  }, [props.redirect])

  const signUpProps: SignUpProps & { fallback?: ReactNode } = {
    appearance: clerkAuthSurfaceAppearance,
    fallback: <SignUpClerkFallback />,
    fallbackRedirectUrl: model.redirectUrl,
    forceRedirectUrl: model.redirectUrl,
    signInFallbackRedirectUrl: model.signInFallbackRedirectUrl,
    signInUrl: model.signInUrl,
  }

  return (
    <AePublicPage hideFooterCloser>
      <AeSiteAuthStage labelledBy={model.labelledBy} url={model.stageUrl}>
        <AeSiteAuthPanel
          eyebrow="Account"
          title={model.heading}
          titleId={model.titleId}
          body={model.body}
          footer={<SignUpLegalFooter switchSearch={model.switchSearch} />}
        >
          <SignUp {...signUpProps} />
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}
