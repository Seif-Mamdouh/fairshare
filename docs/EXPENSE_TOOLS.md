# Free expense tools

All Fairshare features are free to use. There is no subscription, expense-count paywall, annual-plan requirement, or Trip Pass gate. Account security/rate limits still apply. Bank transaction imports use the configured Plaid environment; Sandbox contains fake bank data, not live transactions.

## Receipt scanning and itemization

Open Add expense → Expense tools → Scan receipt. Choose a receipt image up to 10 MB. Tesseract.js reads English text in a browser worker; the receipt image is processed locally rather than uploaded to an OCR service. Its worker and language assets are downloaded on first use. The app suggests the merchant, date, total, item lines, tax and tip. Unclear or missing values must be entered manually. Scanning never posts an expense automatically.

Use Itemize to review each detected line (or enter items manually), enter its total price, and select the people sharing it. Tax and tip are allocated in proportion to each person's item subtotal. Integer-cent largest-remainder allocation preserves the total exactly. Apply itemized split fills the amount and exact shares; Save expense is the separate final action. Saved expense details retain the original items and their participants. Use manual split instead removes item metadata if you want to change the allocation manually.

The OCR engine runs on the web. Native clients support manual itemization; open the same account in a browser for receipt OCR. This is not a native OCR SDK or a claim of perfect receipt recognition. Human/agent receipt-inbox payloads retain their existing contract; these extra itemization fields belong to reviewed expense input, not the existing agent receipt tool.

## Currency conversion

Add expense → Currency converts an original purchase into the group's accounting currency. Select the original currency, amount and date, then look up a reference rate or enter your statement's actual rate. Review the converted amount and split before saving. The original amount/currency, rate, date and source are retained on the expense. Balances use only the saved group-currency amount and never change when exchange rates change later.

Reference rates come from the public Frankfurter API with no API key. Only currency codes and the requested date are sent; no user identity, receipt or expense amount is sent. Rates are reference values, not a bank/card quote. Unavailable rates have an explicit manual-entry fallback. Current supported group/purchase currencies are USD, EUR, GBP, CAD, AUD and EGP. Bank imports retain their posted amount/currency; cross-currency bank imports are not enabled. Itemization operates in group currency; applying it replaces prior conversion metadata.

## Saved split defaults

Choose the payer and participants, then Expense tools → Defaults → Save current split as default. Equal splits save equal weights; exact shares save proportional weights. Future amounts use those proportions with cent-safe rounding rather than repeating fixed dollar shares. Defaults are private to each user and group, persisted server-side, and available after signing in from another device. They do not modify existing expenses or another member's defaults. Clearing defaults restores the ordinary whole-group equal split.

## Charts and search

Open a group → Charts for category, monthly and payer spending, with a date range. Amount labels accompany each bar. Totals exclude removed expenses and settlements. Charts stay in one group's currency; currencies are never summed together.

Group → Search searches that group. Workspace → Search all expenses searches your groups with text, category, group, date and amount filters. Text includes descriptions, associated people and itemized receipt labels. Results show their original group currency. Removed expenses are excluded. Searches show up to 200 matches at once; narrow filters for larger result sets. This is a display bound, not an expense-count limit.

## API and storage

- Workspace-only `GET /api/exchange-rate?from=USD&to=EUR&date=YYYY-MM-DD` returns rate/date/source; throttled per user.
- Workspace-only `POST /api/groups/:id/split-defaults` accepts `{paidBy, weights:[{memberId,weight}]}` after membership validation; DELETE clears the caller's preference. Own group detail includes `splitDefaults`.
- Human expense input accepts optional `itemization` and `conversion` metadata. Backend validation independently checks item totals, shares, group membership, conversion arithmetic and the expense total.
- Additive `expenses.itemization`, `expenses.conversion` JSON columns and `split_defaults` table require the standard schema migration. No paid-provider secrets are required.

References: [Tesseract.js](https://github.com/naptha/tesseract.js), [Frankfurter reference rates](https://frankfurter.dev/).
