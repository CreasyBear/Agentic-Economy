export function AdminSearchNotice({ rejected }: { rejected?: string | undefined }) {
  if (rejected === undefined || rejected.length === 0) return null
  return <p role="status" className="text-sm text-muted-foreground">{rejected}</p>
}
