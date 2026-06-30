# Landing Rebuild System Design

## Success Criteria

- First viewport resolves in this order: `Agentic Economy`, `Find a local business for the job`, customer-facing local service search.
- One primary conversion action: browse services. `Claim or correct a listing` supports accuracy without becoming the customer task.
- The product visual is a service search and listing preview. It shows category, coverage, reply-needed availability, contact path, limits, and correction path.
- Every section answers a customer decision question: does this business handle the work, do they cover my area, what should I send, what still needs a reply, and how can stale facts be fixed.
- No forbidden future-phase claims: payments, wallets, bookings, callable actions, hosted agents, MCP, OpenAPI, marketplace demand, or trust labels without tier support.
- Mobile at 375px has no horizontal scroll, readable body text, visible customer search action, and secondary correction or claim access.

## End Conditions

- UI Craft landing acceptance bar has no critical failures: hero squint test, CTA hierarchy, no uniform feature-card grid, specific proof, and reduced motion honored.
- Typecheck and targeted UI-contract tests pass.
- Browser screenshots at desktop and mobile show the generated service-listing graphic, no text overlap, no blank hero, and a visible hint of the next section.
- The generated graphic is saved under `public/images/` and the page remains understandable without it.

## System Design

- **Shell:** shared `AePublicShell` owns public navigation and footer links.
- **Route:** `src/routes/index.tsx` owns the landing content model and section order.
- **Landing components:** `AePublicLanding` exposes reusable public primitives: hero, proof strip, listing card, varied signal modules, listing preview, pathway, service rows, boundary panel, FAQ, and closing object.
- **Tokens/CSS:** `src/styles/tokens.css` remains the token source. `src/styles/globals.css` uses `ae-public-*` classes and root AE tokens only.
- **Graphic:** generated bitmap asset at `public/images/ae-service-listing-hero.png`; HTML copy and the service listing carry the meaning, not generated text inside the image.
