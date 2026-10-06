export type PlanConfirmationActions = Readonly<{
  pending?: boolean
  onApprove: (planRef: string, approvedTotalAudUnits: string) => void
  onDeny: (planRef: string) => void
}>
