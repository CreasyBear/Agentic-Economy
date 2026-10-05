import { AuthLoadingState } from '@/components/ae/auth/AuthLoadingState'

export function SignUpClerkFallback() {
  return <AuthLoadingState mode="sign_up" />
}
