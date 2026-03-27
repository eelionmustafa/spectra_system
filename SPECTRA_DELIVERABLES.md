# SPECTRA — System Deliverables

---

## 🟣 A. Summary of Improvements

### What Was Changed and Why

**Performance & Streaming (Most Impactful)**
- **Monitoring page**: Converted from blocking SSR to Suspense streaming. Four slow queries (frozen accounts, document requests, collateral reviews, system events) now run in parallel inside a single `<Suspense>` boundary. Page shell renders in milliseconds; content streams in when ready.
- **Concentration page**: Same pattern. Five portfolio concentration queries run in parallel. HHI calculations no longer block the page shell.
- **Client Profile page**: Critical path reduced to one query (getClientProfile). All 9 remaining queries (DPD history, EWI, actions, products, case history, restructuring, committee, recovery, write-off) run in one flat Promise.all inside a Suspense boundary.
- **Clients list page**: Three major fixes: (1) COUNT query now skips the expensive DueDaysDaily GROUP BY when no DPD filter is active; (2) results cached 60 seconds for all no-filter pages; (3) query timeout reduced from 30s to 15s for faster failure. PaginationButtons converted from function-in-component to JSX variable.
- **Dashboard**: getRecentTransactions moved out of the critical path into a Suspense boundary with .catch(). Dashboard KPIs render even if transactions time out.
- **Notifications page**: Converted from client-side useEffect (blank screen on load) to SSR with Suspense. Notifications now stream from server on first render — no JS waterfall, no loading spinner.
- **Watchlist page**: Added Suspense streaming. Topbar renders immediately; watchlist data streams in.

**Bug Fixes**
- Dashboard query timeout: getRecentTransactions reduced from 180-day to 30-day window; pre-filtered with TOP 50 in CTE; now non-fatal (catches error, shows fallback).
- Portfolio "loans is not defined": Scoping error fixed. kpis.avg_ltv used instead of loans.length.
- TransformStream error (digest 435454560): React cache() incompatible with Turbopack. Removed entirely from monitoring and concentration pages. Single async content component per page, one Promise.all.
- Clients SQL binding error: Conditional data query split introduced operator-precedence issue. Reverted to single unified query. Cache improvement retained.

**New Features Wired Up**
- getCardSpendAlerts() and getOverdraftDependency(): Now displayed on the Monitoring page as "Card Spend Alerts" and "Chronic Overdraft Dependency" sections with full tables.
- getHighestRiskClient(): Wired into Dashboard priority actions. When Stage 3 clients exist, the action card now shows the specific highest-exposure client ID and links directly to their profile.

**Cleanup**
- Debug console.log removed from getClientAccounts.

---

## 🔵 B. SPECTRA System Explanation

### What SPECTRA Is

SPECTRA is a credit risk intelligence platform for bank relationship managers and risk officers. It connects directly to the bank's SQL Server database and gives staff a real-time picture of portfolio health, individual client risk, and required actions — all in one place.

The platform is built on three principles:
1. **Show the worst first** — Critical alerts, impaired clients, and overdue actions are always surfaced before anything else.
2. **Always tell the analyst what to do next** — Every page ends with a recommended action or a link forward.
3. **Never show a blank screen** — Every page streams its shell immediately. Slow queries load in the background while the analyst can already read the page title, navigation, and context.

### The 11 Pages and Their Purpose

**Dashboard** — The morning briefing. Opens with a Portfolio Health Score (0–100) and five key metrics: total exposure, NPL ratio, Stage 3 count, Stage 2 count, and average DPD. Below that: Today's Priorities — a contextual action list derived live from the data. If the NPL ratio is above threshold, it appears here. If there are Stage 3 clients, it appears here — with a direct link to the highest-exposure impaired client. Two charts (monthly exposure trend, IFRS 9 stage distribution) and a recent transactions table complete the view.

**Portfolio** — The balance sheet view. Total exposure broken down by product type (mortgages, personal loans, overdrafts, card), geographic region, and IFRS 9 stage. A top-8 loans table shows the largest individual exposures. ECL provisions (Expected Credit Loss) are shown by stage. Designed to answer: "Where is our money, and how much of it is at risk?"

**Monitoring** — The operational queue. Six sections: Frozen Accounts (clients with credit disbursements blocked), Document Request Queue (pending and overdue document submissions), Collateral Revaluations (recent LTV recalculations, flagging >80% LTV), Card Spend Alerts (top 5 cards with month-over-month spend acceleration >30%), Chronic Overdraft Dependency (clients using overdraft 3+ months in past 12), and System Events (automated stage changes and EWI triggers from the ML pipeline). This is where the analyst goes first thing each morning to clear their queue.

**Notifications** — The inbox. All system-generated alerts delivered to the analyst: stage changes, EWI triggers, risk escalations, recovery cases opened, committee requests. Filterable by priority (Critical / High / Medium / Low). Each notification links to the relevant client profile. Notifications are marked read individually or all at once.

**Early Warnings (EWI)** — The predictive risk engine. Three views:
- *EWI Monitor*: Clients with active delinquency alerts, filterable by severity and IFRS stage.
- *Predicted Deterioration*: ML model outputs showing 30/60/90-day probability of default for each client, with a visual Case Review carousel that shows SHAP factor explanations and recommended actions.
- *Recommended Actions*: The system's action recommendations across the portfolio, prioritised by urgency.

**Watchlist** — Formal monitoring. Clients added here are tracked on a 30-day review cadence. The page shows review status (Overdue >60d / Due 31–60d / Current ≤30d), DPD bucket distribution, and IFRS stage breakdown. An alert banner fires when clients are overdue for review.

**Clients** — The full client directory. 25 clients per page, searchable by ID or name, filterable by IFRS stage, DPD bucket, and account status. Clicking any row opens a slide-over drawer with key metrics and a link to the full profile.

**Client Profile** — The deepest page in the system. One page per client containing: risk overview (PD score, stage, DPD trend chart), active products and balances, EWI signals, case history, active actions, restructuring plan, committee log, recovery case, and write-off status. Quick Actions sidebar lets the analyst freeze the account, request documents, open a recovery case, log a restructuring plan, or escalate to committee — all from one screen.

**Analytics** — The statistical engine. Four independent sections:
- *Portfolio Analytics*: Rollrate matrix (how clients migrate between stages), ECL gap analysis, NPL trend over 12 months.
- *IFRS 9 Provisions*: ECL by stage and product, coverage ratio, provision requirements.
- *Behavioral Risk*: Repayment rate distribution, salary inflow patterns, overdraft dependency.
- *Risk Signals*: Credit utilisation, DTI ratios, consecutive lates.

**Concentration** — Basel III / EBA compliance. Herfindahl-Hirschman Index (HHI) for both product and geographic concentration. Top obligors list. Concentration by product and by region. Designed to answer: "Are we too exposed to any single product, region, or counterparty?"

**Stress Test** — Scenario modelling. Applies three PD shock scenarios (Mild 1.5×, Moderate 2.5×, Severe 4×) to the current portfolio and shows the resulting NPL and expected loss impact. Portfolio resilience is assessed automatically (Resilient / Moderate Stress / Severe Stress). Recommended next steps are shown based on the current scenario outcome.

**Audit Log** — Compliance and governance. Every action taken by any user (freeze, document request, restructuring, committee escalation, recovery, etc.) is logged with timestamp, user, and client. Exportable to CSV for regulatory review.

---

## 🟢 C. User Manual — Step-by-Step

### How to Start Each Day

1. Open SPECTRA. The **Dashboard** loads immediately.
2. Check the **Portfolio Health Score**. If it is below 60, escalate to senior risk management.
3. Read **Today's Priorities**. Each card has a direct action button — follow them in order.
4. Check the **Notifications** bell in the sidebar. Open it and clear unread items.
5. Open **Monitoring**. Work through:
   - Frozen Accounts: Are any due for review?
   - Document Queue: Are any overdue? Follow up with the client.
   - Collateral: Any LTV above 80%? Schedule a revaluation.
   - Card Spend Alerts: Any clients showing unusual spending?
   - Overdraft Dependency: Any clients with chronic overdraft reliance?

### How to Investigate a Client in the Early Warnings

1. Go to **Early Warnings → EWI Monitor**.
2. Filter by severity: start with **Critical**.
3. The **Case Review** panel shows the highest-risk client. Read the PD score, SHAP drivers, and recommended actions.
4. Click **Open full client profile →** to go deeper.
5. On the client profile: review DPD history chart, check active products, read the EWI panel.
6. Choose an action from the **Quick Actions** sidebar on the right:
   - If the client is missing documents → **Request Documents**
   - If the risk is escalating → **Escalate to Committee**
   - If disbursements must be stopped → **Freeze Account**
   - If restructuring is viable → **Log Restructuring Plan**
   - If the loan is unrecoverable → **Open Recovery Case**
7. Click **Next →** in the Case Review to move to the next client.

### How to Add a Client to the Watchlist

1. Open the **Client Profile** of the target client (via Clients page or Early Warnings link).
2. In the Quick Actions sidebar, click **Add to Watchlist**.
3. The client now appears in **Watchlist** with a 30-day review cadence timer.
4. Return to Watchlist weekly to check for clients marked "Overdue" (>60 days).

### How to Run a Stress Test

1. Go to **Stress Test**.
2. The system automatically shows the current portfolio under three scenarios: Mild, Moderate, Severe.
3. Read the **Portfolio Resilience** assessment at the top.
4. Check which scenario is most likely given current market conditions.
5. Follow the **Recommended Next Steps** links at the bottom (e.g., "Review Stage 2 clients" → Watchlist).

### How to Prepare a Compliance Report

1. Go to **Audit Log**.
2. Review the action log for the relevant period.
3. Click **Export CSV** to download the full log.
4. Cross-reference with the **Analytics → IFRS 9 Provisions** section for ECL numbers.
5. Use **Concentration** page for Basel III / EBA concentration reporting.

---

## 🟡 D. Scenario-Based Use Cases

### Scenario 1: Client Shows First Signs of Deterioration

**Situation**: The ML pipeline flags a client with PD score rising from 18% to 34% over 30 days.

1. A **Notification** appears: *"Risk Escalation — Client X probability of default increased to 34%"* (High priority).
2. The client also appears in **Early Warnings → EWI Monitor** with severity: High.
3. The analyst opens the **Case Review**. SHAP drivers show: *"Max DPD spiked (6M)"* and *"Missed payments increasing"*.
4. The analyst opens the **Client Profile**. The DPD history chart shows a clear upward trend starting 3 months ago. The last salary inflow was recorded 2 months ago.
5. Recommended action (shown in the Quick Actions sidebar): **Request Documents** (updated income statement + bank statements).
6. The analyst logs the document request. The client appears in the **Monitoring → Document Request Queue**.
7. The client is also **Added to Watchlist** for 30-day formal monitoring.
8. All actions are logged in the **Audit Log**.

**Outcome**: Client is now under active surveillance. If documents are not submitted in 14 days, an overdue flag will appear in the document queue.

---

### Scenario 2: Portfolio NPL Ratio Spikes Above Threshold

**Situation**: The Dashboard shows NPL Ratio at 8.4% — above the 7% red threshold.

1. The **Dashboard** shows a red priority action: *"NPL Ratio Elevated — Portfolio NPL at 8.4%"*.
2. The analyst clicks **Review →** and is taken to **Early Warnings**.
3. Filtering by Stage 3: 12 clients listed. Sorted by PD score descending.
4. The analyst works through the Case Review carousel:
   - 4 clients are already in recovery → no new action needed.
   - 3 clients have no open case → analyst opens Recovery Cases for each.
   - 2 clients are restructured → analyst reviews restructuring plan viability.
   - 2 clients have high LTV collateral → analyst schedules collateral revaluation.
   - 1 client is a write-off candidate → analyst logs the write-off recommendation for committee review.
5. The analyst goes to **Analytics → NPL Trend** to confirm whether this is a new trend or a one-month spike.
6. **Stress Test** is run to see the capital impact under Severe scenario.
7. Findings are presented using the **Audit Log** CSV export.

---

### Scenario 3: Card Spend Acceleration Alert

**Situation**: Monitoring shows a client with 78% month-over-month card spend increase.

1. The **Monitoring → Card Spend Alerts** section shows: Client ID, Account, Current Spend €4,200, MoM Growth +78%.
2. The analyst opens the **Client Profile**. Card utilisation is at 94% of limit.
3. The EWI panel shows: *"Card utilisation near limit"* flagged as a behavioral signal.
4. The client is Stage 1 (currently performing) but the behavioral flags suggest early stress.
5. The analyst **Adds to Watchlist** and logs a manual EWI note.
6. A soft **Document Request** is raised for the latest 3 months' bank statements.
7. The client's case is queued for review at next month's risk committee.

---

## 🔴 E. Presentation Script — Storytelling Style

### "The Case of Arjun Mehta"

*[Presenter stands at the screen. Clicks to open SPECTRA Dashboard.]*

---

**Good morning.**

This morning, I'm going to tell you the story of Arjun Mehta.

Arjun is 41 years old. He has a mortgage, a personal loan, and an overdraft at our bank. For five years, he was a perfect client. On-time payments. Stable salary. Model credit profile.

But twelve months ago, something changed.

His company started having cash flow problems. He began drawing on his overdraft more frequently. His repayments became irregular. Then, three months ago, he missed a payment entirely.

At a traditional bank, this would go unnoticed — buried in a spreadsheet, reviewed quarterly.

**Not here.**

*[Click to Notifications page. A red "Critical" notification is visible at the top.]*

The moment Arjun's risk profile changed, SPECTRA knew.

Right here — a Critical notification. *"Stage Migration Alert — Arjun Mehta has moved from Stage 1 to Stage 2."*

But SPECTRA doesn't just tell us something happened. It tells us **what to do**.

*[Click to Early Warnings. Arjun's case appears in the Case Review.]*

Here he is. PD score: 47%. That means there is a 47% probability that Arjun will default within 90 days.

And look — two risk drivers, explained by our ML model. First: *"Max DPD spiked in the last 6 months."* Second: *"Salary inflow stopped."*

That second one is the most important. His employer stopped depositing to this account two months ago.

*[Click to Client Profile.]*

Here is Arjun's full profile. We can see his DPD history — the chart shows exactly when things went wrong. We can see his products: a €180,000 mortgage, a €22,000 personal loan, and an overdraft sitting €7,400 in the red.

We can see that no one has contacted him in 47 days.

And here — on the right — are our recommended actions:

1. Request updated income documents.
2. Schedule a restructuring assessment.
3. Freeze the overdraft to stop further exposure.

*[Pause.]*

In a traditional bank, Arjun's case might have been caught at the quarterly review — 90 days after he first started struggling.

With SPECTRA, we knew on day one.

We reached out. We offered a structured repayment plan. We protected both Arjun and the bank.

This isn't just technology. This is the difference between a bank that **reacts** and a bank that **prevents**.

That is what SPECTRA was built to do.

*[Pause for effect.]*

Thank you.

---
*End of deliverables.*
