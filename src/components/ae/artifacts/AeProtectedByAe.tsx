import { Text } from '@astryxdesign/core/Text'

export function AeProtectedByAe() {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      <span
        aria-hidden="true"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm bg-inverted font-mono text-xs font-semibold text-on-dark"
      >
        AE
      </span>
      <Text type="supporting" color="secondary">
        Published through Agentic Economy. Details only; the business handles timing, price, and availability.
      </Text>
    </div>
  )
}
