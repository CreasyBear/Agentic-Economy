export const PUBLIC_INQUIRY_UNAVAILABLE_REASON =
  'This business isn’t receiving inquiries through AE yet.' as const

/**
 * A published offering carries one first-contact disclosure that the v1→v2
 * adapter stamps onto every human channel it emits, so a phone path can end up
 * describing the AE inquiry form. When AE will not accept an inquiry for the
 * business, that stored text names a channel the customer cannot reach, so the
 * remaining channels are described by what they actually are.
 */
export const PUBLIC_PHONE_CHANNEL_DISCLOSURE = 'Call the business directly.' as const
export const PUBLIC_WEBSITE_CHANNEL_DISCLOSURE = 'Go to the business website.' as const
