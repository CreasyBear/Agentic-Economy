import { SHELL } from './supplier-onboarding-wizard.contracts'

export function AeSupplierOnboardingWizardSkeleton() {
  return (
    <div
      className={`grid max-w-2xl gap-4 rounded-xl border bg-card p-6 shadow-xs ${SHELL}`}
      aria-hidden
      data-slot="supplier-onboarding-wizard-skeleton"
    >
      <div className="grid gap-1">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted/50" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-b pb-4 mb-4">
        <div className="h-14 animate-pulse rounded-md bg-muted/30" />
        <div className="h-14 animate-pulse rounded-md bg-muted/30" />
        <div className="h-14 animate-pulse rounded-md bg-muted/30" />
      </div>
      <div className="min-h-[3rem]" />
      <div className="grid gap-4">
        <div className="h-16 animate-pulse rounded-md border bg-muted/20" />
        <div className="grid gap-3">
          <div className="h-16 animate-pulse rounded-md border bg-muted/30" />
          <div className="h-16 animate-pulse rounded-md border bg-muted/30" />
          <div className="h-16 animate-pulse rounded-md border bg-muted/30" />
        </div>
        <div className="flex justify-end pt-2">
          <div className="min-h-touch h-10 w-40 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  )
}
