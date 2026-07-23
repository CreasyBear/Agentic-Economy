# Phase 5 cold-start product analogues

**Owner:** Phase 5 product planning
**Status:** Active
**Maturity:** Target research
**Question:** What should a completely fresh visitor need to know, and how should Phase 5 behave when intent, supply, or comparable evidence is weak?
**Decision affected:** Phase 5 D-01, D-02, D-09, D-17–D-19
**Evidence cutoff:** 2026-07-23
**Review by:** 2026-08-23
**Supersedes:** None
**Superseded by:** None

## Decision supported

Phase 5 is most similar to three products at once:

- Perplexity and Google AI Mode for answer-first, conversational refinement;
- Airbnb for searching a finite, constrained marketplace;
- Google Shopping for seller-supplied product facts, category-specific comparison
  and currentness limits.

No single analogue is sufficient. AE has much less supply than web search, more
heterogeneous facts than a single-category marketplace, and a stricter need to
distinguish an unknown fact from a bad option.

## What the official products expect

### Perplexity: ordinary language, but the user still supplies intent

**OBSERVED:** Perplexity describes its search as conversational and says Pro
Search asks for details and considers preferences. Its prompting guidance says
plain language works, while also warning that vague requests yield vague
answers and recommending a clear question, context and relevant constraints.
([Getting started](https://www.perplexity.ai/help-center/en/articles/10354975-getting-started-with-perplexity);
[prompt guidance](https://www.perplexity.ai/help-center/en/articles/13645819-tips-for-getting-better-answers-from-perplexity))

**INFERRED:** A fresh AE visitor should not need query syntax, provider names,
Offering identifiers, comparison dimensions or an account. They should be able
to state an outcome in ordinary language. Unlike Perplexity, AE cannot rely on
the user already knowing how to write a good prompt. It must ask for the minimum
missing discriminator itself.

### Google AI Search: answer when warranted, refine or fall back when not

**OBSERVED:** Google AI Mode supports conversational questions and follow-ups,
breaks questions into subtopics, and may provide web links when it lacks enough
confidence in an AI response. Google warns that AI Overviews can miss context
or be wrong and keeps supporting links available for checking.
([AI Mode help](https://support.google.com/websearch/answer/16011537);
[AI Overviews help](https://support.google.com/websearch/answer/14901683))

**OBSERVED:** Google's shopping experience adapts the response to the question:
visual browsing for inspiration and a category-specific comparison table when
the user is choosing between known options.
([Google AI shopping](https://blog.google/products-and-platforms/products/shopping/agentic-checkout-holiday-ai-shopping/))

**INFERRED:** GenUI should adapt emphasis and density to the customer's
question, but the correct response is sometimes not an answer. If AE lacks
current supply or comparable facts, it should explain the insufficiency and
offer a safe refinement path. Fluent prose must not make sparse inventory feel
comprehensive.

### Airbnb: structured anchors and explicit flexibility

**OBSERVED:** Airbnb ordinarily asks for destination, dates and party size,
then offers filters and flexible dates to broaden the available inventory. It
also states that when there are too few high-quality matches it may show
listings that do not meet every criterion.
([Using search filters](https://www.airbnb.com/help/article/479);
[How search results work](https://www.airbnb.com/help/article/39))

**INFERRED:** Each AE category needs a small set of decisive, versioned
questions—such as place, timing, budget or required interface—not a universal
filter ontology. “I'm flexible” should be a legitimate answer. AE must not copy
Airbnb's silent relaxation: any option outside a stated constraint must be
labelled as an alternative and must not outrank a valid match.

### Google Shopping: useful facts with limited currentness

**OBSERVED:** Google Shopping accepts product or category searches and offers
category-specific filters. Its product facts come from participating sellers,
can lag seller updates, and Google directs the shopper to the merchant page for
the latest information. AI-assisted recommendations use query relevance and
product attributes, while Google labels generative quality as experimental.
([How Google Shopping works](https://support.google.com/googleshopping/answer/9128904);
[How results are generated](https://support.google.com/googleshopping/answer/15456476);
[Sources of shopping information](https://support.google.com/googleshopping/answer/14336735))

**INFERRED:** AE should state the scope of its search, preserve source and
freshness beside material facts, and distinguish seller-published information
from AE observation. Completeness can affect whether an Offering is comparable;
it cannot become a covert trust score.

## First-session assumptions Phase 5 currently risks making

**INFERRED:** The present Phase 5 flow assumes that a fresh visitor:

1. understands the distinction between a business and an Offering;
2. knows whether to browse first or ask a question;
3. can identify multiple options before comparison becomes useful;
4. knows which comparison priorities matter and how to order them;
5. understands “not ranked,” stale, unknown and exact revision language;
6. will inspect a full comparison to verify a polished answer;
7. accepts that AE searches only its registered supply rather than the whole
   market.

These are not safe assumptions. Internal concepts such as Offering revision and
provenance should remain inspectable evidence, not prerequisites for beginning.

## Required cold-start behavior

**HYPOTHESIS:** The first useful loop should be:

```text
Tell AE what you need in ordinary language
  -> AE reflects its understanding
  -> ask only the decisive missing question, with "I'm flexible"
  -> state the supply searched and constraints applied
  -> answer, or name the exact insufficiency
  -> show decisive reasons and caveats
  -> refine, inspect evidence, or browse nearby alternatives
```

The first response must discriminate:

- **No registered supply:** AE has no published Offering for this need.
- **No current eligible supply:** related Offerings exist, but none currently
  satisfy the stated hard constraints.
- **One plausible option:** inspect it, but do not present a comparison or
  market-leading claim.
- **Insufficient comparable evidence:** options exist, but a material priority
  is unknown, stale or defined differently.
- **Constraints too narrow:** show which constraint blocks the result and let
  the visitor deliberately relax it.
- **Usable comparison:** provide the grounded answer-first surface and retain
  full evidence one disclosure away.

Public transient use remains the closure. Saving, history and personalization
may improve later visits but cannot repair a first-session product that requires
them.

## Founder-selected golden query

The accepted first-session fixture is the founder-normalized form of a
[real Perth request](https://www.reddit.com/r/perth/comments/1v413sm/website_developers_in_perth/):

> I run a small startup in Perth and need a simple website. I would prefer
> someone local or an affordable freelancer. Who should I consider, and roughly
> what should I expect to pay?

The request deliberately lacks the professional vocabulary needed to specify a
website project. AE should reflect the known outcome and ask the single
decision-changing question: whether the site is informational/inquiry-only or
must support transactions, bookings, accounts, or other application behavior.
The response must include **I'm not sure**.

DIY, freelancer, and agency may be explained as advisory approaches. They are
not synthetic Offerings and cannot enter provider comparison unless a real
registered business publishes a corresponding Offering. Indicative price
context must identify whether it is provider-published, observed market
evidence, community anecdote, AE estimate, or unavailable; one class cannot be
presented as another.

## Falsifiers

The cold-start design fails if a fresh evaluator:

- must learn AE vocabulary or construct a precise prompt before seeing value;
- is shown an answer without being told the inventory and constraints searched;
- receives irrelevant inventory after AE silently relaxes a hard constraint;
- sees one option presented as a comparison or recommendation;
- sees missing facts treated as negative evidence;
- cannot distinguish no supply from insufficient evidence;
- cannot say “I'm flexible” or revise one decisive condition;
- interprets business identity, completeness or provenance as an AE trust grade;
- gets a confident GenUI summary when every material priority is unknown.

## Evidence ceiling

This record uses current first-party product documentation and explicit design
inference. It does not include live usability testing, undocumented ranking
logic, customer interviews, conversion evidence or AE implementation evidence.
It supports cold-start design and falsifiers only; it does not prove demand,
willingness to pay, retention, supplier quality or fulfilment.
