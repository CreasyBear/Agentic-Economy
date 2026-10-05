import { AuthLoadingState } from '@/components/ae/auth/AuthLoadingState'

export function SignInClerkFallback() {
  return <AuthLoadingState mode="sign_in" />
}
