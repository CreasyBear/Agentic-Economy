import { SignIn } from '@clerk/tanstack-react-start'
import type { SignInProps } from '@clerk/shared/types'
import type { ReactNode } from 'react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  AeSiteAuthPanel,
  AeSiteAuthStage,
  clerkSignInSurfaceAppearance,
} from '@/components/ae/website'

import { SignInClerkFallback } from './components/SignInClerkFallback'
import type { AeSignInPageProps } from './sign-in.contracts'
import { useSignInPage } from './useSignInPage'

export type { AeSignInPageProps } from './sign-in.contracts'
export { SignInClerkFallback } from './components/SignInClerkFallback'

export function AeSignInPage(props: AeSignInPageProps) {
  const model = useSignInPage(props)

  const signInProps: SignInProps & { fallback?: ReactNode } = {
    appearance: clerkSignInSurfaceAppearance,
    fallback: <SignInClerkFallback />,
    fallbackRedirectUrl: model.fallbackRedirectUrl,
    signUpFallbackRedirectUrl: model.signUpFallbackRedirectUrl,
    signUpUrl: model.signUpUrl,
  }

  return (
    <AePublicPage hideFooterCloser>
      <AeSiteAuthStage labelledBy={model.labelledBy} url={model.stageUrl}>
        <AeSiteAuthPanel
          eyebrow="Account"
          title={model.heading}
          titleId={model.titleId}
          body={model.body}
        >
          <SignIn {...signInProps} />
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}
