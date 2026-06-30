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
    <figure className="ae-generative-map">
      <figcaption className="ae-generative-map__label">Area for this query: {label}</figcaption>
      <iframe
        title={`Map for ${label}`}
        className="ae-generative-map__frame"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
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
    <figure className="ae-generative-map ae-generative-map--office">
      <figcaption className="ae-generative-map__label">Office — {businessName}</figcaption>
      <iframe
        title={`Office map for ${businessName}`}
        className="ae-generative-map__frame"
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </figure>
  )
}
