export function accountRefForOwner(ownerId: string, currency: string): string {
  return `owner:${ownerId}:${currency}`
}

export function accountRefForProvider(businessId: string, currency: string): string {
  return `business:${businessId}:${currency}`
}

export function accountRefForRake(currency: string): string {
  return `ae:rake:${currency}`
}

export function accountRefForExternalLoss(currency: string): string {
  return `ae:external-loss:${currency}`
}
