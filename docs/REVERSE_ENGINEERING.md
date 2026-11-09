# Splitwise reference investigation

Investigated 2026-11-08 using the requested [REA skill](https://github.com/morluto/rea) and the supplied [Splitwise App Store listing](https://apps.apple.com/us/app/splitwise/id458023433). This is a bounded reference investigation, not a decompilation of the iOS app or a claim of feature parity. Fairshare is an independent implementation.

## Evidence and boundary

| Evidence | Observation | Limit |
| --- | --- | --- |
| App Store description | Describes groups, online expenses, balances, equal and unequal splits, debt simplification, recorded cash payments, categories, receipt storage/scanning, and mobile/web access. | Publisher statements, not measured runtime behavior. |
| [Splitwise public site](https://www.splitwise.com/) | Separates balances, organizing expenses, adding expenses, and settling up; distinguishes receipt scanning and other Pro capabilities. | Public marketing experience only; no account was used. |
| REA `binary_session` | Connected REA 6.7.0; no target open. Native Ghidra and Hopper engines are unavailable in this environment. | Capability inventory is not analysis of Splitwise. |
| Local artifact search | No file path containing “Splitwise” was returned under `/Applications` or `~/Applications`. | Bounded search, not proof that no copy exists elsewhere. No IPA/APK was provided. |
| REA static analysis | Analyzed three public JavaScript assets referenced by the Splitwise home page: 4,749 bytes; three parsed files; no parse failures. | Public landing-page assets only. Application coverage is partial and semantic coverage unknown. 377 semantic unknowns remain. No target JavaScript was executed. |

The REA application evidence ID is `ev_2f870af130ced76e1b5b418cd385c8e4283e0a58eb6c8180c6c4ac196de43805`. Its summary view is `ev_7ea0200c6da2056f95d3b67d6ff1aa7ce3b221236f8d4426f27d8c809e66f110`. The captured asset-tree SHA-256 is `d4fa120989483d68116706dd79a250e610a029d2bacace5f18f0d2126fd2345a`.

Local evidence is retained outside the deliverable source at `work/splitwise-evidence/` in the task directory: public page HTML, URL/byte/hash manifest, downloaded JavaScript, and `rea-evidence.json`. The captured `application.js` response contained zero bytes. `motel.js` imports Rails UJS and the `motel/motel` module. Inspection of the 4,685-byte `motel-motel.js` found landing-page icon transitions, a press gallery, dropdown handling, and an `auth` query-dependent display toggle. These source observations describe UI code, not execution. They do not reveal receipt extraction, ledger arithmetic, server authorization, or iOS implementation. No third-party code or artwork is incorporated into Fairshare.

## Reconstruction priorities

The first column below derives from the public product descriptions. The implementation column is our own design, not recovered Splitwise architecture.

| Reference behavior | Fairshare first version | Verification priority |
| --- | --- | --- |
| Groups and shared expenses | Account-backed groups with named members and invite joining | Group access cannot leak across users |
| Equal/unequal expenses | Integer minor-unit amounts; equal or exact splits; one payer | Remainder distribution is deterministic and splits conserve the total |
| Balances and simplified debts | Derive net balances and suggested transfers from expenses and settlements | Net group balance remains zero; payment direction is correct |
| Settle up | Record money paid elsewhere | Never imply an in-app money transfer occurred |
| Receipts | Attach optional receipt images and submit structured receipt drafts | Unreviewed submissions do not change balances |
| History | Preserve voided expense history | Removing an expense reverses its balance effect without erasing the record |
| Mobile and web | Shared Expo client; Expo web and Node API on Vercel; PostgreSQL on Neon | Web build and API tests; native compatibility requires later device validation |

## Agent extension

Provider-neutral agents are a new user-requested feature, not observed in the reference. The intended boundary is:

1. A group owner creates a revocable, group-scoped key for an agent.
2. The agent obtains the group's member IDs and currency, then extracts a receipt using its own provider.
3. The agent sends a validated structured draft and optional image to Fairshare, with a stable source ID.
4. A person checks the payer, amount, currency, and split, then approves or rejects it.
5. Approval creates an expense atomically; identical submission retries and repeated approval must not create duplicate ledger entries.

REST is the integration contract; a local MCP adapter can expose the same operations to compatible clients. Claude and Grok are examples of upstream providers, not built-in OCR services or verified end-to-end provider integrations. Agent keys should not authorize approvals, settlements, member management, or other groups.

## Remaining unknowns

- Native Splitwise screens, local storage, wire protocol, conflict handling, receipt OCR implementation, and rounding rules were not inspected.
- An authenticated Splitwise runtime and a legitimately supplied IPA/APK would enable deeper behavior or artifact investigation; neither is required to complete this independent first version.
- Percentage/share splits, recurring bills, multi-payer expenses, currency conversion, offline synchronization, push notifications, export, and payment-provider integrations are outside this first version.
- The public asset sample is not the authenticated expense application. Its lack of ledger findings does not establish that those features are absent from Splitwise.

The feature-reference question is partially answered; public asset composition is answered within the captured three-file sample; native implementation and algorithm equivalence remain unresolved.

## Visual reconstruction: November 8, 2026

The UI redesign uses the five screenshots currently served by the [official App Store listing](https://apps.apple.com/us/app/splitwise/id458023433), plus the official [2019 redesign article](https://blog.splitwise.com/2019/07/09/splitwise-redesigned/). These screenshots were actually viewed; source-image manifests are retained in the task's `work/splitwise-evidence` folder. This is visual evidence, not decompiled native source or a live authenticated Splitwise session.

Observed in the current listing: white flat group rows; teal credits and orange debts; compact geometric group covers with overlapping square avatars; group names and inline balances; month-grouped expense rows with date, category, payer/total, and the viewer's net share; a sparse expense composer with description, amount, and the paid-by/split sentence. The historical official article confirms Friends/Groups/central add/Activity/Account navigation, friends rows, and activity rows. The current listing crops the bottom navigation, so the latest native navigation version is not established.

Fairshare adopts those structures, colors, and density while retaining its own name and independent code. Desktop adapts navigation into a sidebar. The [official split-options help](https://kb.splitwise.com/balances-and-expenses/what-are-different-ways-i-can-split-an-expense) establishes the paid-by/equally entry point; our Equal/Exact selector is independently designed because a genuine split-selection screenshot was not available. Fairshare does not claim to implement all Splitwise features, payment processing, percentage splits, or its proprietary code. Agents and receipt review remain available under group settings.

Verification used a 390×844 mobile viewport and desktop rendering with explicitly isolated local fixtures. No real user records or live synthetic accounts were created for this redesign. Expense-share display, currency-separated totals, and PostgreSQL date serialization have dedicated tests.
