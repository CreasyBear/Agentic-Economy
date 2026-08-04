export function resolveVercelProtectionBypassSecret(
  env: Record<string, string | undefined>,
): string | undefined {
  return optional(env.VERCEL_AUTOMATION_BYPASS_SECRET)
    ?? optional(env.AE_CUSTOMER_REQUEST_VERCEL_BYPASS_SECRET)
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized.length === 0 ? undefined : normalized
}
