export type AeHandDrawnHeroProps = {
  src: string
  alt: string
  caption?: string
}

export function AeHandDrawnHero({ src, alt, caption }: AeHandDrawnHeroProps) {
  return (
    <figure className="ae-hero-figure" aria-label={alt}>
      <img
        src={src}
        alt={alt}
        width="960"
        height="720"
        loading="eager"
        decoding="async"
        className="ae-hero-figure__img"
      />
      {caption ? <figcaption className="ae-hero-figure__caption">{caption}</figcaption> : null}
    </figure>
  )
}
