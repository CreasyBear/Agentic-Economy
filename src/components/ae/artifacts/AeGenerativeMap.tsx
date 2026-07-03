export type AeGenerativeMapProps = {
  label: string
  placeQuery: string
}

export function AeGenerativeMap({ label, placeQuery }: AeGenerativeMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return null
  }

  const src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(placeQuery)}`

  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-surface">
      <figcaption className="border-b border-border px-4 py-2 font-mono text-2xs uppercase tracking-wider text-secondary">
        Area for this query: {label}
      </figcaption>
      <iframe
        title={`Map for ${label}`}
        className="block h-64 w-full border-0"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"
        allowFullScreen
      />
    </figure>
  )
}

export type AeOfficeMapProps = {
  address: string
  businessName: string
}

export function AeOfficeMap({ address, businessName }: AeOfficeMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return null
  }

  const src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(address)}`

  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-surface">
      <figcaption className="border-b border-border px-4 py-2 font-mono text-2xs uppercase tracking-wider text-secondary">
        Office — {businessName}
      </figcaption>
      <iframe
        title={`Office map for ${businessName}`}
        className="block h-64 w-full border-0"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-scripts"
        allowFullScreen
      />
    </figure>
  )
}
