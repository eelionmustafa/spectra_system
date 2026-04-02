# SPECTRA Credit Risk Intelligence Platform
## Software Requirements & Design Document
**Version 1.0 | March 2026 | Internal Confidential**

---

## Table of Contents

1. [Business Need](#1-business-need)
2. [Key Functionalities](#2-key-functionalities)
3. [System Requirements Analysis — Functional & Non-Functional](#3-system-requirements-analysis)
4. [User Stories](#4-user-stories)
5. [Use Case Diagram](#5-use-case-diagram)
6. [Use Case Descriptions](#6-use-case-descriptions)
7. [Activity Diagrams](#7-activity-diagrams)
8. [Class Diagram](#8-class-diagram)
9. [Rough High-Level Design](#9-rough-high-level-design)

---

## 1. Business Need

### 1.1 The Problem

Financial institutions managing large credit portfolios face a fundamental operational challenge: **credit risk is dynamic, multi-dimensional, and time-sensitive**, yet most banks still rely on fragmented, siloed systems — spreadsheets, disconnected core banking reports, and manual review cycles — to identify and act on deteriorating credit quality.

This creates four compounding pain points:

| Pain Point | Consequence |
|---|---|
| **Late signal detection** | Risk officers learn of deteriorating accounts only when DPD thresholds are breached — weeks after the first warning signs appear |
| **Manual classification** | IFRS 9 stage assignment (Stage 1/2/3) is done manually, inconsistently, and often quarterly rather than continuously |
| **No unified risk view** | Portfolio health, concentration exposure, ECL provisions, and individual client signals live in separate systems with no single source of truth |
| **Compliance burden** | Generating audit trails, provision calculations, and regulatory reports for IFRS 9, Basel III, and internal credit committees requires significant manual effort |

### 1.2 What SPECTRA Solves

SPECTRA is a **real-time credit risk intelligence platform** purpose-built for the credit risk function of a financial institution. It integrates portfolio analytics, machine learning–driven early warning indicators, IFRS 9 classification automation, and a full workflow layer (freeze, restructure, escalate, recover) into a single, role-governed web application.

**Core value propositions:**

- **Risk Officers** get a live, prioritised action queue — knowing exactly which clients need attention today, why, and what action to take — instead of reviewing hundreds of accounts manually.
- **Analysts** can drill into any client's full risk profile, prediction history, engagement log, collateral valuation, and ECL provision without switching systems.
- **Bank Administrators** have full audit traceability, role-based access control, and system health visibility to satisfy both internal governance and external regulatory requirements.
- **Credit Committees** receive structured escalation dossiers with ML predictions, historical signals, and recommended dispositions — eliminating the preparation overhead that typically consumes analyst time.

### 1.3 Strategic Value

SPECTRA delivers measurable impact across four dimensions:

1. **Earlier intervention** — EWI signals detect deterioration 30–90 days before DPD thresholds trigger, allowing proactive restructuring rather than reactive recovery.
2. **IFRS 9 compliance automation** — Continuous, rules-engine–driven stage classification and ECL provision calculation eliminates quarterly manual reconciliation.
3. **Concentration risk governance** — HHI index tracking and top-obligor watchlists prevent portfolio concentration from exceeding regulatory tolerances without visibility.
4. **Audit-ready operations** — Every system action, stage change, and user decision is immutably logged, reducing regulatory examination preparation from weeks to hours.

---

## 2. Key Functionalities

### 2.1 Dashboard
The home screen provides a real-time portfolio health summary. It displays KPI traffic lights (NPL ratio, Stage 2 rate, delinquency rate, total exposure), stage distribution across the portfolio (Stage 1/2/3 client counts and exposure), recent high-priority alerts, and quick-access navigation to flagged clients. KPIs use colour-coded thresholds (green/amber/red) derived from configurable regulatory benchmarks.

### 2.2 Portfolio Monitoring
A continuous-review module that tracks each client's assigned review cadence (Monthly for Stage 1, Weekly for Stage 2, Daily for Stage 3). Risk officers can view overdue reviews, update review frequency, log collateral revaluations, and request financial documents. Clients can be frozen (credit draw-down blocked) directly from this view.

### 2.3 Client Management
A full client risk profile accessible via search (name, ID, or account number). Each client profile presents seven information tabs: Overview (risk score, stage, PD, DPD), Actions (recommended and historical), EWI Predictions (ML signals and key risk drivers), Engagements (RM contact log), Documents (requested/received), Restructuring Plans, and Recovery Case history. Risk officers can execute all workflow actions from this single view.

### 2.4 Early Warning Alerts (EWI)
An AI-powered alert engine that continuously evaluates a configurable set of quantitative and qualitative signals (PD score, DPD trend, missed payments, salary inflow cessation, collateral LTV breach) to produce a deterioration risk rating (Low/Medium/High/Critical) and a prioritised list of recommended actions per client. Alerts are surfaced in the RM notification inbox and the Warnings page.

### 2.5 Watchlist
A curated list of clients under heightened scrutiny due to concentration risk or specific qualitative concerns. The system automatically flags clients whose single-obligor exposure exceeds 10% of the portfolio (EBA guideline). Risk officers can manually add or remove clients. The watchlist count is surfaced in the top navigation bar.

### 2.6 Risk Analytics
A suite of historical trend charts covering: NPL ratio over time, ECL provision balances, PD rating distribution, portfolio vintage analysis, and segment breakdown (retail vs corporate vs mortgage). Analysts use this module to identify portfolio-level deterioration trends and prepare management reports.

### 2.7 Concentration Analysis
Displays the top-N obligor exposures as a percentage of the total portfolio, an HHI (Herfindahl-Hirschman Index) concentration score, and sector/product concentration breakdowns. Flags portfolios as "highly concentrated" when HHI exceeds 2,500, triggering watchlist recommendations.

### 2.8 Stress Testing
A scenario modelling tool that applies PD shock multipliers to the current portfolio to calculate stressed ECL provisions and NPL projections under three scenarios: Baseline, Adverse (1.5× PD), and Severe (2.5× PD). Uses a fixed LGD assumption of 45%. Outputs include per-scenario provision impact and capital adequacy implications.

### 2.9 Audit Log
An immutable, append-only log of all system-initiated events (stage changes, risk score updates, EWI triggers) and user actions (freeze, escalate, document request, acknowledgement). Searchable by client, event type, date range, and performing user. Cannot be edited or deleted — satisfying regulatory requirements for audit trail integrity.

### 2.10 User Role Management
Three role tiers govern access: **Admin** (full system access, user configuration), **Risk Officer** (full workflow execution including freeze, escalate, restructure, legal referral), and **Analyst** (read access plus alert acknowledgement and engagement logging). Role assignment is enforced at both the API layer and UI layer to prevent privilege escalation.

### 2.11 Client Portal
A separate, lightweight self-service portal allowing end clients to log in, view their account notices, and exchange messages with their relationship manager. Portal access is isolated from the internal application via a separate authentication path and session context.

### 2.12 Notification Inbox
A real-time notification centre for risk officers that aggregates all system-generated alerts and stage-change events. Notifications are priority-ranked (Critical/High/Medium/Low) and support read/unread state, allowing risk officers to manage their daily alert queue. The inbox polls for new notifications every 60 seconds.

---

## 3. System Requirements Analysis

### 3.1 Functional Requirements

#### FR-AUTH: Authentication & Session Management

| ID | Requirement |
|---|---|
| FR-AUTH-01 | The system shall authenticate users via username/password and issue a signed JWT stored as an HttpOnly cookie |
| FR-AUTH-02 | Sessions shall expire after 8 hours of inactivity |
| FR-AUTH-03 | The system shall enforce IP-based rate limiting: 5 failed login attempts triggers a 15-minute lockout |
| FR-AUTH-04 | The system shall maintain separate authentication contexts for internal users and client portal users |
| FR-AUTH-05 | All API routes (except `/api/auth/login` and `/api/portal/auth/login`) shall require a valid session token |

#### FR-RBAC: Role-Based Access Control

| ID | Requirement |
|---|---|
| FR-RBAC-01 | The system shall support three roles: `admin`, `risk_officer`, and `analyst` |
| FR-RBAC-02 | Actions including Freeze Account, Legal Referral, Escalate, and Restructure shall be restricted to `risk_officer` and `admin` roles |
| FR-RBAC-03 | The `analyst` role shall have read access to all client data and may log engagements and acknowledge alerts |
| FR-RBAC-04 | The `admin` role shall have access to all system functions including user configuration and audit log management |
| FR-RBAC-05 | Role restrictions shall be enforced server-side on every API call, not only in the UI |

#### FR-RISK: Risk Classification & Scoring

| ID | Requirement |
|---|---|
| FR-RISK-01 | The system shall derive an IFRS 9 stage (1, 2, or 3) for each credit facility continuously, based on quantitative SICR criteria (PD ≥ 0.2, DPD ≥ 30) and qualitative signals |
| FR-RISK-02 | The system shall compute a composite risk score: `(PD × 60) + (DPD score × 25) + (EWI flags × 15)`, capped at 100 |
| FR-RISK-03 | Product-type–specific DPD thresholds shall be applied: 90 days for consumer credit, 60 days for mortgages |
| FR-RISK-04 | Stage classification shall support single-pass escalation (Stage 1 → Stage 3 if NPL criteria met) |
| FR-RISK-05 | The system shall record an ECL provision entry on every stage reclassification: 1% (Stage 1), 5% (Stage 2), 20% (Stage 3) |

#### FR-EWI: Early Warning Indicators

| ID | Requirement |
|---|---|
| FR-EWI-01 | The system shall evaluate EWI signals including PD score, DPD trend, missed payment count, salary inflow cessation, and collateral LTV ratio |
| FR-EWI-02 | Each client shall receive a deterioration risk rating: Low, Medium, High, or Critical |
| FR-EWI-03 | The system shall generate a ranked list of up to 5 recommended actions per client, ordered by urgency |
| FR-EWI-04 | EWI signals shall be triggerable manually by a risk officer or automatically on a scheduled basis |
| FR-EWI-05 | Recommendation actions shall be tracked (actioned / not actioned) and attributed to the user who actioned them |

#### FR-WORKFLOW: Credit Workflow Actions

| ID | Requirement |
|---|---|
| FR-WF-01 | The system shall support credit freeze: blocking draw-down on a client's facilities with a mandatory reason field |
| FR-WF-02 | The system shall support restructuring plan creation with five plan types: LoanExtension, PaymentHoliday, RateReduction, DebtConsolidation, PartialWriteOff |
| FR-WF-03 | Restructuring plans shall follow a lifecycle: Proposed → Approved/Rejected → Active → Completed |
| FR-WF-04 | The system shall support credit committee escalation with a formal decision log (Restructure, LegalAction, WriteOff, Pending) |
| FR-WF-05 | Recovery cases shall track a four-stage process: DebtCollection → CollateralEnforcement → LegalProceedings → DebtSale/WriteOff |
| FR-WF-06 | Written-off clients shall be excluded from KPI calculations |
| FR-WF-07 | The system shall support salary sweep automation: detecting resumption of salary inflow and automatically triggering a recovery sweep |

#### FR-MONITOR: Portfolio Monitoring

| ID | Requirement |
|---|---|
| FR-MON-01 | Each client shall have an assigned review cadence automatically set from their IFRS stage |
| FR-MON-02 | The system shall track collateral revaluations with before/after values and LTV recalculation |
| FR-MON-03 | Risk officers shall be able to request specific document types from clients (financial statement, bank statement, tax return) |
| FR-MON-04 | Document requests shall track status (Pending/Received) and receipt timestamps |

#### FR-NOTIF: Notifications & Alerts

| ID | Requirement |
|---|---|
| FR-NOTIF-01 | The system shall generate notifications for stage changes, EWI alerts, and risk escalations |
| FR-NOTIF-02 | Notifications shall carry a priority level (Critical, High, Medium, Low) |
| FR-NOTIF-03 | Broadcast notifications (assigned_rm = NULL) shall be visible to all risk officers |
| FR-NOTIF-04 | Users shall be able to acknowledge alerts with one of three dispositions: reviewed, actioned, false_positive |
| FR-NOTIF-05 | The notification inbox shall poll for new alerts every 60 seconds |

#### FR-ANALYTICS: Analytics & Reporting

| ID | Requirement |
|---|---|
| FR-ANA-01 | The system shall provide portfolio-level KPIs: NPL ratio, Stage 2 rate, delinquency rate, total exposure |
| FR-ANA-02 | The system shall provide historical trend data for NPL ratio, ECL provision, and PD rating distribution |
| FR-ANA-03 | The system shall compute HHI concentration index and flag portfolios with HHI > 2,500 |
| FR-ANA-04 | The system shall provide stress test outputs for three scenarios (Baseline, Adverse 1.5×, Severe 2.5×) |
| FR-ANA-05 | All analytics pages shall support export to PDF/CSV format |

#### FR-AUDIT: Audit & Compliance

| ID | Requirement |
|---|---|
| FR-AUD-01 | All system-initiated events (stage change, risk score update, EWI trigger) shall be written to an immutable audit log |
| FR-AUD-02 | The audit log shall record: event type, client ID, old/new values, trigger reason, performing user, and timestamp |
| FR-AUD-03 | Audit log entries shall never be updated or deleted |
| FR-AUD-04 | The audit log shall be searchable by client, event type, date range, and user |

---

### 3.2 Non-Functional Requirements

#### NFR-SEC: Security

| ID | Requirement |
|---|---|
| NFR-SEC-01 | All passwords shall be stored as scrypt hashes — never in plaintext |
| NFR-SEC-02 | JWT secrets shall be stored as environment variables, never hardcoded |
| NFR-SEC-03 | All API responses shall include appropriate security headers (X-Frame-Options, CSP, HSTS) |
| NFR-SEC-04 | All database queries shall use parameterised statements to prevent SQL injection |
| NFR-SEC-05 | Session cookies shall be HttpOnly, Secure, and SameSite=Strict |
| NFR-SEC-06 | The client portal shall be completely isolated from the internal application in terms of session context and data scope |

#### NFR-PERF: Performance

| ID | Requirement |
|---|---|
| NFR-PERF-01 | Dashboard KPI queries shall return within 2 seconds under normal load |
| NFR-PERF-02 | All database read queries shall use `WITH (NOLOCK)` hints to avoid blocking contention |
| NFR-PERF-03 | Alert polling (60-second interval) shall use lightweight count queries, not full result sets |
| NFR-PERF-04 | The system shall support connection pooling to the Azure SQL database |

#### NFR-SCALE: Scalability

| ID | Requirement |
|---|---|
| NFR-SCALE-01 | The application shall be stateless to allow horizontal scaling via Vercel serverless functions |
| NFR-SCALE-02 | The database shall support up to 10,000 active client records without query degradation |
| NFR-SCALE-03 | All high-traffic tables shall have appropriate indexes on foreign keys and date columns |

#### NFR-AVAIL: Availability

| ID | Requirement |
|---|---|
| NFR-AVAIL-01 | The system shall target 99.5% uptime during business hours (07:00–20:00 local time) |
| NFR-AVAIL-02 | A `/api/db/ping` health-check endpoint shall be available for uptime monitoring |
| NFR-AVAIL-03 | Database connection failures shall be surfaced via error states in the UI, not silent failures |

#### NFR-USE: Usability

| ID | Requirement |
|---|---|
| NFR-USE-01 | The application shall be fully responsive for desktop and tablet viewports |
| NFR-USE-02 | Risk-critical information (stage, DPD, risk score) shall use consistent colour coding throughout the application |
| NFR-USE-03 | All data tables shall support sorting and filtering without a full page reload |
| NFR-USE-04 | The application shall include a mobile sidebar for navigation on smaller screens |

#### NFR-COMP: Regulatory Compliance

| ID | Requirement |
|---|---|
| NFR-COMP-01 | ECL provision rates and IFRS 9 stage classification logic shall be configurable to adapt to bank-specific regulatory requirements |
| NFR-COMP-02 | The audit log shall satisfy Central Bank audit trail requirements (immutable, timestamped, attributed) |
| NFR-COMP-03 | Concentration risk thresholds shall align with EBA Large Exposures guidelines (single obligor ≤ 25% of capital, internal watchlist at 10%) |
| NFR-COMP-04 | DPD thresholds for NPL classification shall be configurable per product type |

---

## 4. User Stories

### Admin Role

| ID | User Story |
|---|---|
| US-01 | As an **admin**, I want to view all system users and their assigned roles, so that I can ensure appropriate access governance and identify any privilege misconfigurations. |
| US-02 | As an **admin**, I want to access the complete audit log filtered by user, event type, or date range, so that I can produce evidence of system activity for regulatory examination or internal investigation. |
| US-03 | As an **admin**, I want to configure EWI thresholds (PD cutoff, DPD limits, provision rates) via environment variables, so that I can tune the system to changing regulatory guidelines without code changes. |
| US-04 | As an **admin**, I want to view system health via the database ping endpoint and connection pool status, so that I can detect and escalate infrastructure issues before they impact risk officers. |

### Risk Officer Role

| ID | User Story |
|---|---|
| US-05 | As a **risk officer**, I want to see a dashboard that shows my portfolio's NPL ratio, Stage 2 client count, and top critical alerts the moment I log in, so that I can immediately prioritise my workday without manually pulling reports. |
| US-06 | As a **risk officer**, I want to freeze a client's credit facilities with a documented reason, so that no further draw-downs occur while I investigate a deterioration signal, and the action is logged for compliance purposes. |
| US-07 | As a **risk officer**, I want to create and submit a restructuring plan for an at-risk client, so that I can offer a formal loan modification and track it through the approval lifecycle from proposal to completion. |
| US-08 | As a **risk officer**, I want to escalate a client to the Credit Committee with supporting notes, so that decisions requiring committee authority (legal action, write-off) are formally documented and tracked. |
| US-09 | As a **risk officer**, I want to acknowledge an EWI alert and record my disposition (actioned, reviewed, or false positive), so that the team maintains a clear record of which signals have been investigated and what was done. |
| US-10 | As a **risk officer**, I want to request a financial statement or bank statement from a client directly in the system, so that the request, follow-up, and receipt are all tracked without relying on email. |
| US-11 | As a **risk officer**, I want to run a stress test showing adverse (1.5×) and severe (2.5×) PD shock scenarios, so that I can quantify capital requirements under stressed conditions and present findings to senior management. |
| US-12 | As a **risk officer**, I want to view the top-10 obligor concentration list with their HHI contribution, so that I can monitor portfolio concentration risk and take action before EBA thresholds are breached. |

### Analyst Role

| ID | User Story |
|---|---|
| US-13 | As an **analyst**, I want to view a client's full risk profile including their EWI predictions, DPD history, collateral valuations, and ECL provision history, so that I can build a comprehensive credit dossier for committee presentation without requesting data from multiple teams. |
| US-14 | As an **analyst**, I want to view historical NPL and ECL trends across the portfolio, so that I can identify whether the portfolio is improving or deteriorating and support strategic risk reporting. |
| US-15 | As an **analyst**, I want to log a client engagement (phone call, site visit, email exchange) in the system, so that there is a complete, searchable record of all RM–client contact for audit and handover purposes. |

---

## 5. Use Case Diagram

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SPECTRA — UML Use Case Diagram                           ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ┌─────────────┐
  │             │──────────────────────────── (UC-01) Login
  │   Admin     │──────────────────────────── (UC-10) Manage Users & Roles
  │             │──────────────────────────── (UC-11) View Audit Log
  └─────────────┘                             (UC-02) View Dashboard ─────────┐
        │                                                                      │
        │ (inherits all Risk Officer                                           │
        │  and Analyst privileges)                                             │
        │                                                                      │
  ┌─────────────────┐                                                          │
  │                 │──────────────────────── (UC-01) Login                   │
  │  Risk Officer   │──────────────────────── (UC-02) View Dashboard ─────────┤
  │                 │──────────────────────── (UC-03) Manage Client           │
  │                 │──────────────────────── (UC-04) Generate EWI Alert      │
  │                 │──────────────────────── (UC-05) Add to Watchlist        │
  │                 │──────────────────────── (UC-06) Freeze Credit           │
  │                 │──────────────────────── (UC-07) Create Restructuring Plan│
  │                 │──────────────────────── (UC-08) Escalate to Committee   │
  │                 │──────────────────────── (UC-09) Run Stress Test         │
  │                 │──────────────────────── (UC-12) Export Report           │
  │                 │──────────────────────── (UC-13) Manage Notifications    │
  │                 │──────────────────────── (UC-14) Request Document        │
  │                 │──────────────────────── (UC-15) Open Recovery Case      │
  └─────────────────┘
        │
        │ (subset of Risk Officer privileges)
        │
  ┌─────────────┐
  │             │──────────────────────────── (UC-01) Login
  │  Analyst    │──────────────────────────── (UC-02) View Dashboard
  │             │──────────────────────────── (UC-03) View Client Profile
  │             │──────────────────────────── (UC-16) Log Engagement
  │             │──────────────────────────── (UC-17) View Analytics
  │             │──────────────────────────── (UC-18) Acknowledge Alert
  └─────────────┘

  ┌─────────────────┐
  │                 │──────────────────────── (UC-19) Client Portal Login
  │  Client         │──────────────────────── (UC-20) View Notices
  │  (Portal)       │──────────────────────── (UC-21) Send/Receive Messages
  └─────────────────┘

  ┌─────────────────────┐
  │                     │──── «triggers» ────── (UC-04) Generate EWI Alert
  │  EWI Scheduler      │──── «triggers» ────── (UC-22) Run Salary Sweep
  │  (Automated Actor)  │
  └─────────────────────┘

  ┌─────────────────────┐
  │                     │──── «uses» ─────────── (UC-04) Generate EWI Alert
  │  AI/ML Engine       │──── «uses» ─────────── (UC-09) Run Stress Test
  │  (Claude API +      │
  │   sklearn models)   │
  └─────────────────────┘

  ─────────────────── «include» relationships ───────────────────
  (UC-03) Manage Client          «include» (UC-AUTH) Verify Session
  (UC-06) Freeze Credit          «include» (UC-AUD)  Write Audit Log
  (UC-07) Create Restructuring   «include» (UC-AUD)  Write Audit Log
  (UC-08) Escalate to Committee  «include» (UC-AUD)  Write Audit Log
  (UC-04) Generate EWI Alert     «include» (UC-NOTIF) Create Notification
  (UC-05) Add to Watchlist       «include» (UC-NOTIF) Create Notification
```

---

## 6. Use Case Descriptions

### UC-01: Login

| Field | Detail |
|---|---|
| **Use Case Name** | Login |
| **Actor** | Admin, Risk Officer, Analyst |
| **Preconditions** | User has valid credentials. System database is reachable. |
| **Trigger** | User navigates to `/` and is redirected to the login page, or directly visits `/login`. |

**Main Flow:**
1. User enters username and password on the login form.
2. System validates that the IP has not exceeded the rate limit (5 failed attempts / 15 min).
3. System looks up the user record from the in-memory user store.
4. System verifies the submitted password against the stored scrypt hash.
5. System generates a JWT containing `{ userId, username, name, role, department, initials }` with an 8-hour TTL.
6. System writes the JWT to an HttpOnly Secure cookie (`spectra_session`).
7. System redirects the user to the Dashboard (`/`).

**Alternative Flows:**
- **A1 — Invalid credentials:** System returns HTTP 401. Increments failed-attempt counter for the IP. Displays generic "Invalid credentials" message (no username enumeration).
- **A2 — Rate limit exceeded:** System returns HTTP 429. Displays lockout message with remaining lockout time.
- **A3 — Database unreachable:** System returns HTTP 503. Displays system error; login not blocked (auth is stateless).

**Postconditions:** User has an active session cookie and is redirected to the Dashboard.

---

### UC-02: View Dashboard

| Field | Detail |
|---|---|
| **Use Case Name** | View Dashboard |
| **Actor** | Admin, Risk Officer, Analyst |
| **Preconditions** | User is authenticated. |
| **Trigger** | User navigates to `/`. |

**Main Flow:**
1. System validates the session cookie and extracts the user role.
2. System executes the `getPortfolioKPIs()` query (excluding written-off clients).
3. System fetches the top 8 critical alerts via `getActiveAlerts()`.
4. System retrieves the stage distribution (Stage 1/2/3 client count and exposure totals).
5. System evaluates each KPI against configured traffic light thresholds (e.g., NPL ≥ 5% → red).
6. Dashboard renders: KPI cards with colour indicators, stage distribution chart, alert feed, and quick-action shortcuts.
7. Alert feed auto-refreshes every 60 seconds via polling.

**Alternative Flows:**
- **A1 — No alerts:** Alert feed displays "No active alerts" state.
- **A2 — Database latency:** KPI cards display loading skeletons; error state shown if timeout exceeded.

**Postconditions:** User has a current, colour-coded snapshot of portfolio health. No data modifications occur.

---

### UC-03: Manage Client

| Field | Detail |
|---|---|
| **Use Case Name** | Manage Client |
| **Actor** | Risk Officer, Admin (write); Analyst (read-only) |
| **Preconditions** | User is authenticated. Client exists in the system. |
| **Trigger** | User searches for a client by name, ID, or account number and selects a result. |

**Main Flow:**
1. User enters a search term in the client search bar.
2. System queries `Customer`, `Credits`, and `RiskPortfolio` tables for matching records.
3. System renders a results list; user selects a client.
4. System loads the full client profile via `getClientProfile()`, including risk score, IFRS stage, DPD, PD, total exposure, and facility list.
5. System renders the client profile with seven tabs: Overview, Actions, EWI, Engagements, Documents, Restructuring, Recovery.
6. Risk Officer selects a workflow action (e.g., Freeze, Escalate) from the Actions tab.
7. System checks the user's role against the action's `requiresRole` restriction.
8. System executes the action (e.g., `POST /api/clients/[id]/freeze`).
9. System writes an immutable entry to `SystemActions` (audit log).
10. System creates a `Notification` entry for the relevant RM.

**Alternative Flows:**
- **A1 — Analyst attempts restricted action:** System returns HTTP 403. UI suppresses or disables restricted action buttons for the `analyst` role.
- **A2 — Client not found:** Search returns empty state; user prompted to check the ID.

**Postconditions:** Workflow action is executed, audit logged, and notification created. Client profile reflects updated state.

---

### UC-04: Generate Early Warning Alert

| Field | Detail |
|---|---|
| **Use Case Name** | Generate Early Warning Alert |
| **Actor** | Risk Officer (manual trigger); EWI Scheduler (automated) |
| **Preconditions** | Client exists. ML models are loaded. |
| **Trigger** | Risk officer clicks "Run EWI" on a client profile, or the automated scheduler fires `POST /api/ewi/fire`. |

**Main Flow:**
1. System retrieves the client's current financial signals: PD score, DPD, missed payments, salary inflow, collateral LTV.
2. System passes signals to the ML inference pipeline (sklearn models: `model_90d.pkl`, `model_dpd_escalation.pkl`, `model_stage_migration.pkl`).
3. ML pipeline outputs: composite risk score (0–100), deterioration risk (Low/Medium/High/Critical), key signals list, AI reasoning text.
4. System calls the Claude API to generate a human-readable risk narrative for the client.
5. System writes a new `EWIPredictions` record with the ML outputs and run timestamp.
6. System generates up to 5 ranked `EWIRecommendations` (e.g., "Contact Client", "Restructure", "Escalate").
7. System creates a `Notification` entry (priority mapped from deterioration risk) targeting the assigned RM.
8. System writes a `SystemActions` audit entry with `event_type = 'ewi_trigger'`.

**Alternative Flows:**
- **A1 — ML model unavailable:** System falls back to rule-based signal scoring without ML outputs. Flags prediction as "rule-based" in the record.
- **A2 — No deterioration detected:** No notification created. EWIPrediction recorded with `deterioration_risk = 'Low'`.

**Postconditions:** EWI prediction is persisted. Recommendations are generated. RM is notified if risk level is Medium or above.

---

### UC-05: Add to Watchlist

| Field | Detail |
|---|---|
| **Use Case Name** | Add to Watchlist |
| **Actor** | Risk Officer, Admin |
| **Preconditions** | User is authenticated as Risk Officer or Admin. Client exists. |
| **Trigger** | User clicks "Add to Watchlist" on a client profile, or concentration analysis flags the client automatically (exposure > 10%). |

**Main Flow:**
1. System checks whether the client is already on the watchlist.
2. System evaluates the client's concentration exposure percentage (client exposure / total portfolio exposure).
3. If exposure > 10% of portfolio: system automatically adds to watchlist and logs the trigger reason as "Concentration threshold breach."
4. If manually added: Risk Officer provides an optional note; system saves the entry with `added_by` = current user.
5. System creates a `Notification` for the RM with `priority = 'high'` if auto-triggered.
6. System writes a `SystemActions` audit entry.
7. Watchlist count in the top navigation bar updates on next poll.

**Alternative Flows:**
- **A1 — Client already on watchlist:** System returns HTTP 409. UI displays "Already on watchlist" message.

**Postconditions:** Client appears on the Watchlist page. Notification created if auto-triggered by concentration threshold.

---

### UC-06: Run Stress Test

| Field | Detail |
|---|---|
| **Use Case Name** | Run Stress Test |
| **Actor** | Risk Officer, Analyst (view only), Admin |
| **Preconditions** | User is authenticated. Portfolio data is available. |
| **Trigger** | User navigates to `/stress` and selects a scenario. |

**Main Flow:**
1. User navigates to the Stress Testing module.
2. System loads current portfolio PD scores, outstanding balances, and IFRS stages from `RiskPortfolio`.
3. User selects a scenario: Baseline (1.0×), Adverse (1.5×), or Severe (2.5×).
4. System applies the PD shock multiplier to each facility's PD score, capped at 1.0.
5. System recalculates ECL provisions per facility using stressed PD × LGD (45%) × EAD.
6. System aggregates results: total stressed ECL, delta vs. baseline, projected NPL ratio, capital impact estimate.
7. System renders a comparison table and bar chart across the three scenarios.
8. User may export the results as a PDF or CSV.

**Alternative Flows:**
- **A1 — No portfolio data:** System displays an error state indicating no qualifying facilities are found.
- **A2 — Export fails:** System displays an error toast; raw data remains on screen.

**Postconditions:** Stress test results are displayed. An optional export file is generated. No database writes occur (read-only operation).

---

### UC-07: Export Report

| Field | Detail |
|---|---|
| **Use Case Name** | Export Report |
| **Actor** | Risk Officer, Analyst, Admin |
| **Preconditions** | User is authenticated. Target data exists (analytics, audit log, stress test). |
| **Trigger** | User clicks "Export" on an analytics page, the audit log, or the stress test results. |

**Main Flow:**
1. User clicks the Export button on a supported page.
2. User selects format: PDF or CSV.
3. System serialises the currently displayed dataset into the selected format (client-side rendering for PDF, server-side generation for CSV).
4. System delivers the file as a browser download with a timestamped filename.
5. System writes a `SystemActions` audit entry: `event_type = 'report_export'`, noting the export scope and format.

**Alternative Flows:**
- **A1 — Large dataset:** System displays a loading indicator. If generation exceeds 30 seconds, user is notified that the export will be emailed (future enhancement; currently returns a timeout error).

**Postconditions:** File is downloaded to the user's device. Export action is recorded in the audit log.

---

## 7. Activity Diagrams

### AD-01: Login

```
┌────────────────────────────────────────────────────────────────────────┐
│                         LOGIN ACTIVITY DIAGRAM                         │
├────────────────┬─────────────────────────────┬──────────────────────┤
│   USER         │   AUTH MIDDLEWARE            │   SESSION SERVICE    │
├────────────────┼─────────────────────────────┼──────────────────────┤
│  ●             │                             │                      │
│  ▼             │                             │                      │
│ [Enter         │                             │                      │
│  credentials]  │                             │                      │
│  ├────────────►│                             │                      │
│                │  [Check rate limit]         │                      │
│                │   ◇ Limit exceeded?         │                      │
│                │   │ Yes                     │                      │
│  ◄─────────────│ [Return 429 / lockout]      │                      │
│                │   │ No                      │                      │
│                │   ▼                         │                      │
│                │ [Lookup user record]        │                      │
│                │   ◇ User found?             │                      │
│                │   │ No                      │                      │
│  ◄─────────────│ [Return 401 / increment]    │                      │
│                │   │ Yes                     │                      │
│                │   ▼                         │                      │
│                │ [Verify scrypt hash]        │                      │
│                │   ◇ Password valid?         │                      │
│                │   │ No → [Return 401]       │                      │
│                │   │ Yes ──────────────────► │ [Sign JWT]           │
│                │                             │ [Set cookie]         │
│  ◄─────────────│◄────────────────────────────│ [Return 200]         │
│ [Redirect to   │                             │                      │
│  Dashboard]    │                             │                      │
│  ◉             │                             │                      │
└────────────────┴─────────────────────────────┴──────────────────────┘
```

### AD-02: View Dashboard

```
┌──────────────────────────────────────────────────────────────────────┐
│                    VIEW DASHBOARD ACTIVITY DIAGRAM                   │
├───────────────────┬──────────────────────────┬──────────────────────┤
│  USER             │  NEXT.JS SERVER           │  DATABASE            │
├───────────────────┼──────────────────────────┼──────────────────────┤
│  ●                │                          │                      │
│  ▼                │                          │                      │
│ [Navigate to /]   │                          │                      │
│  ├───────────────►│ [Verify JWT cookie]      │                      │
│                   │  ◇ Valid session?        │                      │
│                   │  │ No → [Redirect /login]│                      │
│                   │  │ Yes                   │                      │
│                   │  ▼                       │                      │
│                   │ [Fetch KPIs + alerts +   │                      │
│                   │  stage distribution] ───►│ [Execute queries]    │
│                   │◄─────────────────────────│ [Return data]        │
│                   │ [Apply traffic light     │                      │
│                   │  thresholds to KPIs]     │                      │
│  ◄────────────────│ [Render dashboard]       │                      │
│ [View KPIs +      │                          │                      │
│  alerts + chart]  │                          │                      │
│  [Every 60s]      │                          │                      │
│  ├───────────────►│ [Poll /api/alerts/count] │                      │
│                   │ ─────────────────────────►[Return count]        │
│                   │  ◇ New alerts?           │                      │
│                   │  │ Yes → [Refresh feed]  │                      │
│                   │  │ No → No-op            │                      │
│  ◉                │                          │                      │
└───────────────────┴──────────────────────────┴──────────────────────┘
```

### AD-03: Manage Client

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   MANAGE CLIENT ACTIVITY DIAGRAM                        │
├────────────────┬──────────────────────────┬───────────────────────────┤
│  RISK OFFICER  │  API LAYER               │  DATABASE / AUDIT SERVICE │
├────────────────┼──────────────────────────┼───────────────────────────┤
│  ●             │                          │                           │
│  ▼             │                          │                           │
│ [Search client]├────────────────────────► │ [Query Customer+Credits]  │
│  ◄─────────────│ [Return results]         │                           │
│ [Select client]├────────────────────────► │ [getClientProfile()]      │
│  ◄─────────────│ [Render 7-tab profile]   │                           │
│ [Select action]│                          │                           │
│  ├────────────►│ [Check role permission]  │                           │
│                │  ◇ Authorised?           │                           │
│                │  │ No → [Return 403]     │                           │
│  ◄─────────────│ [Show denied]            │                           │
│                │  │ Yes                   │                           │
│                │  ▼                       │                           │
│                │ [Execute action]────────►│ [Write to action table]   │
│                │                          │ [recordSystemAction()]    │
│                │                          │ [createNotification()]    │
│  ◄─────────────│ [Return success]         │                           │
│ [UI updated]   │                          │                           │
│  ◉             │                          │                           │
└────────────────┴──────────────────────────┴───────────────────────────┘
```

### AD-04: Generate Early Warning Alert

```
┌──────────────────────────────────────────────────────────────────────────┐
│               GENERATE EWI ALERT ACTIVITY DIAGRAM                       │
├───────────────┬─────────────────────┬──────────────────┬───────────────┤
│  TRIGGER      │  EWI ENGINE         │  ML / AI SERVICE │  DATABASE     │
├───────────────┼─────────────────────┼──────────────────┼───────────────┤
│  ●            │                     │                  │               │
│  ▼            │                     │                  │               │
│ [Manual/Auto] │                     │                  │               │
│  ├───────────►│ [Fetch signals]─────┤─────────────────►│               │
│               │◄────────────────────┤──────────────────┤[Return data]  │
│               │ [Pass to ML pipeline├─────────────────►│               │
│               │  3 sklearn models]  │ [Infer scores]   │               │
│               │◄────────────────────│                  │               │
│               │ [Call Claude API]───├─────────────────►│               │
│               │◄────────────────────│[Generate narrative│              │
│               │  ◇ Deterioration ≥ Medium?             │               │
│               │  │ No → Record prediction only         │               │
│               │  │ Yes                                 │               │
│               │  ▼                                     │               │
│               │ [Generate recommendations]             │               │
│               │ [Write EWIPredictions + Recommendations├──────────────►│
│               │ [createNotification() + recordAction()] ──────────────►│
│  ◄────────────│ [Return result]                        │               │
│  ◉            │                     │                  │               │
└───────────────┴─────────────────────┴──────────────────┴───────────────┘
```

### AD-05: Add to Watchlist

```
┌─────────────────────────────────────────────────────────┐
│            ADD TO WATCHLIST ACTIVITY DIAGRAM            │
├──────────────────┬──────────────────┬───────────────────┤
│  RISK OFFICER    │  API LAYER       │  DATABASE         │
├──────────────────┼──────────────────┼───────────────────┤
│  ●               │                  │                   │
│  ▼               │                  │                   │
│ [Click Add OR    │                  │                   │
│  Auto-triggered] │                  │                   │
│  ├──────────────►│ [Check if exists]├─────────────────► │
│                  │◄─────────────────│                   │
│                  │  ◇ Already exists?                   │
│                  │  │ Yes → [Return 409]                │
│  ◄───────────────│ [Show message]   │                   │
│                  │  │ No            │                   │
│                  │  ▼               │                   │
│                  │ [Calculate exposure %] ────────────► │
│                  │◄─────────────────│                   │
│                  │  ◇ Exposure > 10%?                   │
│                  │  │ Yes: reason = "Concentration"     │
│                  │  │ No:  reason = "Manual"            │
│                  │  ▼               │                   │
│                  │ [Insert + notify + audit] ─────────► │
│  ◄───────────────│ [Return success] │                   │
│ [Nav count updated]                 │                   │
│  ◉               │                  │                   │
└──────────────────┴──────────────────┴───────────────────┘
```

### AD-06: Run Stress Test

```
┌───────────────────────────────────────────────────────────┐
│             RUN STRESS TEST ACTIVITY DIAGRAM              │
├─────────────────┬─────────────────────┬───────────────────┤
│  USER           │  STRESS ENGINE      │  DATABASE         │
├─────────────────┼─────────────────────┼───────────────────┤
│  ●              │                     │                   │
│  ▼              │                     │                   │
│ [Navigate to    │                     │                   │
│  /stress]       │                     │                   │
│  ├─────────────►│ [Load portfolio]────├──────────────────►│
│                 │◄────────────────────│[Return PD+balance]│
│  ◄──────────────│ [Render selector]   │                   │
│ [Select scenario│                     │                   │
│  e.g. Adverse]  │                     │                   │
│  ├─────────────►│ [Apply shock (1.5×)]│                   │
│                 │  ◇ Stressed PD > 1.0?                   │
│                 │  │ Yes → Cap at 1.0 │                   │
│                 │  │ No → Use as-is   │                   │
│                 │  ▼                  │                   │
│                 │ [Compute ECL per facility: PD×LGD×EAD]  │
│                 │ [Aggregate + calc delta vs baseline]    │
│  ◄──────────────│ [Render table + charts]                 │
│  ◇ Export?      │                     │                   │
│  │ Yes ────────►│ [Serialise PDF/CSV] │                   │
│  ◄──────────────│ [Trigger download]  │                   │
│  │ No → End     │                     │                   │
│  ◉              │                     │                   │
└─────────────────┴─────────────────────┴───────────────────┘
```

### AD-07: Export Report

```
┌───────────────────────────────────────────────────────────┐
│              EXPORT REPORT ACTIVITY DIAGRAM               │
├─────────────────┬─────────────────────┬───────────────────┤
│  USER           │  EXPORT SERVICE     │  AUDIT SERVICE    │
├─────────────────┼─────────────────────┼───────────────────┤
│  ●              │                     │                   │
│  ▼              │                     │                   │
│ [Click Export]  │                     │                   │
│  ├─────────────►│ [Present format     │                   │
│  ◄──────────────│  selector]          │                   │
│ [Select PDF/CSV]│                     │                   │
│  ├─────────────►│ [Serialise dataset] │                   │
│                 │  ◇ Format = PDF?    │                   │
│                 │  │ Yes → [Client-side PDF render]       │
│                 │  │ No  → [Server: stream CSV]           │
│                 │  ◇ Success?         │                   │
│                 │  │ No → [Error toast]│                  │
│  ◄──────────────│  │ Yes             ├─────────────────► │
│ [File download] │                     │[recordSystemAction│
│  ◉              │                     │ 'report_export']  │
└─────────────────┴─────────────────────┴───────────────────┘
```

---

## 8. Class Diagram

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                     SPECTRA — UML CLASS DIAGRAM                                ║
╚══════════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────┐
│           <<entity>>        │
│            User             │
├─────────────────────────────┤
│ - userId: string            │
│ - username: string          │
│ - name: string              │
│ - role: UserRole            │
│ - department: string        │
│ - initials: string          │
│ - passwordHash: string      │
├─────────────────────────────┤
│ + authenticate(): boolean   │
│ + hasPermission(            │
│    action: string): boolean │
│ + generateSession(): JWT    │
└──────────────┬──────────────┘
               │ 1 performs *
               ▼
┌─────────────────────────────┐         ┌──────────────────────────────┐
│           <<entity>>        │         │          <<entity>>           │
│          SystemAction       │         │           Client              │
│         (Audit Log)         │         │         (Customer)            │
├─────────────────────────────┤         ├──────────────────────────────┤
│ - id: int                   │  1      │ - personalId: string          │
│ - clientId: string          │◄────────│ - fullName: string            │
│ - creditId: string          │         │ - dateOfBirth: Date           │
│ - eventType: EventType      │         │ - occupation: string          │
│ - oldStage: int             │         │ - segment: string             │
│ - newStage: int             │         │ - assignedRM: string          │
│ - oldRiskScore: decimal     │         ├──────────────────────────────┤
│ - newRiskScore: decimal     │         │ + getFullProfile(): Profile  │
│ - triggerReason: string     │         │ + getCurrentStage(): int     │
│ - performedBy: string       │         │ + getRiskScore(): decimal    │
│ - createdAt: DateTime       │         └────────────┬─────────────────┘
├─────────────────────────────┤                      │ 1 has 1..*
│ + record(): void            │                      ▼
└─────────────────────────────┘         ┌──────────────────────────────┐
                                         │          <<entity>>           │
┌─────────────────────────────┐         │        CreditFacility         │
│           <<entity>>        │         │          (Credits)            │
│         Notification        │  *      ├──────────────────────────────┤
│        (RM Inbox)           │◄────────│ - creditAccount: string       │
├─────────────────────────────┤  1      │ - productType: string         │
│ - id: int                   │         │ - originalAmount: decimal     │
│ - clientId: string          │         │ - outstandingBalance: decimal │
│ - notificationType: string  │         │ - interestRate: decimal       │
│ - priority: Priority        │         │ - maturityDate: Date          │
│ - title: string             │         │ - status: string              │
│ - message: string           │         │ - dpd: int                    │
│ - assignedRM: string        │         │ - pd: decimal                 │
│ - createdAt: DateTime       │         ├──────────────────────────────┤
│ - readAt: DateTime          │         │ + computeECL(): decimal      │
├─────────────────────────────┤         │ + deriveStage(): int         │
│ + markRead(): void          │         │ + isNPL(): boolean           │
│ + isUnread(): boolean       │         └────────────┬─────────────────┘
└─────────────────────────────┘                      │ 1 has 0..*
                                                      ▼
┌─────────────────────────────┐         ┌──────────────────────────────┐
│           <<entity>>        │         │          <<entity>>           │
│          RiskScore          │  1      │         ECLProvision          │
│       (ClientProfile)       │◄────────├──────────────────────────────┤
├─────────────────────────────┤  1      │ - id: int                    │
│ - clientId: string          │         │ - clientId: string            │
│ - stage: int (1|2|3)        │         │ - creditId: string           │
│ - riskScore: decimal (0-100)│         │ - stage: int                  │
│ - deteriorationRisk: string │         │ - eclType: ECLType            │
│ - pdScore: decimal          │         │ - outstandingBalance: decimal │
│ - dpd: int                  │         │ - provisionRate: decimal      │
│ - totalExposure: decimal    │         │ - provisionAmount: decimal    │
│ - missedPayments: int       │         │ - calculatedAt: DateTime      │
│ - sicrFlag: boolean         │         ├──────────────────────────────┤
├─────────────────────────────┤         │ + compute(balance,           │
│ + computeScore(): decimal   │         │    rate): decimal            │
│ + evaluateSICR(): boolean   │         └──────────────────────────────┘
│ + deriveActions(): Action[] │
└─────────────────────────────┘

┌─────────────────────────────┐         ┌──────────────────────────────┐
│           <<entity>>        │  1      │          <<entity>>           │
│        EWIPrediction        │◄────────│       EWIRecommendation       │
├─────────────────────────────┤  0..*   ├──────────────────────────────┤
│ - id: int                   │         │ - id: int                    │
│ - clientId: string          │         │ - clientId: string           │
│ - riskScore: decimal        │         │ - priority: Priority         │
│ - deteriorationRisk: string │         │ - recommendationType: string │
│ - keySignals: string[]      │         │ - description: string        │
│ - aiReasoning: string       │         │ - isActioned: boolean        │
│ - runDate: DateTime         │         │ - actionedBy: string         │
├─────────────────────────────┤         │ - actionedAt: DateTime       │
│ + getLatest(): EWIPrediction│         ├──────────────────────────────┤
└─────────────────────────────┘         │ + markActioned(userId): void │
                                         └──────────────────────────────┘

┌─────────────────────────────┐         ┌──────────────────────────────┐
│           <<entity>>        │         │          <<entity>>           │
│         WatchlistEntry      │         │      RestructuringPlan        │
├─────────────────────────────┤         ├──────────────────────────────┤
│ - id: int                   │         │ - id: int                    │
│ - clientId: string          │         │ - clientId: string           │
│ - exposurePct: decimal      │         │ - type: PlanType             │
│ - triggerReason: string     │         │ - newMaturityDate: Date      │
│ - addedBy: string           │         │ - holidayDuration: int       │
│ - addedAt: DateTime         │         │ - newInterestRate: decimal   │
│ - notes: string             │         │ - forgivenAmount: decimal    │
├─────────────────────────────┤         │ - status: PlanStatus         │
│ + isAutoTriggered(): boolean│         │ - approvedBy: string         │
│ + remove(): void            │         ├──────────────────────────────┤
└─────────────────────────────┘         │ + approve(userId): void     │
                                         │ + reject(userId): void      │
                                         │ + activate(): void          │
                                         └──────────────────────────────┘

┌─────────────────────────────┐         ┌──────────────────────────────┐
│           <<entity>>        │         │          <<entity>>           │
│          RecoveryCase       │         │     CreditCommitteeLog        │
├─────────────────────────────┤         ├──────────────────────────────┤
│ - id: int                   │         │ - id: int                    │
│ - clientId: string          │         │ - clientId: string           │
│ - stage: RecoveryStage      │         │ - escalatedBy: string        │
│ - assignedTo: string        │         │ - escalatedAt: DateTime      │
│ - status: CaseStatus        │         │ - decision: DecisionType     │
│ - notes: string             │         │ - decisionDate: Date         │
│ - openedAt: DateTime        │         │ - decidedBy: string          │
├─────────────────────────────┤         ├──────────────────────────────┤
│ + advanceStage(): void      │         │ + record(): void             │
│ + close(): void             │         │ + updateDecision(): void     │
│ + assignTo(user): void      │         └──────────────────────────────┘
└─────────────────────────────┘

┌─────────────────────────────┐         ┌──────────────────────────────┐
│           <<entity>>        │         │       <<value object>>        │
│          Portfolio          │         │         StressScenario        │
│         (computed)          │         ├──────────────────────────────┤
├─────────────────────────────┤         │ - name: string               │
│ - totalClients: int         │         │ - pdMultiplier: decimal      │
│ - totalExposure: decimal    │         │ - lgdAssumption: decimal     │
│ - stage1Count: int          │         │ - stressedECL: decimal       │
│ - stage2Count: int          │         │ - baselineECL: decimal       │
│ - stage3Count: int          │         │ - delta: decimal             │
│ - nplRatio: decimal         │         ├──────────────────────────────┤
│ - stage2Rate: decimal       │         │ + apply(portfolio):          │
│ - delinquencyRate: decimal  │         │    StressResult              │
│ - hhi: decimal              │         └──────────────────────────────┘
├─────────────────────────────┤
│ + getKPIs(): PortfolioKPIs  │
│ + getConcentration(): Data  │
│ + getHHI(): decimal         │
└─────────────────────────────┘

─────────────────────────── ENUMERATIONS ────────────────────────────

<<enumeration>> UserRole          <<enumeration>> Priority
  admin                             Critical
  risk_officer                      High
  analyst                           Medium
                                    Low
<<enumeration>> IFRSStage
  Stage1 (1)                      <<enumeration>> ECLType
  Stage2 (2)                        TwelveMonth
  Stage3 (3)                        Lifetime

<<enumeration>> RecoveryStage     <<enumeration>> PlanType
  DebtCollection                    LoanExtension
  CollateralEnforcement             PaymentHoliday
  LegalProceedings                  RateReduction
  DebtSale                          DebtConsolidation
  WriteOff                          PartialWriteOff

<<enumeration>> DecisionType      <<enumeration>> PlanStatus
  Restructure                       Proposed
  LegalAction                       Approved
  WriteOff                          Rejected
  Pending                           Active
                                    Completed
```

---

## 9. Rough High-Level Design

### 9.1 Architecture Overview

SPECTRA is a **Next.js full-stack web application** deployed on **Vercel**, backed by an **Azure SQL** (MSSQL) relational database. It follows a **server-side rendering + API routes** architecture, where all sensitive business logic, database access, and ML inference runs on the server and no raw database credentials or business rules are exposed to the client.

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                    SPECTRA — SYSTEM ARCHITECTURE                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

 ┌───────────────────────────────────────────────────────────────────────────┐
 │                           CLIENT LAYER                                    │
 │   ┌──────────────────────┐         ┌──────────────────────────────────┐  │
 │   │   Internal Web App   │         │       Client Portal              │  │
 │   │   (Risk Officers,    │         │   (End Clients) /portal/[id]     │  │
 │   │    Analysts, Admin)  │         │   Browser                        │  │
 │   └──────────┬───────────┘         └───────────────┬──────────────────┘  │
 └──────────────│─────────────────────────────────────│─────────────────────┘
                │ HTTPS                                │ HTTPS
                ▼                                      ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                      VERCEL EDGE / CDN LAYER                              │
 │   Static assets served from Vercel CDN                                   │
 │   Edge middleware: cookie validation, redirect to /login if unauth.      │
 └───────────────────────────────────┬───────────────────────────────────────┘
                                     ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                    NEXT.JS APPLICATION SERVER (Vercel)                    │
 │                                                                           │
 │  ┌─────────────────────────────────────────────────────────────────────┐ │
 │  │  FRONTEND (React / Next.js 14)                                      │ │
 │  │  Dashboard · Portfolio · Clients · Warnings · Analytics             │ │
 │  │  Watchlist · Concentration · Stress Test · Audit · Portal           │ │
 │  └──────────────────────────────┬──────────────────────────────────────┘ │
 │                                 ▼                                         │
 │  ┌──────────────────────────────────────────────────────────────────────┐ │
 │  │  API ROUTE LAYER (Next.js App Router)                                │ │
 │  │  /api/auth/* · /api/alerts/* · /api/notifications/*                 │ │
 │  │  /api/clients/[id]/* · /api/ewi/* · /api/monitoring/*               │ │
 │  │  /api/analytics/* · /api/portal/auth/* · /api/portal/[id]/*         │ │
 │  └──────────────────────────────┬──────────────────────────────────────┘ │
 │                                 ▼                                         │
 │  ┌──────────────────────────────────────────────────────────────────────┐ │
 │  │  SERVICE LAYER (lib/)                                                │ │
 │  │  classificationEngine · actionEngine · eclProvisionService          │ │
 │  │  monitoringService · notificationService · committeeService         │ │
 │  │  recoveryService · restructuringService · engagementService         │ │
 │  │  ewiPredictionsService · ewiRecommendationsService · messagingService│ │
 │  └──────────────────────────────┬──────────────────────────────────────┘ │
 │                                 ▼                                         │
 │  ┌──────────────────────────────────────────────────────────────────────┐ │
 │  │  DATA ACCESS LAYER (lib/)                                            │ │
 │  │  db.server.ts — MSSQL Connection Pool (node-mssql)                  │ │
 │  │  queries.ts   — 50+ parameterised read queries (WITH NOLOCK)        │ │
 │  └──────────────────────────────┬──────────────────────────────────────┘ │
 └─────────────────────────────────│────────────────────────────────────────┘
                                   │ TDS Protocol (port 1433)
                                   ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │                       AZURE SQL DATABASE                                │
 │                                                                         │
 │  Core Banking (read-only):                                             │
 │  Customer · Credits · RiskPortfolio · DueDaysDaily                     │
 │  AmortizationPlan · SalaryInfo                                         │
 │                                                                         │
 │  SPECTRA-managed (read/write):                                         │
 │  SystemActions · Notifications · ClientMonitoring · ECLProvisions      │
 │  RecoveryCases · RestructuringPlans · EWIPredictions                   │
 │  EWIRecommendations · CollateralReview · DocumentRequests              │
 │  AlertAcknowledgements · CreditCommitteeLog · WrittenOffClients        │
 └─────────────────────────────────────────────────────────────────────────┘

             ┌──────────────────────────────────┐
             │      EXTERNAL INTEGRATIONS        │
             ├──────────────────────────────────┤
             │  Anthropic Claude API            │
             │  - Risk narrative generation     │
             │  - Model: claude-sonnet-4-6      │
             │                                  │
             │  Python ML Pipeline (sklearn)    │
             │  - model_90d.pkl                 │
             │  - model_dpd_escalation.pkl      │
             │  - model_stage_migration.pkl     │
             └──────────────────────────────────┘
```

### 9.2 Authentication Architecture

```
  Browser                Vercel Edge           Auth Service
     │                       │                     │
     │  POST /api/auth/login  │                     │
     ├──────────────────────►│                     │
     │                       │  Validate rate limit │
     │                       │  Verify scrypt hash  │
     │                       ├────────────────────►│
     │                       │                     │ Sign JWT (HS256)
     │                       │◄────────────────────│ {userId, role, 8h TTL}
     │  Set-Cookie:          │                     │
     │  spectra_session=JWT  │                     │
     │  (HttpOnly, Secure,   │                     │
     │   SameSite=Strict)    │                     │
     │◄──────────────────────│                     │
     │                       │                     │
     │  Subsequent requests  │                     │
     │  Cookie: spectra_session=JWT                │
     ├──────────────────────►│                     │
     │                       │  Edge middleware:    │
     │                       │  verify JWT →        │
     │                       │  inject user context │
     │◄──────────────────────│                     │
```

### 9.3 Database Schema Overview

**Core Banking Tables (read-only, sourced from CBS):**

| Table | Purpose | Key Columns |
|---|---|---|
| `Customer` | Client master data | PersonalID, FullName, DOB, Occupation |
| `Credits` | Loan facility details | CreditAccount, Amount, Interes, STATUS, StartDate |
| `RiskPortfolio` | Live risk signals | PersonalID, Stage, BankCurrentRating, DPD, PD |
| `DueDaysDaily` | DPD daily history | CreditAccount, DueDays, AsOf |
| `AmortizationPlan` | Payment schedule | CreditAccount, DueDate, Amount, Paid |
| `SalaryInfo` | Income data | PersonalID, NetSalary, Employer, LastCreditDate |

**SPECTRA-Managed Tables (full read/write):**

| Table | Purpose |
|---|---|
| `SystemActions` | Immutable audit log |
| `Notifications` | RM notification inbox |
| `ClientMonitoring` | Review cadence and freeze state |
| `ECLProvisions` | IFRS 9 provision snapshots |
| `RecoveryCases` | Formal recovery case lifecycle |
| `RestructuringPlans` | Loan modification plans |
| `EWIPredictions` | ML risk prediction history |
| `EWIRecommendations` | Actionable alert recommendations |
| `CollateralReview` | Collateral revaluation log |
| `DocumentRequests` | RM document request tracking |
| `AlertAcknowledgements` | Alert disposition log |
| `CreditCommitteeLog` | Committee escalation decisions |
| `WrittenOffClients` | KPI exclusion list |

### 9.4 Deployment Infrastructure

```
 ┌──────────────────────────────────────────────────────────┐
 │                 DEPLOYMENT TOPOLOGY                      │
 │                                                          │
 │  GitHub Repository (spectra_system)                      │
 │         │ git push → Vercel CI/CD                        │
 │         ▼                                                │
 │  Vercel Platform                                         │
 │  ┌──────────────────────────────────────────────────┐   │
 │  │  Next.js Build (frontend/)                       │   │
 │  │  - Static pages → Vercel CDN (global edge)       │   │
 │  │  - API Routes  → Vercel Serverless Functions     │   │
 │  │                  (Node.js 18 runtime)            │   │
 │  │  - Env vars: DB_SERVER, DB_USER, DB_PASS,        │   │
 │  │    JWT_SECRET, ANTHROPIC_API_KEY, etc.           │   │
 │  └──────────────────────────────────────────────────┘   │
 │         │ TDS / SQL over TLS (port 1433)                 │
 │         ▼                                                │
 │  Azure SQL Database                                      │
 │  ┌──────────────────────────────────────────────────┐   │
 │  │  - Azure SQL (MSSQL-compatible)                  │   │
 │  │  - Connection pool via node-mssql                │   │
 │  │  - Firewall: whitelist Vercel egress IPs         │   │
 │  │  - Backups: Azure automated backup (7-day RTR)   │   │
 │  └──────────────────────────────────────────────────┘   │
 └──────────────────────────────────────────────────────────┘
```

### 9.5 Key Design Decisions & Trade-Offs

| Decision | Choice | Rationale |
|---|---|---|
| **ORM vs raw SQL** | Raw SQL (node-mssql) | Full control over query plans; `WITH (NOLOCK)` hints; no ORM overhead for complex analytical queries |
| **Auth mechanism** | JWT + HttpOnly cookie | Stateless (scales horizontally on Vercel serverless); HttpOnly prevents XSS token theft |
| **Table creation** | DDL-on-first-use | Eliminates separate migration tooling for a SaaS deployment; idempotent guards prevent duplication |
| **Credential storage** | In-memory (users.ts) | Appropriate for a controlled bank deployment; avoids database dependency for auth |
| **Config management** | Central config.ts + env vars | Business thresholds are auditable in code; overridable per bank without code changes |
| **ML integration** | External Python pipeline | Separates model training/deployment from the web app; sklearn models are loaded at inference time |
| **AI narrative** | Claude API (claude-sonnet-4-6) | Structured JSON prompts for consistent risk summaries; model upgrade path without code change |
| **Real-time alerts** | Polling (60s) | Simpler than WebSockets on a serverless platform; acceptable latency for credit risk operations |
| **SSE** | Server-Sent Events for portal | One-directional push for client notifications; lightweight alternative to WebSocket |

---

*SPECTRA Credit Risk Intelligence Platform — Software Requirements & Design Document v1.0*
*Generated: March 2026 | Internal Confidential*
