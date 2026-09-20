export function SignInClerkFallback() {
  return (
    <div
      data-slot="ae-site-auth-clerk-fallback"
      className="grid min-h-96 w-full gap-related"
      aria-hidden
    >
      <div className="min-h-touch bg-muted" />
      <div className="min-h-touch bg-foreground/20" />
      <div className="min-h-touch border border-border bg-muted/40" />
      <div className="min-h-touch border border-border bg-muted/40" />
    </div>
  )
}
