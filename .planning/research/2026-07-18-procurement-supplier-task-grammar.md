# Procurement and supplier-management task grammar

**Owner:** Product and Engineering
**Status:** Active
**Maturity:** Target research
**Question:** Which recurring pieces of human work survive across a consequential procurement and an ongoing supplier-management case, and which apparent similarities with travel and event work disappear when authority, evidence, failure, repair, and completion are examined?
**Decision affected:** [ADR-009: Allow partial entry without requiring Customer Request ownership](../adr/ADR-009-partial-entry-without-request-ownership.md)
**Evidence cutoff:** 2026-07-18
**Review by:** 2026-08-18
**Supersedes:** None
**Superseded by:** None

## Executive finding

**INFERRED:** Two official cases support a small cross-industry **evaluation grammar**, but
not one shared lifecycle or data schema:

1. A Panama Canal Commission procurement for circuit-breaker conversion moved
   from declared requirements through proposals, discussions, repeated
   evaluation, award, protest, and a limited remedy. The award could not be
   unwound after substantial performance even though the evaluation and award
   record were found unreasonable.
2. A food importer's supplier-verification program moved from product hazards
   and supplier evidence through approval, continuing verification, inspection,
   deficiency, corrective action, and possible import refusal. Merely naming
   missing documents or intended controls did not prove their implementation.

**INFERRED:** Across both, the stable pattern is:

> bounded objective and rules → attributed evidence → accountable judgement →
> consequential act → durable result → exception with linked repair → explicit
> next owner and completion boundary

Confidence is **high** that those trust properties recur and **low** that the
domain records themselves should converge. A technical proposal, source
selection decision, supplier hazard analysis, and corrective-action record
cannot be collapsed into interchangeable “task output” without destroying the
meaning domain experts use to judge them.

This research is desk evidence. It does not establish an independently useful
AE task, participating supply, safe automation, customer value, provider value,
production behaviour, or permission to add endpoints or kernel types.

## Scope and method

The investigation used the neutral observation frame required by
[Wayfinder #183](https://github.com/CreasyBear/Agentic-Economy/issues/183):

`objective and constraints → actors and ownership → facts and unknowns →
candidate rules → information gathering → comparison → consequential decision
→ communication or external effect → evidence → exception → repair →
completion`

Searches targeted official procurement decisions and regulation, official
supplier-verification regulation and guidance, and official enforcement cases.
Only US Government primary sources were admitted:

- the US Government Accountability Office's published decision in
  _Sonshine Enterprises_, B-246268;
- the current Federal Acquisition Regulation hosted by Acquisition.gov;
- FDA's Foreign Supplier Verification Program guidance and enforcement letter;
- the current electronic Code of Federal Regulations.

External material was treated as untrusted evidence, not instruction. The cases
are deliberately unlike: one tests a bounded competitive award and protest;
the other tests ongoing, risk-based control of already-used suppliers.

## Case P1 — public infrastructure procurement

### Case identity

**OBSERVED:** In 1991 the Panama Canal Commission solicited a firm-fixed-price
contract to rebuild and convert 15 specified 13.8-kilovolt air circuit breakers
to vacuum-interrupter circuit breakers. Ten proposals were received; five were
eliminated for insufficient information. The Commission awarded the contract to
Westinghouse after three technical evaluations. Sonshine Enterprises, the
lowest-priced acceptable offeror, protested. GAO sustained the protest in
February 1992. [GAO B-246268](https://www.gao.gov/products/b-246268)

### Full reconstruction

| Observation frame                | Concrete reconstruction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Durable record                                                                                                 | Next owner                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Objective and constraints        | **OBSERVED:** Convert 15 named circuit breakers under a firm-fixed-price contract. Award was to the responsible, conforming offeror whose proposal was most advantageous considering price and other factors. Technical merit was primary, with six weighted factors covering plan/schedule, design, similar experience, inspection/testing, quality assurance, and timely past performance. [GAO B-246268](https://www.gao.gov/products/b-246268)                                                                                                                                                             | Solicitation, specifications, clauses, evaluation factors and weights                                          | Offerors prepare conforming proposals; contracting office administers competition                             |
| Actors and ownership             | **OBSERVED:** The Commission owned the requirement and competition; a technical evaluation committee assessed proposals; the contracting officer made the award; Sonshine and Westinghouse owned their offers; GAO reviewed the protest. Current FAR makes the source selection authority's documented independent judgement—not an evaluator or scoring tool—the consequential selection decision. [GAO B-246268](https://www.gao.gov/products/b-246268) [FAR 15.308](https://www.acquisition.gov/far/15.308)                                                                                                 | Acquisition plan and role assignments; proposals; evaluation record; source-selection decision; protest record | Actor varies by stage; selection authority owns award judgement, GAO owns protest decision                    |
| Facts and unknowns               | **OBSERVED:** Proposals supplied company, work-plan, recent similar-project, design/performance, and inspection/testing information. Sonshine's warranty and operating-mechanism detail were questioned. Westinghouse omitted some required plan, experience, and inspection information and attached contingent price and termination terms. Evaluators' reasons for some score changes were absent. [GAO B-246268](https://www.gao.gov/products/b-246268)                                                                                                                                                    | Proposal versions, clarification questions, technical literature, evaluation notes, terms and conditions       | Contracting officer/evaluators identify material gaps; offeror may answer only through the permitted exchange |
| Candidate rules                  | **OBSERVED:** Five offers lacking enough information were removed from the competitive range. Remaining offers were to be assessed against the solicitation's stated factors and material contract terms. Current FAR likewise requires evaluation solely on stated factors and documentation of strengths, deficiencies, weaknesses, and risks. [GAO B-246268](https://www.gao.gov/products/b-246268) [FAR 15.305](https://www.acquisition.gov/far/15.305)                                                                                                                                                    | Competitive-range determination and notices; compliance assessment                                             | Contracting officer owns admission/elimination under the applicable procedure                                 |
| Information gathering            | **OBSERVED:** The Commission asked offerors for further information and later best and final offers. Sonshine provided breaker specifications; Westinghouse clarified its return timing and corrected a per-breaker charge from $35,000 to $3,500. The record did not show that Sonshine was told of all past-performance and timeliness concerns. Current FAR distinguishes clarification from negotiation and restricts favouring one offeror or revealing another's protected solution or price. [GAO B-246268](https://www.gao.gov/products/b-246268) [FAR 15.306](https://www.acquisition.gov/far/15.306) | Questions, answers, discussion records, proposal revisions, final offers                                       | Contracting officer controls equal and lawful exchanges; offerors own answers/revisions                       |
| Comparison                       | **OBSERVED:** The committee performed three scored evaluations. Sonshine's scores moved from 914 to 940 and then 905; Westinghouse ultimately received 1,000 despite omitted required information. The committee also relied on spare-parts availability, which was not a stated factor. GAO found the record did not support the reasonableness of the evaluation or selection. [GAO B-246268](https://www.gao.gov/products/b-246268)                                                                                                                                                                         | Supported scoring/rating narrative, relative strengths/risks, cost analysis and trade-off record               | Evaluation team prepares analysis; selection authority must make and explain the business judgement           |
| Consequential decision           | **OBSERVED:** The Commission awarded Westinghouse on 27 September 1991 even though Sonshine's final price was $191,925 versus Westinghouse's $236,871 before contingencies. The attached Westinghouse terms materially departed from the required fixed-price and termination terms. [GAO B-246268](https://www.gao.gov/products/b-246268)                                                                                                                                                                                                                                                                     | Signed source-selection decision and contract award                                                            | Contracting officer/selection authority; then contractor and contract administrator                           |
| Communication or external effect | **OBSERVED:** Award created a contract and performance began. Sonshine protested on 15 October, outside the period that would have automatically stayed performance under the then-applicable rule. Current FAR still distinguishes pre-award protest, timely post-award suspension/termination, and later protest where performance need not stop automatically. [GAO B-246268](https://www.gao.gov/products/b-246268) [FAR 33.104](https://www.acquisition.gov/far/33.104)                                                                                                                                   | Award notice, executed contract, performance records, protest and notices                                      | Contractor performs; contracting officer administers; protest forum reviews                                   |
| Evidence                         | **OBSERVED:** GAO examined the solicitation, offers, evaluation material, contract terms, and agency record. Current FAR's protest file expressly includes the protest, relevant offers, evaluation documents, solicitation, offer abstract, and other relevant records. [GAO B-246268](https://www.gao.gov/products/b-246268) [FAR 33.104](https://www.acquisition.gov/far/33.104)                                                                                                                                                                                                                            | Indexed protest file and review decision                                                                       | Contracting officer compiles; GAO adjudicates                                                                 |
| Exception                        | **OBSERVED:** GAO found unexplained deductions, unsupported perfect scores, reliance on an unstated factor, acceptance of material deviations, and no consideration of price contingencies in the cost/technical trade-off. [GAO B-246268](https://www.gao.gov/products/b-246268)                                                                                                                                                                                                                                                                                                                              | Protest grounds, agency report, findings and decision                                                          | Protester raises; agency answers; GAO determines                                                              |
| Repair                           | **OBSERVED:** GAO sustained the protest. Because the contract had been substantially performed, GAO found termination impracticable and awarded Sonshine protest and proposal-preparation costs rather than recommending re-award. [GAO B-246268](https://www.gao.gov/products/b-246268)                                                                                                                                                                                                                                                                                                                       | Sustained decision, certified cost claim, agency response                                                      | Protester submits costs; agency reports action; procurement owner improves future control                     |
| Completion                       | **OBSERVED:** Physical contract performance was substantially complete, but that did not make the source-selection record reasonable. The protest completed with a sustained finding and cost remedy; the published decision asked the Commission to advise GAO of action taken. [GAO B-246268](https://www.gao.gov/products/b-246268)                                                                                                                                                                                                                                                                         | Performance/acceptance records are distinct from protest resolution and corrective-action records              | Different owners close contract performance, protest remedy, and control improvement                          |

### Retry and support classification

| Task                                     | Retry class                                                                            | Why                                                                                          | Human or unsupported residue                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Re-read solicitation or proposal         | Safe computation, subject to exact version                                             | No external effect; result must remain tied to the same document revision                    | Technical interpretation can require an engineer                                            |
| Recalculate declared scores              | Safe computation if inputs and formula are unchanged                                   | Deterministic recomputation can expose inconsistency but cannot supply missing judgement     | Narrative assessment of strengths, risk, and trade-offs remains accountable human judgement |
| Ask an offeror to clarify                | New attributable communication; procedure-constrained                                  | Repetition can create unequal treatment, reveal protected information, or become negotiation | Contracting officer decides who may be asked what and when                                  |
| Re-evaluate after a supported correction | Requires new evaluation record and revision lineage                                    | Prior evaluation must remain inspectable; a material correction changes the decision basis   | Evaluation team and selection authority re-exercise judgement                               |
| Award or re-award                        | Consequential; reconcile before another effect                                         | A contract may already exist and performance may have begun                                  | Only authorized procurement officials can commit or terminate                               |
| Protest/remedy                           | Human/legal judgement; terminal as to the forum decision, not necessarily the contract | Available remedy changes with timing and performance state                                   | GAO/court and accountable agency officials determine relief                                 |

### Domain-expert acceptance criteria

Domain experts would not evaluate this case as “did the system pick the best
supplier?” They would ask:

- **Declared-criteria fidelity — Critical.** Good: every material rating and
  trade-off is traceable to a stated solicitation factor and current proposal
  evidence. Bad: the system rewards an unstated benefit, overlooks a material
  deviation, or invents reasons missing from the record.
- **Equal and controlled exchanges — Critical.** Good: clarification and
  discussion respect the governing procedure, protect competing information,
  and preserve who received which question. Bad: one offeror silently receives
  an opportunity to cure or revise that another did not.
- **Independent award judgement — Critical.** Good: the authorized selection
  owner sees the relative evidence and documents the business rationale,
  including extra cost. Bad: a score, recommendation, or agent output becomes
  the award by default.
- **Remedy-state honesty — High.** Good: the system distinguishes a flawed
  decision, an existing contract, performance state, available stay, possible
  termination, and residual monetary remedy. Bad: “protest sustained” is
  reported as though the contract was undone.

Sources: [FAR 15.305](https://www.acquisition.gov/far/15.305),
[FAR 15.306](https://www.acquisition.gov/far/15.306),
[FAR 15.308](https://www.acquisition.gov/far/15.308), and
[FAR 33.104](https://www.acquisition.gov/far/33.104).

## Case S1 — imported-food supplier management

### Case identity

**OBSERVED:** FDA inspected Daisy Global Trading Co's Foreign Supplier
Verification Program in 2019 and again remotely in late 2020. The 2021 warning
letter covered multiple imported noodle, rice, and seaweed products. Daisy had
provided a manual and six food-specific records, but FDA found that required
supplier-verification activities had not been documented for four supplier-food
combinations and that a named allergen-control corrective action had not been
verified as implemented. [FDA warning letter, Daisy Global Trading
Co](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)

### Full reconstruction

| Observation frame                | Concrete reconstruction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Durable record                                                                                      | Next owner                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Objective and constraints        | **OBSERVED:** An FSVP importer must use risk-based activities to verify that each imported food is produced to applicable US food-safety standards. FDA's rule framework covers qualified individuals, hazard analysis, food/supplier evaluation, verification, corrective action, recordkeeping, and importer identification. [FDA FSVP small-entity compliance guide](https://www.fda.gov/media/110327/download)                                                                                                                                                                                                                   | FSVP for each supplier-food pairing, regulatory applicability and exemption record                  | US importer remains responsible; qualified individual performs the work                         |
| Actors and ownership             | **OBSERVED:** Daisy, as importer, owned compliance; its foreign suppliers owned their source documents and food controls; a qualified individual had to develop/apply the FSVP; FDA investigators inspected and FDA issued the warning; CBP entry identifies the FSVP importer. Reliance on another entity's analysis does not remove the importer's duty to review and assess that documentation. [FDA FSVP guide](https://www.fda.gov/media/110327/download)                                                                                                                                                                       | Importer identity, qualified-individual record, supplier identity, reviewed third-party evidence    | Importer/qualified individual decides and documents; supplier supplies evidence; FDA enforces   |
| Facts and unknowns               | **OBSERVED:** Daisy's manual called for supplier guarantees, approval questionnaires, HACCP plans, liability insurance, and third-party audit certificates. It also named hazard-analysis, supplier-evaluation, verification, re-evaluation, and approved-supplier records. FDA nevertheless found missing proof of verification activities/frequency and no verification that an allergen-control program was operating for a rice-stick supplier. [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)           | Supplier-submitted evidence plus importer's hazard, evaluation, verification, and freshness records | Qualified individual resolves evidence gaps; supplier may provide current source evidence       |
| Candidate rules                  | **OBSERVED:** Supplier approval is based on food hazards, who controls them, supplier food-safety practices, compliance information, testing/audits, and corrective-performance history. Standard FSVP requires approval and use of approved suppliers; some small-supplier cases have modified requirements, and temporary use of an unapproved supplier requires written control. [FDA FSVP at-a-glance](https://www.fda.gov/media/97893/download) [FDA FSVP guide](https://www.fda.gov/media/110327/download)                                                                                                                     | Documented supplier evaluation/approval and controlled exception                                    | Importer/qualified individual owns approval; this is not a marketplace ranking                  |
| Information gathering            | **OBSERVED:** Permitted verification can include qualified onsite audit, sampling/testing, review of food-safety records, or another risk-appropriate activity. Daisy's own checklist requested several supplier documents, but a checklist did not establish that the selected verification activity occurred. [FDA FSVP at-a-glance](https://www.fda.gov/media/97893/download) [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)                                                                              | Audit report, test result, record review, activity frequency and reviewer assessment                | Qualified individual gathers/assesses; qualified auditor or laboratory owns specific evidence   |
| Comparison                       | **INFERRED:** The relevant comparison is evidence against the hazard/control and supplier-performance requirements for this food, not a universal supplier score or lowest-price ranking. This follows from FDA's food-and-supplier-specific evaluation factors and the Daisy finding that missing allergen-control proof could not be replaced by the existence of a generic supplier file. [FDA FSVP at-a-glance](https://www.fda.gov/media/97893/download) [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021) | Requirement-to-evidence assessment with unresolved hazards explicit                                 | Qualified individual exercises risk judgement                                                   |
| Consequential decision           | **OBSERVED:** The importer approves and uses a supplier, determines verification activities/frequency, continues or stops use, and identifies itself for each import entry. Corrective action can include discontinuing the supplier until causes are addressed. [FDA FSVP guide](https://www.fda.gov/media/110327/download) [21 CFR 1.508](https://www.ecfr.gov/current/title-21/part-1/section-1.508)                                                                                                                                                                                                                              | Approval/use decision, import entry, corrective action or discontinuation                           | Importer owns supplier use; regulator may take enforcement action                               |
| Communication or external effect | **OBSERVED:** Food was imported from the listed foreign suppliers. FDA issued Form FDA 483a observations after both inspections, then a warning letter. FDA warned that inadequate response could lead to refusal of admission or detention without physical examination. [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)                                                                                                                                                                                     | Entry record, inspection observation, response, warning letter, possible import action              | Importer responds/corrects; FDA evaluates response; CBP/FDA control admission                   |
| Evidence                         | **OBSERVED:** Daisy supplied an FSVP manual, six food-specific FSVPs, and named supplier/importer forms. FDA's rule requires signed/dated records, current modifications, prompt availability, and retention. Evidence created for another purpose may be used only when it contains the required information and is assessed/supplemented as needed. [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021) [FDA FSVP guide](https://www.fda.gov/media/110327/download)                                             | Signed/dated FSVP records and source evidence with review attribution                               | Importer retains and produces; FDA inspects                                                     |
| Exception                        | **OBSERVED:** Four supplier-food combinations lacked documented verification before import and periodically thereafter; frequency was not documented; an identified need for HACCP/hazard/preventive-control/allergen-control evidence was not shown to have been implemented. [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)                                                                                                                                                                                | Deficiency/observation tied to exact product, supplier and missing record                           | Importer investigates; supplier provides or implements evidence; FDA reviews                    |
| Repair                           | **OBSERVED:** The regulation requires prompt, circumstance-appropriate corrective action, potentially supplier discontinuation, investigation of FSVP adequacy, modification where appropriate, and documentation of investigations, action, and changes. FDA requested Daisy's specific corrections and implementation records within 15 working days. [21 CFR 1.508](https://www.ecfr.gov/current/title-21/part-1/section-1.508) [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)                            | Investigation, corrective-action evidence, revised FSVP, response and regulator disposition         | Importer acts; qualified individual verifies; FDA determines adequacy                           |
| Completion                       | **UNKNOWN:** The warning letter does not establish that Daisy completed an adequate correction, that FDA accepted it, or that a close-out occurred. A declared corrective-action intention is not completion. Supplier management also continues through periodic verification and re-evaluation when new information appears. [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021) [FDA FSVP at-a-glance](https://www.fda.gov/media/97893/download)                                                               | Accepted corrective evidence if later issued; continuing verification and re-evaluation records     | Importer remains next owner unless regulator disposition or supplier discontinuation changes it |

### Retry and support classification

| Task                                | Retry class                                              | Why                                                                                                       | Human or unsupported residue                                                               |
| ----------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Request a current supplier document | New attributable communication; generally safe           | A repeated request is not a repeated import or approval, but freshness and non-response must be preserved | Supplier may only support email/manual exchange                                            |
| Re-run a requirements checklist     | Safe computation against a frozen rule/evidence revision | It can identify missing fields but cannot prove a control operates                                        | Qualified individual judges relevance and adequacy                                         |
| Repeat audit, sampling, or testing  | New evidence-producing attempt                           | Results are time-, lot-, site-, method-, and actor-specific; an old result cannot be overwritten          | Qualified auditor/laboratory/inspector performs real-world work                            |
| Approve or continue using supplier  | Consequential human judgement                            | It exposes imported food and regulatory responsibility; a score cannot confer approval                    | Importer/qualified individual owns the decision                                            |
| Import another line entry           | New consequential effect, not a retry of analysis        | Each entry identifies an accountable importer and can be refused or detained                              | External customs/regulatory systems and physical goods are outside AE proof                |
| Correct noncompliance               | Reconcile, investigate, act, then verify                 | Repeating the request or marking a plan complete does not establish implementation                        | Root-cause, physical process change, recall, or regulator judgement remains human/external |
| Re-evaluate supplier                | New revision with prior evidence retained                | New hazards or performance facts can invalidate approval; reevaluation is recurring                       | Qualified individual interprets evidence and exceptions                                    |

### Domain-expert acceptance criteria

Domain experts would not evaluate this case as “does the system have supplier
documents?” They would ask:

- **Food-and-supplier specificity — Critical.** Good: each conclusion binds the
  exact food, foreign supplier, hazard/control responsibility, evidence, and
  review date. Bad: a generic certificate or another product's record is
  projected across suppliers or foods.
- **Operating-control evidence — Critical.** Good: the selected verification
  activity and frequency are documented, attributable, and show the required
  hazard control. Bad: a checklist, policy, requested file, or planned action
  is presented as implementation.
- **Qualified accountable judgement — Critical.** Good: the responsible
  importer and qualified individual are named, and third-party evidence is
  explicitly reviewed and assessed. Bad: evidence ownership is shifted to an
  agent, supplier, auditor, or regulator.
- **Correction closure — Critical.** Good: the exception, investigation,
  actual corrective action, revised program, verification, and regulator
  disposition remain distinct. Bad: sending a response or promising training
  closes the issue.
- **Freshness and re-evaluation — High.** Good: approval is re-evaluated on new
  hazard/performance information and at the applicable interval. Bad: a
  once-approved supplier stays eligible indefinitely.

Sources: [FDA FSVP at-a-glance](https://www.fda.gov/media/97893/download),
[FDA FSVP guide](https://www.fda.gov/media/110327/download), and
[21 CFR 1.508](https://www.ecfr.gov/current/title-21/part-1/section-1.508).

## Cross-industry task grammar

**INFERRED:** The cases share verbs, but each verb is admissible only with domain-owned entry
conditions and evidence.

| Recurring human work         | Minimum trust question                                                          | Procurement instance                                        | Supplier-management instance                                                                             | Durable result                                            | Next owner                                  | Default retry posture                                               |
| ---------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| State the need               | What exact outcome, scope, constraints and rule version apply?                  | Breaker conversion solicitation and fixed-price terms       | Food/supplier scope and applicable food-safety requirements                                              | Versioned requirement record                              | Candidate/provider or specialist            | Revise as a new version; never rewrite a live decision basis        |
| Identify candidates          | Who may be considered under the declared rules?                                 | Offers admitted to competitive range                        | Supplier-food relationship subject to approval/use control                                               | Candidate/admission record with reason                    | Evaluator/qualified individual              | Search may repeat; admission changes need a new record              |
| Gather information           | Who asserted what, when, for which candidate/object?                            | Proposal, discussions, technical data and final offer       | Hazard analysis, audit/test/record review and supplier documents                                         | Attributed evidence package                               | Accountable assessor                        | New request/attempt; preserve non-response and old revision         |
| Check eligibility/conformity | Which mandatory rule is met, failed or unresolved?                              | Responsible, conforming offer and material terms            | Approved supplier and adequate hazard controls                                                           | Supported pass/fail/unknown assessment                    | Decision owner or evidence requester        | Recompute safely; new facts create new assessment                   |
| Compare                      | Are candidates assessed on the same declared objective and comparable evidence? | Relative technical merits, risks, price and trade-offs      | Evidence against food-specific hazard/control requirements, not necessarily supplier-to-supplier ranking | Comparison or adequacy record with unresolved differences | Authorized decision owner                   | Repeat only on frozen evidence; updated evidence creates revision   |
| Clarify                      | Is communication permitted, fair, scoped and attributable?                      | Controlled offeror clarification/discussion                 | Request supplier evidence or explanation                                                                 | Message/response pair tied to issue                       | Sender, then recipient                      | New communication attempt; cannot erase prior ambiguity             |
| Decide                       | Who may exercise judgement and bear the consequence?                            | Source selection authority/contracting officer              | Importer and qualified individual                                                                        | Signed decision, rationale, scope, expiry/conditions      | Effect owner/administrator                  | Material change requires re-decision                                |
| Act externally               | What exact effect was requested and did it occur?                               | Award and contract performance                              | Supplier use, import entry, discontinuation                                                              | Contract/entry/effect receipt or honest unknown           | Contract administrator, provider, regulator | Reconcile before another potentially duplicative/conflicting effect |
| Inspect evidence             | Does the observed result prove the required fact?                               | Protest-file and performance/acceptance evidence            | Audit/test/control and inspection evidence                                                               | Attributed observation                                    | Inspector/decision owner                    | Repeat as a new time-bound observation                              |
| Handle exception             | What failed: input, rule, evidence, judgement, effect, or outcome?              | Unsupported scoring/material deviation/protest              | Missing verification or unimplemented control                                                            | Exception linked to exact affected record                 | Repair owner                                | Failure-class specific                                              |
| Repair                       | What new act corrects the problem without rewriting history?                    | Re-evaluate/re-award where possible, or limited cost remedy | Investigate, correct, modify, verify, discontinue or face import action                                  | Corrective-action record and linked new evidence          | Authorized domain owner                     | Never “retry until green”; verify the repair                        |
| Complete or continue         | What evidence closes this task, and what remains open?                          | Award/protest/performance have different completion records | Corrective closure is distinct from continuing supplier surveillance                                     | Resolution, residue and next-review date                  | Next named owner                            | Terminal only for the named task and evidence class                 |

## Rejected false equivalences with travel and event work

These are rejected equivalences, not claims that travel or event tasks never
carry regulation or contractual consequence. The point is that shared verbs do
not confer shared meaning.

| Apparent equivalence                                   | Rejection                                                                                                                                                                                                                    | Consequence for evals                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| “Available option” = eligible supplier/offer           | Procurement candidacy can depend on competitive-range rules and material conformity; food supplier use can depend on product-specific hazard and compliance evidence. Availability alone proves neither.                     | Eval must name the admissibility rule and evidence, not accept presence in search results.      |
| “Compare options” = apply one ranking function         | Public procurement must use declared factors, comparable treatment, and documented trade-offs. Supplier verification may compare evidence to a safety requirement rather than rank suppliers at all.                         | Eval fails an output that invents a universal score or silently changes the objective.          |
| “Ask for clarification” = send another message         | Procurement exchanges are procedure- and fairness-constrained; supplier clarification may require a qualified review of technical records.                                                                                   | Eval checks permission, audience, disclosure, attempt identity and what may change.             |
| “Choose” = “approve” = “award”                         | A traveller's preference, an event coordinator's recommendation, a procurement authority's source selection, supplier approval, and a regulator's compliance determination are different acts owned by different principals. | Recommendation and consequential authority must be separately evidenced.                        |
| “Confirmation received” = work completed               | An award notice does not prove performance or lawful evaluation. A supplier document does not prove an operating hazard control.                                                                                             | Completion rubric must name the exact required evidence class and owner.                        |
| “Cancel and pick another” = safe recovery              | A substantially performed contract may be impracticable to unwind. Discontinuing a food supplier can still leave imported product, recall, correction, and regulatory duties.                                                | Recovery eval must inspect existing effects and rights before proposing another effect.         |
| “Retry” = repeat the call                              | Repeating an award/import/approval can create conflicting obligations or additional exposure. Repeating a calculation or document request has different consequences.                                                        | Retry class belongs to the operation and known effect state, not the transport error.           |
| “One completed itinerary/event” = lifecycle completion | Procurement award, delivery, acceptance, protest and closeout are distinct. Supplier approval continues through verification, new information, correction, and re-evaluation.                                                | The system must expose task-bounded completion and residual owners rather than a global “done.” |
| “Provider says it is true” = verified supply           | Offeror assertions and supplier documents remain attributed inputs. Procurement evaluators and qualified supplier-control actors must assess them; physical or regulatory truth can require independent evidence.            | Eval fails if the system upgrades a supplied claim into verified conformity.                    |
| “Swap provider” = equivalent substitution              | Breaker design, contract terms, transition cost, food hazard controls, and supplier-specific compliance history are not fungible.                                                                                            | A replacement requires renewed admissibility, comparison, authority, and transition evidence.   |

## Smallest repeating trust-property set

The following is the smallest set supported by both cases. It is a checklist
for compilation and eval design, not a proposal for one persisted schema:

1. **Bounded objective and object identity.** The exact requirement, food,
   supplier, offer, contract, or other affected object is named.
2. **Rule and evidence revision.** Criteria, material terms, hazard/control
   requirements, evidence versions, and freshness are recoverable.
3. **Actor, principal and accountable owner.** The evidence author, assessor,
   recommender, decision owner, effect owner, inspector, and reviewer remain
   distinguishable.
4. **Admissibility before comparison.** Candidate presence is not treated as
   eligibility, conformity, approval, or routeable supply.
5. **Attributable gathering and clarification.** Every request, answer,
   non-response and disclosure boundary is tied to an actor and attempt.
6. **Supported judgement with honest unknowns.** The record preserves
   strengths, weaknesses, risks, missing evidence, conflicts, rationale, and
   the limits of any deterministic calculation.
7. **Authority bound to the consequential decision.** A recommendation or score
   cannot silently become award, supplier approval, import, termination, or
   regulatory acceptance.
8. **Attempt/effect separation.** Communication, decision, external effect and
   observed outcome are separately identifiable; an unknown effect is not
   converted to failure.
9. **Exception and repair lineage.** Protest, deficiency, investigation,
   corrective act, new evidence, re-evaluation and remedy link forward without
   rewriting the defective record.
10. **Task-bounded completion and next owner.** Completion names what closed,
    what evidence proves it, what remains open, who owns it, and when it must be
    revisited.

**INFERRED:** This set is smaller and more durable than a shared procurement,
travel, event, or supplier lifecycle because it describes how a domain result
earns trust rather than what the domain result must contain.

**INFERRED:** The most promising reusable seam is therefore a transition that
preserves these properties around a domain-owned action. The cases do not earn
a universal Task, Operation, Candidate, Quote, Decision, or Completion object.

## Known failure modes and eval ingredients

| Practitioner dimension      | Good                                                                                                                             | Bad                                                                                                                   | Stakes   | Source                                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision-basis integrity    | Every included/excluded candidate, rating, trade-off and condition is supported by the declared rule and cited evidence revision | Unstated criteria, unexplained score changes, missing material terms, or post-hoc rationale                           | Critical | [GAO B-246268](https://www.gao.gov/products/b-246268), [FAR 15.305](https://www.acquisition.gov/far/15.305)                                                                                                                              |
| Authority and role fidelity | The system prepares or recommends; the named accountable owner makes the consequential judgement                                 | Agent, committee score, supplier assertion, or third-party certificate silently becomes authority                     | Critical | [FAR 15.308](https://www.acquisition.gov/far/15.308), [FDA FSVP guide](https://www.fda.gov/media/110327/download)                                                                                                                        |
| Evidence applicability      | Evidence is tied to the exact candidate/object, hazard or criterion, source, date, and review                                    | Evidence is copied across products/suppliers/offers or treated as current without review                              | Critical | [FDA FSVP at-a-glance](https://www.fda.gov/media/97893/download), [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021) |
| Effect and recovery truth   | Existing commitments/performance/import exposure are reconciled before repair; unavailable remedies remain unavailable           | The system retries, substitutes, cancels, or declares failure without checking the prior effect                       | Critical | [GAO B-246268](https://www.gao.gov/products/b-246268), [21 CFR 1.508](https://www.ecfr.gov/current/title-21/part-1/section-1.508)                                                                                                        |
| Completion precision        | “Done” is limited to a named task and supported evidence; continuing obligations and next owner remain visible                   | Award means fulfilment, document means control, response means correction, or protest success means contract reversal | High     | [GAO B-246268](https://www.gao.gov/products/b-246268), [FDA Daisy warning letter](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)            |

Known domain-specific failure modes are:

- criteria drift or unequal treatment during competitive evaluation;
- well-formed but materially nonconforming offers being ranked as candidates;
- supplier files that exist but do not prove the required product/control;
- corrective-action intentions being mistaken for implemented repair;
- an effect becoming hard or impossible to reverse while review is pending;
- a completed subtask being projected as lifecycle or real-world completion.

## Human and unsupported work

**INFERRED:** The following should remain human-owned or unsupported unless a later selected
task, authority decision, provider contract, and intended-surface evidence earn
a narrower treatment:

- establishing public-procurement requirements, evaluation factors and lawful
  procedure;
- technical engineering judgement about a proposal's ability to meet the
  requirement;
- independent source-selection judgement and contract award, change,
  termination, or protest remedy;
- qualified food-hazard analysis, verification-method selection, onsite audit,
  sampling/testing, and adequacy judgement;
- supplier approval/discontinuation and investigation of noncompliance;
- physical performance, inspection, regulatory determination, recall, import
  admission/refusal, and legal dispute.

An agent may help extract, organize, compare, flag inconsistencies, draft
questions, preserve lineage, and show the supported next step. These cases do
not establish that it may make the accountable judgement or perform the
external effect.

## Remaining residue

- **UNKNOWN:** Whether the other Wayfinder #183 cases in travel and event
  management preserve the same ten trust properties without adding or
  contradicting one.
- **UNKNOWN:** Which single cross-industry task is independently useful enough
  for AE's first real customer and provider cohorts.
- **UNKNOWN:** Whether real providers will expose structured verification or
  quotation operations, or whether operator-mediated correspondence remains
  the actual service.
- **UNKNOWN:** Which evidence can AE independently check rather than preserve as
  an attributed claim.
- **UNKNOWN:** The applicable procurement, contract, food-safety, agency, and
  consumer law for AE's selected jurisdiction and task.
- **UNKNOWN:** Whether the cost of qualified review, supplier maintenance,
  clarification, exception handling, and recovery shifts more work to AE
  operators than the customer saves.
- **UNKNOWN:** Whether the repeating properties compile into one portable
  continuation projection without requiring one shared domain schema.

## Hypotheses and falsifiers

| ID            | Hypothesis                                                                                                                                        | Population / baseline                                                             | Measurement                                                                                                                  | Falsifier                                                                                                                              | Owner                 | Review by  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------- |
| H-WF183-PS-01 | The ten trust properties compile both a procurement evaluation and supplier-control review without giving the same field two conflicting meanings | These two official cases; separate domain records today                           | Domain experts independently map each case and agree whether each property is present, absent or not applicable              | Any required property implies conflicting authority, evidence, retry or completion semantics, or requires a universal domain object    | Product + Engineering | 2026-08-18 |
| H-WF183-PS-02 | One evidence-gathering or comparison task can reduce coordinator work while leaving consequential judgement with the accountable owner            | Direct email/spreadsheet/document-review baseline for selected cohort             | Customer minutes, provider minutes, operator minutes, correction rate, unresolved evidence, and decision-owner comprehension | Operator/provider work offsets customer saving; output changes or obscures authority; domain owner cannot reproduce the decision basis | Product               | 2026-08-18 |
| H-WF183-PS-03 | Cold continuation can use task-bounded records and next-owner state without reconstructing a whole procurement or supplier lifecycle              | Current transcript/history-driven handoff                                         | Cold human and agent identify exact completed task, unknowns, allowed next step, authority owner, and retry posture          | Hidden history is needed, prior external effect is misread, or the participant projects subtask completion as lifecycle completion     | Product + Engineering | 2026-08-18 |
| H-WF183-PS-04 | A contrasting travel or event case retains the trust properties while rejecting procurement/supplier domain fields                                | Procurement/supplier grammar versus independently reconstructed travel/event case | Field-by-field transfer review and direct-path control                                                                       | Transfer requires procurement or food-safety nouns in neutral machinery, or drops an authority/effect/recovery invariant               | Product + Engineering | 2026-08-18 |

## Decision impact

**INFERRED:** This evidence advances, but does not alone resolve, Wayfinder #183.

It supports carrying the ten trust properties into the final cross-industry
compilation and explicitly rejects:

- a shared candidate or quote meaning;
- a universal comparison/ranking function;
- conversational assent as consequential authority;
- generic “confirmation” or “completion” states;
- retry as a transport-level default;
- a common procurement/supplier lifecycle schema.

No project-record, ADR, source, issue-state, or public-contract update is
authorized by this research alone. The parent investigation must combine this
record with concrete travel and event cases, resolve conflicting residue, and
apply the Wayfinder issue workflow before any tracker resolution.

## Current-versus-target check

- **Current evidenced behavior:** AE can expose published business information,
  compare supported public facts, send a qualified inquiry, and exercise the
  separately evidenced authenticated Customer Request development path. This
  research does not change that state.
- **Target behavior informed by this research:** A domain-owned action may be
  independently invoked or composed while neutral machinery preserves
  objective/rule revision, actors, attribution, authority, attempts, effects,
  exceptions, repair lineage, completion boundary, and next ownership.
- **Claims this research does not authorize:** AE does not thereby procure,
  award, contract, verify food suppliers, inspect controls, approve suppliers,
  import goods, terminate contracts, remedy protests, provide independently
  operated supply, fulfil real work, or create customer value. It does not
  authorize production deployment or Phase 1/2 implementation.

## Sources

- [US GAO: _Sonshine Enterprises_, B-246268, 26 February 1992](https://www.gao.gov/products/b-246268)
- [Federal Acquisition Regulation 15.305: Proposal evaluation](https://www.acquisition.gov/far/15.305)
- [Federal Acquisition Regulation 15.306: Exchanges with offerors after receipt of proposals](https://www.acquisition.gov/far/15.306)
- [Federal Acquisition Regulation 15.308: Source selection decision](https://www.acquisition.gov/far/15.308)
- [Federal Acquisition Regulation 33.104: Protests to GAO](https://www.acquisition.gov/far/33.104)
- [FDA: Foreign Supplier Verification Programs — At a Glance](https://www.fda.gov/media/97893/download)
- [FDA: Foreign Supplier Verification Programs — Small Entity Compliance Guide](https://www.fda.gov/media/110327/download)
- [FDA warning letter: Daisy Global Trading Co, CMS 612999, 15 April 2021](https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/daisy-global-trading-co-612999-04152021)
- [21 CFR 1.508: Corrective actions under an FSVP](https://www.ecfr.gov/current/title-21/part-1/section-1.508)
