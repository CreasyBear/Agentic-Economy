/** Sanitized observation of one consent request. Locators are never authority. */
export type AgentOnboardingRequest =
  | Readonly<{ kind: 'request'; grantRef: string; revision: number; clientName: string; flow: 'device_code' | 'authorization_code'; environment: 'sandbox' | 'production'; phase: 'pending' | 'issuing' | 'approved' | 'exchanging' | 'exchanged' | 'denied' | 'expired'; createdAt: number; expiresAt: number; principalRef?: string }>
  | Readonly<{ kind: 'refused'; reason: 'authentication_required' | 'owner_mismatch' | 'not_found' | 'environment_mismatch' }>
  | Readonly<{ kind: 'unavailable' }>

export type AgentOnboardingLocator = Readonly<{ grantRef: string; userCode?: never }> | Readonly<{ userCode: string; grantRef?: never }>
