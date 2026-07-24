# Australian legal title and liability boundaries for latent capacity

**Status:** Research complete  
**Decision affected:** Whether AE pursues the latent-capacity formation-layer wedge  
**Evidence cutoff:** 2026-07-22

> **Research note, not legal advice.** This record identifies gating issues for product discovery. A supplier needs Australian counsel to review its source contracts, privacy posture, sector rules, representations, liability allocation and insurance before launch.

## Bottom line

Australian law does not supply a general transferable property title in facts or information. The commercially saleable thing is usually a **contractual licence or service output**, supported by a proven permission chain, confidentiality controls and any copyright that subsists in original expression or a qualifying compilation—not ownership of the underlying facts. **OBSERVED:** *Breen v Williams* rejected the claimed proprietary basis for access to information in medical records, while distinguishing the physical record from information it contained ([1996] HCA 57, pre-2024 and therefore possibly stale). **OBSERVED:** *IceTV Pty Ltd v Nine Network Australia Pty Ltd* [2009] HCA 14 and *Telstra Corporation Ltd v Phone Directories Company Pty Ltd* [2010] FCAFC 149 sharply limit compilation copyright where the copied material is facts or where human authorship/original intellectual effort cannot be identified ([High Court](https://www.hcourt.gov.au/cases-and-judgments/judgments/judgments-1998-current/icetv-pty-limited-v-nine-network-australia-pty-limited); [AustLII](https://classic.austlii.edu.au/au/cases/cth/FCAFC/2010/149.html); both pre-2024, possibly stale).

**Verdict:** the cleanest initial classes are (1) supplier-generated, non-personal operational observations and bounded forecasts; (2) non-personal environmental/equipment telemetry where the supplier owns the sensors or has an express commercialisation licence; and (3) public/open-file geoscience transformed into sourced analysis without implying exclusivity. The hardest classes—and presumptively dead on arrival without bespoke clearance—are identifiable customer/employee dossiers assembled for resale, sensitive health/financial/behavioural profiles, confidential exploration results that remain under WAMEX protection, and material unpublished results of an ASX-listed entity.

## 1. What is being sold: permission, not title to facts

**OBSERVED:** In *Breen*, the High Court did not recognise a patient property right in the information and treated fiduciary/confidence duties as purpose-specific rather than a free-standing ownership regime ([1996] HCA 57](http://classic.austlii.edu.au/au/cases/cth/HCA/1996/57.html), 6 September 1996; pre-2024, possibly stale). **OBSERVED:** *IceTV* held that copyright protects original expression, not information, facts or ideas, and rejected “industrious collection” as sufficient by itself ([2009] HCA 14](https://www.hcourt.gov.au/cases-and-judgments/judgments/judgments-1998-current/icetv-pty-limited-v-nine-network-australia-pty-limited), 22 April 2009; pre-2024). **OBSERVED:** *Telstra v Phone Directories* found no subsisting copyright in the directories where authorship could not be identified and much production was automated ([2010] FCAFC 149](https://classic.austlii.edu.au/au/cases/cth/FCAFC/2010/149.html), 15 December 2010; pre-2024).

**INFERRED:** “Selling data” should therefore be documented as granting defined access/use rights or supplying an answer. The supplier must warrant only what its chain supports: lawful collection; contractual permission to reuse and disclose; no surviving confidence restriction; ownership/licence of software, reports and original expression; and authority to sublicense. Contract chains—not possession—decide practical title. For each source, due diligence must inspect JV/data-sharing agreements, consultant and employment IP clauses, customer terms and collection notices, government/open-data licences, upstream API terms, and post-termination survival clauses. **UNKNOWN:** whether a given employer automatically owns every employee-created dataset depends on facts, contract and applicable IP rules; it cannot be assumed from payroll status alone.

## 2. Privacy boundary after the 2024 reforms

**OBSERVED:** Privacy Act 1988 Schedule 1 APP 6 permits an APP entity to use/disclose personal information for the primary purpose, or a secondary purpose only where an exception applies: consent; reasonable expectation plus a related purpose (directly related for sensitive information); legal authority; or another specified exception ([OAIC APP 6 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-6-app-6-use-or-disclosure-of-personal-information), published 2019, version 2023—possibly stale; [Privacy Act](https://www.legislation.gov.au/C2004A03712/latest)). Resale to an unrelated buyer is not made lawful merely by calling it an “insight.” **OBSERVED:** direct marketing is separately governed by APP 7, including opt-out and source-disclosure obligations; APP 6.7 directs marketing uses to APP 7 ([Privacy Act, Schedule 1 APP 7](https://www.legislation.gov.au/C2004A03712/latest)).

**OBSERVED:** the Privacy and Other Legislation Amendment Act 2024 commenced its principal reforms on 10 December 2024 and progressed only 23 proposals from the broader review ([Attorney-General’s Department](https://www.ag.gov.au/rights-and-protections/publications/government-response-privacy-act-review-report), updated 12 March 2025; [Act as made](https://www.legislation.gov.au/C2024A00128/asmade/text)). **OBSERVED:** its statutory tort commenced 10 June 2025. A plaintiff can sue for a serious invasion where there was a reasonable expectation of privacy through intrusion or misuse of information; the privacy interest must outweigh countervailing public interests. Remedies include damages, injunction and apology. The tort extends beyond APP entities, so the Privacy Act small-business exemption is not a safe harbour ([OAIC](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/statutory-tort-for-serious-invasions-of-privacy), 19 June 2025; Privacy Act Schedule 2).

**OBSERVED:** Privacy Act s 6D still defines a “small business operator” around the $3 million turnover threshold and exceptions; the 2024 Amendment Act did **not** repeal it ([Privacy Act s 6D](https://www.legislation.gov.au/C2004A03712/latest)). The government only “agreed in principle” to removal subject to consultation and support, while the 2024 Act implemented a subset of review proposals ([government response](https://www.ag.gov.au/rights-and-protections/publications/government-response-privacy-act-review-report)). **INFERRED:** as at cutoff, blanket repeal remains proposed, not legislated. Businesses trading in personal information may already fall outside the exemption under s 6D(4), so a would-be data broker must not rely on turnover alone.

**OBSERVED:** information is “de-identified” only when it is no longer about an identifiable or reasonably identifiable individual; identifiability is contextual and may arise by linkage ([OAIC key concepts](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-b-key-concepts), version published before 2024 and possibly stale). **INFERRED:** hashing identifiers, removing names or aggregation at a thin cohort is not a legal guarantee. A formation process needs a documented re-identification threat model, linkage testing, minimum cohort/suppression rules, buyer-use restrictions and deletion controls. **UNKNOWN:** no universal Australian statutory k-anonymity threshold makes a dataset safe.

Geological measurements, machine telemetry, aggregate equipment availability and environmental observations are **usually unaffected by APP 6/7** where they contain no reasonably identifiable individual. **INFERRED:** they can become personal information when joined to operator IDs, precise household locations, sole-trader records or behavioural traces.

## 3. Wrong answers, recourse and the ACL

**OBSERVED:** Australian negligent-misstatement doctrine follows assumption of responsibility/reasonable reliance principles developed from *Hedley Byrne*. In *Esanda Finance Corporation Ltd v Peat Marwick Hungerfords* (1997) 188 CLR 241, the High Court rejected an indeterminate third-party claim absent circumstances supporting a duty to that claimant; intended audience, purpose and reasonable reliance matter ([AustLII search record](https://www.austlii.edu.au/cgi-bin/sinosrch.cgi?query=Esanda%20Finance%20Peat%20Marwick); pre-2024, possibly stale). **OBSERVED:** *Butcher v Lachlan Elder Realty Pty Ltd* [2004] HCA 60 shows context and an express disclaimer can affect whether an intermediary itself made a representation ([High Court](https://www.hcourt.gov.au/cases-and-judgments/judgments/judgments-1998-current/butcher-v-lachlan-elder-realty-pty-limited), pre-2024).

**OBSERVED:** ACL s 18 prohibits misleading or deceptive conduct in trade or commerce ([Competition and Consumer Act 2010, Schedule 2 s 18](https://www.legislation.gov.au/C2004A00109/latest)). This statutory prohibition cannot simply be contracted away; disclaimers instead form part of the overall conduct and may qualify what was represented. Consumer guarantees also cannot be excluded under ACL s 64, although s 64A may permit limited remedies in qualifying non-household goods/services. **INFERRED:** “not advice” does not cure a specific false accuracy, provenance, freshness or coverage claim.

The viable accountability product is therefore not “guaranteed truth.” It is a bounded, auditable service with: named intended use/audience; source and observation timestamp; confidence and coverage statement; explicit exclusions; correction/re-performance/refund remedy; aggregate liability cap negotiated for business buyers; exclusion of consequential loss where enforceable; supplier indemnity for provenance/IP/privacy breaches; buyer obligations against prohibited reliance/re-identification; and professional/cyber liability cover confirmed for the exact activity. **INFERRED:** insurers are more likely to price a defined professional service with QA and maximum exposure than an uncapped guarantee consumed by unknown downstream parties. **UNKNOWN:** coverage availability and exclusions must be established with a broker; “professional indemnity insured” must never be inferred from a generic policy certificate.

## 4. Sector boundaries

### WA mineral exploration and listed companies

**OBSERVED:** Mining Act 1978 (WA) s 115A requires prescribed exploration reports. Mining Regulations 1981 (WA) reg 96 governs release ([official Act](https://www.wa.gov.au/media/64826/download?inline=); [official regulations](https://www.legislation.wa.gov.au/legislation/statutes.nsf/RedirectURL?OpenAgent=&query=mrdoc_47698.pdf)). **OBSERVED:** DMPE says reports held **five years** may be released under reg 96(4), after annual notice and a two-month objection window. Under reg 96(5), an objection can defer release for a period **not exceeding five years in each case**; lapsed objections return to the annual release list ([WAMEX guidance](https://www.wa.gov.au/service/natural-resources/mineral-resources/access-mineral-exploration-reports-wamex), current page mentioning 2026 guidance). This is not a simple permanent five-year embargo: five years triggers the sunset process, while a valid objection can extend protection in further periods up to five years each. **INFERRED:** confidential WAMEX content cannot be sold by a formation intermediary without authority from the current tenement holder; once open-file, anyone may download it, reducing exclusivity and shifting value to analysis/provenance.

**OBSERVED:** ASX Listing Rule 3.1 requires immediate disclosure of market-sensitive information unless all limbs of rule 3.1A apply ([ASX Chapter 3](https://www.asx.com.au/documents/rules/Chapter03.pdf), current rules page). Mining disclosures must also comply with Chapter 5 and Appendix 5A/JORC, including competent-person and reporting requirements for exploration results ([ASX Chapter 5](https://www.asx.com.au/documents/rules/Chapter05.pdf); [Appendix 5A JORC Code](https://www.asx.com.au/content/dam/asx/rules-guidance-notes-waivers/asx-listing-rules/appendices/Appendix_05A.pdf); documents pre-2024 in origin and possibly stale). **INFERRED:** selling a material unpublished exploration answer selectively to one buyer is effectively unavailable to a listed supplier unless disclosure counsel confirms an exception and JORC compliance.

### Consumer Data Right

**OBSERVED:** CDR is a statutory, consumer-directed sharing regime under Part IVD of the Competition and Consumer Act and currently operates in banking and energy; accredited recipients and data holders operate under CDR Rules and standards ([ACCC CDR overview](https://www.accc.gov.au/by-industry/banking-and-finance/the-consumer-data-right); [energy rollout](https://www.accc.gov.au/by-industry/banking-and-finance/the-consumer-data-right/cdr-in-the-energy-sector)). **INFERRED:** it is a counter-model to broker resale: authority follows the consumer, prescribed data and accredited rails. Formation in CDR data is regulated integration/computation, not acquisition of title.

### Geospatial and survey products

**OBSERVED:** Geoscape Australia (formerly PSMA) licenses national address, cadastre and building products under product-specific terms; even open G-NAF carries an end-user licence ([Geoscape general terms](https://geoscape.com.au/wp-content/uploads/2025/05/Geoscape-Australia-Geoscape-General-Terms-of-Use-v2.0-July-2025.pdf); [Open G-NAF Core EULA](https://geoscape.com.au/wp-content/uploads/2024/08/EULA-G-NAF-Core-1.pdf)). **INFERRED:** a buyer receives contractual rights, not a clean right to resell source records. Survey plans may also embody Crown/agency and surveyor copyright or statutory access conditions. A derived geospatial answer must map every source licence’s redistribution, caching, attribution, derivative-work and API-volume terms. **UNKNOWN:** there is no single Australia-wide “survey data resale” rule; title-office and jurisdiction-specific terms require product-by-product review.

## Capacity-class × legal-constraint matrix

| Capacity class | Personal? | Supplier/status | Regulated? | Main constraint | Initial verdict |
|---|---:|---|---:|---|---|
| Machine condition, spare capacity, maintenance forecast | Usually no | Private operator with sensor/contract rights | Sometimes safety | Contract chain; accuracy/ACL; operational-security exclusions | **Cleanest** if non-personal and bounded |
| Environmental/geological observations generated by supplier | Usually no | Private, unlisted | Mining/environmental reporting may apply | JV/tenement confidentiality; licence; provenance | **Clean** after title audit |
| Open-file WAMEX data plus analysis | No | Any lawful user | Mining source rules | Source attribution/licence; no exclusivity; negligent analysis | **Clean-ish**, differentiation risk |
| Confidential exploration results | No | Tenement holder/private | WAMEX reg 96 | Holder authority; five-year sunset and objections | **Blocked** absent express holder authority |
| Material exploration result | No | ASX-listed | ASX 3.1, Chapter 5/JORC | Continuous disclosure; competent-person/reporting | **Dead for selective sale** |
| Aggregated demand/pricing signal | Maybe | Private platform | Privacy/competition | Robust de-identification; source terms; ACL methodology claims | **Viable with controls** |
| Identifiable customer/employee records | Yes | APP entity or trader in PI | Privacy Act, tort | APP 6 purpose/consent; APP 7; confidence; breach risk | **Presumptively no** |
| Health, credit, finance or behavioural profiles | Yes/sensitive | Regulated holder | Privacy plus sector laws/CDR | Directly-related purpose/consent; statutory regimes; tort | **Dead as generic resale** |
| CDR-derived consumer answer | Yes | Accredited participant | CDR | Consumer authority, Rules, standards, security | **Only inside CDR rails** |
| Licensed cadastre/address/survey-derived answer | Usually no | Licensee | Jurisdiction/product-specific | Redistribution/derivative/attribution terms | **Case-by-case** |

## Competition and data-broker scrutiny

**OBSERVED:** the ACCC’s eighth Digital Platform Services Inquiry report, released 21 May 2024, found consumers lacked visibility and choice over data collection, and examined opaque collection from online/offline sources, profiling, targeting and data products. It reported potential consumer harms and competitive advantages from scale/scope. The report made **no new recommendations**, but said the evidence supported a prohibition on unfair trading practices and strengthened privacy laws ([ACCC report page](https://www.accc.gov.au/inquiries-and-consultations/finalised-inquiries-and-monitoring/digital-platform-services-inquiry-2020-25/march-2024-interim-report); [full report](https://www.accc.gov.au/system/files/Digital-platform-services-inquiry-March-2024-interim-report.pdf), March 2024). **INFERRED:** the inquiry is a warning against building the wedge around invisible personal-data brokerage, not a ban on non-personal B2B observations.

**OBSERVED:** the 2024 privacy amendments did not enact a dedicated Australian data-broker registry or broker-specific federal prohibition, and the ACCC report itself made no new recommendation. **UNKNOWN:** broader unfair-trading and remaining Privacy Act reforms could change this posture after the cutoff; any launch needs a bill/status refresh.

## Disconfirming evidence

1. **The “title problem” may be overstated for services.** **INFERRED:** firms already sell reports and API answers through licences despite no property right in facts. Clean contracts can be enough; formation adds less if the supplier already has mature terms.
2. **Non-personal is not unregulated.** WAMEX confidentiality, ASX disclosure, safety, source licences and confidence can block data with zero privacy content. The thesis cannot treat geological data as automatically clean.
3. **Open-file supply weakens defensibility.** WAMEX’s eventual free release means a formatter may face rapid commoditisation. The value must be timeliness, synthesis, warranty or workflow—not access alone.
4. **Recourse raises cost.** ACL exposure cannot be erased and unknown downstream reliance is difficult to insure. Strong accountability may destroy unit economics for low-price answers.
5. **Mandated sharing bypasses formation.** CDR already specifies authority and technical rails. AE would be a service provider in that ecosystem, not the creator of a new asset class.

## Base rates

**UNKNOWN:** no Australian official dataset reports the survival rate of newly commercialised internal datasets or micro-answer businesses. That missing denominator is material. **OBSERVED:** the ACCC inquiry found a real data-products industry but also low transparency and reform pressure; this establishes activity, not entrant success. **OBSERVED:** WAMEX makes five-year-held reports candidates for public release, which structurally limits the duration of pure access advantages.

**INFERRED:** the relevant legal base rate is adverse: most firms have contracts written for operating the core business, not onward commercialisation; most low-cost outputs cannot support bespoke legal review, PI underwriting and downstream-purpose policing. The likely winners are repeatable non-personal products with one supplier, a short provenance chain, bounded B2B users and capped decisions. Multi-source personal datasets, regulated advice and listed-company secrets have too many independent veto points. Fieldwork should assume legal clearance attrition, not assume every discovered capacity can be formed.

## What this kills or narrows

- Kills “the business possesses it, therefore it can sell it.” Possession is not title.
- Kills generic resale of customer, employee, health, credit or behavioural records as an initial wedge.
- Kills selective sale of market-sensitive exploration results by listed issuers.
- Narrows “backed with recourse” to a defined audience/use, disclosed methodology, correction/refund and finite negotiated liability—not guaranteed correctness.
- Narrows geospatial and public datasets to source-licence-compliant derived products; open access does not imply unrestricted resale.
- Narrows AE’s role to collecting permission-chain evidence and product constraints. AE cannot manufacture missing authority through its own terms.

## Open questions only fieldwork can answer

- Will suppliers expose JV, employment, customer and upstream licence terms to a formation intermediary?
- What percentage of candidate datasets have an uninterrupted reuse/sublicensing chain?
- Will PI/cyber insurers cover per-answer agent delivery and downstream machine reliance, at what cap and premium?
- Can buyers accept decision-use restrictions, or is unrestricted onward agent use essential?
- What de-identification test and audit evidence will counsel accept for each data shape?
- How often do WAMEX objections extend confidentiality beyond the first five-year sunset point?
- Will listed-company counsel permit any monetised answer derived from unpublished operational data?
- Do Geoscape/state title-office licences permit the precise derived output, cache and onward delivery contemplated?

## Sources

- [Privacy Act 1988 (Cth), including s 6D, Schedule 1 APPs 6–7 and Schedule 2](https://www.legislation.gov.au/C2004A03712/latest)
- [Privacy and Other Legislation Amendment Act 2024 (Cth)](https://www.legislation.gov.au/C2024A00128/asmade/text)
- [OAIC — APP 6 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-6-app-6-use-or-disclosure-of-personal-information)
- [OAIC — key concepts and de-identification](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-b-key-concepts)
- [OAIC — statutory tort](https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/statutory-tort-for-serious-invasions-of-privacy)
- [Attorney-General’s Department — Privacy Act Review response](https://www.ag.gov.au/rights-and-protections/publications/government-response-privacy-act-review-report)
- [*Breen v Williams* [1996] HCA 57](http://classic.austlii.edu.au/au/cases/cth/HCA/1996/57.html)
- [*IceTV Pty Ltd v Nine Network Australia Pty Ltd* [2009] HCA 14](https://www.hcourt.gov.au/cases-and-judgments/judgments/judgments-1998-current/icetv-pty-limited-v-nine-network-australia-pty-limited)
- [*Telstra Corporation Ltd v Phone Directories Company Pty Ltd* [2010] FCAFC 149](https://classic.austlii.edu.au/au/cases/cth/FCAFC/2010/149.html)
- [*Butcher v Lachlan Elder Realty Pty Ltd* [2004] HCA 60](https://www.hcourt.gov.au/cases-and-judgments/judgments/judgments-1998-current/butcher-v-lachlan-elder-realty-pty-limited)
- [Competition and Consumer Act 2010 (Cth), Schedule 2 ACL ss 18, 64, 64A](https://www.legislation.gov.au/C2004A00109/latest)
- [Mining Act 1978 (WA)](https://www.wa.gov.au/media/64826/download?inline=)
- [Mining Regulations 1981 (WA), reg 96](https://www.legislation.wa.gov.au/legislation/statutes.nsf/RedirectURL?OpenAgent=&query=mrdoc_47698.pdf)
- [DMPE — WAMEX access and sunset clause](https://www.wa.gov.au/service/natural-resources/mineral-resources/access-mineral-exploration-reports-wamex)
- [ASX Listing Rules Chapter 3](https://www.asx.com.au/documents/rules/Chapter03.pdf)
- [ASX Listing Rules Chapter 5](https://www.asx.com.au/documents/rules/Chapter05.pdf)
- [ASX Appendix 5A — JORC Code](https://www.asx.com.au/content/dam/asx/rules-guidance-notes-waivers/asx-listing-rules/appendices/Appendix_05A.pdf)
- [ACCC — Consumer Data Right](https://www.accc.gov.au/by-industry/banking-and-finance/the-consumer-data-right)
- [ACCC — March 2024 data-brokers interim report](https://www.accc.gov.au/inquiries-and-consultations/finalised-inquiries-and-monitoring/digital-platform-services-inquiry-2020-25/march-2024-interim-report)
- [Geoscape Australia general terms, July 2025](https://geoscape.com.au/wp-content/uploads/2025/05/Geoscape-Australia-Geoscape-General-Terms-of-Use-v2.0-July-2025.pdf)
- [Open G-NAF Core EULA, 2024](https://geoscape.com.au/wp-content/uploads/2024/08/EULA-G-NAF-Core-1.pdf)
