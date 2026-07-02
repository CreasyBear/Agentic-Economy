import { AeHandDrawnHero } from './AeHandDrawnHero'

export function AeDaylightRoutingObject() {
  return (
    <section className="ae-routing-object" aria-label="Agentic Economy routing preview">
      <div className="ae-routing-object__frame">
        <AeHandDrawnHero
          src="/images/illustration/hero-victorian-house.png"
          alt="Hand-drawn pen-and-ink Victorian suburban house with a faint city skyline behind it."
          caption="Drawn by hand. Read by agents."
        />

        <aside className="ae-routing-object__cutout" aria-label="Example routed need">
          <p className="ae-routing-object__cutout-label">Example need</p>
          <p className="ae-routing-object__cutout-query">No hot water in Preston 3072</p>
          <ol className="ae-routing-object__steps" aria-label="What the answer returns">
            <li>Who fits</li>
            <li>Where they work</li>
            <li>What to do now</li>
          </ol>
        </aside>
      </div>
    </section>
  )
}
