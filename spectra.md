# CLAUDE.md — Portfolio Monitoring & Risk Trend Discovery

## Role & Autonomy

You are a senior data engineer and credit risk analyst working autonomously on this project.
When given a task:

- **Just do it.** Do not ask for permission before writing code, queries, or generating data.
- Complete tasks end-to-end: SQL + Python logic + comments + tests where applicable.
- If something is ambiguous, make a sound financial/technical judgment, implement it, and briefly explain your reasoning after.
- Only pause if a decision is **irreversible and high-risk** (e.g., dropping tables, deleting output files).

> **✅ Section Check:** Will you complete tasks end-to-end without asking for permission? Will you only pause for irreversible, high-risk actions? If yes, proceed.

---

## Project Overview

**Goal:** Build a credit portfolio monitoring system that:
1. Tracks portfolio health KPIs over time using SQL
2. Detects emerging risks (rising delays, deteriorating repayment behavior) using Python
3. Supports a Power BI dashboard for credit risk and recovery teams
4. Powers a **Client Risk Profile Dashboard** for Risk Underwriters to speed up time-to-opinion and time-to-yes

This simulates what a real **Credit Risk Department** uses to flag portfolio deterioration early and intervene before defaults rise.

> **✅ Section Check:** Can you name the 4 goals of this system? Do you know the two dashboards being built and who uses each? If yes, proceed.

---

## MCP Server (Model Context Protocol)

This project uses MCP servers to give Claude Code direct access to external tools and data sources without manual copy-pasting. Always prefer MCP tools over manual workflows when available.

### Setup
MCP servers are configured in `.claude/settings.json` at the project root:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DB_CONNECTION_STRING}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data", "./sql", "./scripts"]
    }
  }
}
```

- **Never hardcode credentials** in `settings.json` — always reference environment variables via `${VAR_NAME}`.
- Add `.claude/settings.json` to `.gitignore` if it contains any environment-specific values.

### Recommended MCP Servers for This Project

| MCP Server | Purpose |
|---|---|
| `@modelcontextprotocol/server-postgres` | Query the SSMS/PostgreSQL database directly from Claude Code |
| `@modelcontextprotocol/server-filesystem` | Read and write files in `/data`, `/sql`, `/scripts` |
| `@modelcontextprotocol/server-github` | Version control — commit, branch, and push without leaving Claude Code |

### Usage Rules
- Use the **database MCP server** to run SQL queries and inspect schema directly — no need to export to CSV just to preview data.
- Use the **filesystem MCP server** to read existing scripts before editing them — never rewrite a file from scratch without first reading its current contents.
- If an MCP tool call fails, log the error and fall back to a manual approach — do not silently skip the step.
- MCP tool calls count toward token usage — keep queries targeted, not exploratory `SELECT *` calls.

> **✅ Section Check:** Are credentials stored in env variables, not hardcoded? Will you use the MCP database server before falling back to manual queries? If yes, proceed.

---

## Stack

| Layer        | Tool                          |
|--------------|-------------------------------|
| Data storage | SQL (PostgreSQL or compatible)|
| Analysis     | Python 3.10+                  |
| Visualization| Power BI                      |
| Notebooks    | Jupyter (`.ipynb`)            |

> **✅ Section Check:** SQL for data, Python for analysis, Power BI for dashboards, Jupyter for notebooks — confirmed?

---

## Database Schema

All data comes from a **live SSMS (SQL Server) database**. No hardcoded values, no synthetic data, no mock datasets — ever.

Database: `[Hackathon].[dbo]`
Always use fully qualified table names: `[Hackathon].[dbo].[TableName]`

All credentials (server, database name, username, password) must be stored in a `.env` file and loaded at runtime — never written directly into any script, query file, or config.

### Real Database Schema

```sql
-- Customer master data
[Customer] (
    name, surname, City, Address, DOB, PersonalID, Tel,
    DateOfRegister, Branch, Resident, email, Gender,
    Occupation, Status, CustomerType
)

-- Credit/loan accounts
[Credits] (
    CreditAccount, PersonalID, Currency, FromYear, Amount, ToYear,
    Period, TypeOfCalculatioin, InstallmentsAmount, Interes,
    STATUS, Branch, KAMGRUPA, EmployeeNo, NoCredit, NoAccount
)

-- Bank accounts
[Accounts] (
    NoAccount, Currency, AccountType, PersonalID,
    AccountStatus, OpenDate, Balance, Branch, amountonhold
)

-- Amortization / repayment schedule
[AmortizationPlan] (
    RB, DATUMDOSPECA, IZNOS, OTPLATA, KAMATA, KAMATASAPOREZOM,
    POREZ, ANUITET, KOEFICIJENT, PARTIJA, ZADOLZENO, TIPSTAVKA,
    DATUMOD, TRANSFERRED, NAKNADA, NAKNADAPOREZ, CALCKAM, CALCDAN,
    VERSION, RANK, LOG_ACCOUNT, NAKNADA_EKS, UnamortizedFee,
    SubvencijaAmount, naknadadin, PorezNaKamatu,
    odlozenoPotrazivanje, odlozenoPotrDosp, InsuranceAmount
)

-- Due days tracking (delinquency)
[DueDaysDaily] (
    dateID, CreditAccount, NoCredit, PersonalID,
    DueMax2Y, DueTotal, DueDays, DueMax6M, DueMax3M, DueMax1Y
)

-- Risk classification & portfolio exposure
[RiskPortfolio] (
    Tipi, CalculationDate, clientID, TypeOfClient, arrangementID,
    contractNumber, TypeOfProduct, ProductDesc, groupID,
    ApprovalRating, BankPreviousMonthRating, lastClassificationChangeDate,
    BankCurrentRating, ArrangementEffectiveDate, RealMaturityDate,
    ArrangementActualEndDate, totalClientExposure, totalExposure,
    TotalOffBalance, onBalanceExposure, TotalPrincipal, unduePrincipal,
    duePrincipal, cc_Debt, TotalInterest, Interest, penaltyInterest,
    AccruedInterest, TotalFees, TotalFeePanjohur, Restructuring,
    [Effective Interest Rate], Stage, stageDescr, CalculatedProvision,
    Shuma_Approvuar, aktivitetiSipasCBK
)

-- Credit transaction log
[TCredits] (
    Kod, Time, Date, EmployeeNo, TrnNo, CreditAccount,
    Currency, Amount, provision, KONTO, Kind, TIP, Branch, opis_clean
)

-- Account transaction log
[TAccounts] (
    Kod, Time, Date, EmployeeNo, TrnNo, NoAccount,
    Currency, Amount, Provision, Konto, Kind,
    AccountType, Branch, TDescription1
)

-- Card information
[Cards] (
    NoCards, brand, type, kind, PersonalID,
    production_date, delivery_date, card_status
)

-- Card type reference
[CardType] (brand, type)

-- Credit card event log (transactions)
[CC_Event_LOG] (
    eventno, EventID, Account, trans_date, Currency,
    Ammount, src_amount, src_currency, description, TERMINAL_ID
)
```

### Key Relationships
- `Customer.PersonalID` → `Credits.PersonalID` → `Accounts.PersonalID` → `Cards.PersonalID` → `DueDaysDaily.PersonalID`
- `Credits.CreditAccount` → `AmortizationPlan.PARTIJA` (repayment schedule per credit)
- `Credits.CreditAccount` → `DueDaysDaily.CreditAccount` (delinquency tracking)
- `RiskPortfolio.clientID` → `Customer.PersonalID` (risk profile per customer)
- `Accounts.NoAccount` → `TAccounts.NoAccount` (account transactions)
- `Credits.CreditAccount` → `TCredits.CreditAccount` (credit transactions)
- `Cards.NoCards` → `CC_Event_LOG.Account` (card transactions)

### Field Mapping to KPIs
| KPI | Source Table | Key Fields |
|---|---|---|
| Days Past Due (DPD) | `DueDaysDaily` | `DueDays`, `DueMax6M`, `DueMax1Y`, `DueMax2Y` |
| Delinquency | `DueDaysDaily` | `DueDays >= 30` |
| Exposure | `RiskPortfolio` | `totalExposure`, `onBalanceExposure`, `TotalOffBalance` |
| Risk Rating | `RiskPortfolio` | `BankCurrentRating`, `BankPreviousMonthRating`, `Stage` |
| Repayment behavior | `AmortizationPlan` | `OTPLATA`, `KAMATA`, `DATUMDOSPECA`, `ZADOLZENO` |
| Credit card usage | `CC_Event_LOG` | `Ammount`, `trans_date` |
| Overdraft usage | `Accounts` | `Balance`, `amountonhold`, `AccountType` |
| Salary inflow | `TAccounts` | `Amount`, `TDescription1`, `Kind` |
| Customer profile | `Customer` | `DOB`, `Occupation`, `Status`, `CustomerType`, `Branch` |

> **✅ Section Check:** Will you run `SELECT TOP 5` before writing any query? Are credentials in `.env` only? No hardcoded values anywhere? If yes, proceed.

---

## KPIs & Metrics to Implement

### Portfolio-Level KPIs (SQL)

| Metric | Definition |
|---|---|
| Average delay days | `AVG(delay_days)` per loan and per customer |
| Late payment ratio | `COUNT(delay_days > 0) / COUNT(*)` |
| Delinquency rate | `% customers with delay_days >= 30` in any repayment |
| Risk score change | Compare current `risk_rating` vs. earliest recorded `risk_rating` |
| Loan exposure by segment | `SUM(amount)` grouped by `loan_type`, `region`, `risk_rating` |

### Client Risk Profile KPIs (per-customer view)

**A. Client Snapshot**
- Client ID, Age band, Employment status, Sector/employer type
- Residency (urban/rural, region), Relationship tenure with bank, Risk Score

**B. Exposure Overview**
- Total exposure (on-balance + off-balance)
- Breakdown by product: consumer loan, mortgage, overdraft, credit card
- Secured vs. unsecured split
- Exposure vs. approved limits

**C. Credit Performance & Repayment Behavior**
- Days Past Due (DPD) — current and historical
- Max DPD in last 12 and 24 months
- Number of past delinquencies, missed payments count
- Cure rate (did they recover after going delinquent?)
- Debt-to-Income (DTI), Current LTV (and historical)
- Exposure growth rate over time

**D. Early Warning Indicators (EWI)**
- Salary inflow stopped or reduced
- Increased overdraft usage
- Credit card utilization spike
- Consecutive late payments (3+ in a row)
- Sudden exposure increase (e.g., >20% jump in 30 days)

> **✅ Section Check:** Can you list the 5 portfolio KPIs and the 4 EWI signals? Do you know the difference between the Portfolio dashboard and the Client Risk Profile dashboard? If yes, proceed.

---

## SQL Standards

- Use **CTEs** (`WITH` clauses) for multi-step logic — no nested subquery spaghetti.
- All queries must include a `-- Description:` comment block at the top explaining what they compute.
- Use explicit `CAST` for type conversions; never rely on implicit casting.
- Window functions (`LAG`, `LEAD`, `ROW_NUMBER`, `AVG OVER`) are preferred for trend calculations.
- Always filter on date ranges using parameterized or clearly commented placeholders.
- Name all columns meaningfully in `SELECT` — no unnamed expressions.

Example structure:
```sql
-- Description: Calculate total due days and delinquency flag per customer
-- Scope: All credits; flags customers with DueDays >= 30
WITH delinquency_stats AS (
    SELECT
        d.PersonalID,
        d.CreditAccount,
        MAX(d.DueDays)                                           AS max_due_days,
        MAX(d.DueMax6M)                                          AS max_due_6m,
        MAX(d.DueMax1Y)                                          AS max_due_1y,
        CASE WHEN MAX(d.DueDays) >= 30 THEN 1 ELSE 0 END        AS is_delinquent
    FROM [Hackathon].[dbo].[DueDaysDaily] d WITH (NOLOCK)
    GROUP BY d.PersonalID, d.CreditAccount
)
SELECT * FROM delinquency_stats
ORDER BY max_due_days DESC;
```

> **✅ Section Check:** Will every query start with a `-- Description:` comment? Are you using CTEs instead of nested subqueries? No `SELECT *` in production? If yes, proceed.

---

## Python Standards

### Style
- Follow **PEP 8**. Use `black` for formatting, `ruff` for linting.
- Use type hints on all function signatures.
- Use `pandas` for data manipulation, `numpy` for numerical operations.
- Use `scipy.stats` or `sklearn` for statistical flagging (z-scores, anomaly detection).
- Use `matplotlib` / `seaborn` / `plotly` for exploratory charts in notebooks.

### Risk Flagging Logic
Always implement the following flagging pipeline:

```python
# 1. Rising delay trend  — linear regression slope on delay_days over time
# 2. Z-score anomaly     — flag loans where delay_days z-score > 2.0
# 3. Consecutive lates   — flag if 3+ consecutive repayments have delay_days > 0
# 4. Score deterioration — flag if current risk_rating degraded beyond threshold vs. initial
# 5. Exposure spike      — flag if loan amount increased >20% within a rolling 30-day window
```

Each flagging function must:
- Accept a DataFrame and return a DataFrame with a boolean `flag_*` column added
- Include a docstring explaining the flag logic and threshold used
- Be independently testable

### Error Handling
- Never use bare `except:` — always catch specific exceptions.
- Log all data quality issues (nulls, unexpected values, schema mismatches) using `logging`, not `print()`.
- Validate input DataFrames at the start of each function (check required columns exist, dtypes are correct).

### Notebook Structure
Jupyter notebooks must follow this section order:
1. **Setup & Imports**
2. **Data Loading & Validation**
3. **Exploratory Analysis**
4. **KPI Computation**
5. **Risk Flagging**
6. **Output / Export**

Each section must be introduced with a Markdown cell explaining its purpose.

> **✅ Section Check:** Will every flagging function return a DataFrame with a `flag_*` column? Are you using `logging` not `print()`? Is the notebook following the 6-section structure? If yes, proceed.

---

## Data Source — Existing SSMS Database

This project connects to a **live SQL Server database via SSMS**. Do NOT generate synthetic data — all analysis runs against real tables.

### Connection
- Database: SQL Server (via SSMS)
- Connect in Python using `pyodbc` or `sqlalchemy` with a connection string stored in a `.env` file — never hardcoded.

```python
import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={os.getenv('DB_SERVER')};"
    f"DATABASE={os.getenv('DB_NAME')};"
    f"UID={os.getenv('DB_USER')};"
    f"PWD={os.getenv('DB_PASSWORD')};"
)
```

### Before Writing Any Query
- Run a quick schema check (`SELECT TOP 5 * FROM <table>`) to confirm actual column names match this CLAUDE.md.
- If column names differ from the schema defined above, **adapt the query to match reality** — do not assume the schema is identical.
- Never run `UPDATE`, `DELETE`, or `DROP` on the live database — **read-only queries only**.

### Exporting for Python / Power BI
- Query results should be exported to `/data/processed/` as `.csv` for downstream use.
- Always include a `NOLOCK` hint on large tables to avoid blocking production queries:
  ```sql
  SELECT * FROM [Hackathon].[dbo].[Credits] WITH (NOLOCK)
  ```

> **✅ Section Check:** Are you connecting via `pyodbc` + `.env`? Read-only queries only — no `UPDATE`, `DELETE`, or `DROP`? Exporting results to `/data/processed/`? If yes, proceed.

---

## Frontend Design Spec (Next.js)

> **⚠️ Design fidelity is non-negotiable.** The full HTML reference at the bottom of this section is the single source of truth for the entire frontend. The final Next.js implementation must be **pixel-perfect** to that HTML — same colors, same fonts, same spacing, same layout, same components, same class names. Do not interpret, simplify, or improve the design. If it is in the HTML, build it exactly. If it is not in the HTML, do not add it.

### Design Language
- **Style:** Dark navy sidebar + clean white content area. Premium, minimal, trustworthy.
- **Fonts:** `Sora` (UI text) + `IBM Plex Mono` (numbers, amounts, dates, codes) — load from Google Fonts.
- **No gradients, no drop shadows, no glow effects.** Flat surfaces only.
- **Border radius:** 10–12px on cards, 7–8px on inner elements, 50% on avatars.

### Color Tokens — define as CSS variables in `globals.css`
```css
:root {
  --navy: #0D1B2A;       /* sidebar, dark cards */
  --navy2: #162333;
  --navy3: #1E2F42;
  --gold: #C9A84C;       /* primary accent */
  --gold2: #E8C97A;      /* active nav text */
  --slate: #8FA3B8;      /* muted text */
  --slate2: #B8CCDC;
  --surface: #FFFFFF;    /* card backgrounds */
  --bg: #F4F7FA;         /* page background */
  --border: #E8EDF2;     /* all borders */
  --text: #0D1B2A;       /* primary text */
  --muted: #8FA3B8;      /* secondary text */
  --green: #2ECC8A;      /* positive / success */
  --red: #E85757;        /* negative / alert */
  --amber: #F0A04B;      /* warning */
  --blue: #378ADD;       /* info */
}
```

### Layout Structure
```
AppShell
├── Sidebar (210px fixed, background: --navy)
│   ├── Logo block
│   ├── Nav groups with icons + active state (gold highlight)
│   └── User avatar + online dot
└── Main (flex: 1, background: --bg)
    ├── Topbar (54px, white, border-bottom)
    └── Content (scrollable, padding: 18px 20px, flex column gap 14px)
```

### Sidebar Nav — active state
```css
.nav-item.active {
  background: rgba(201, 168, 76, 0.10);
  border: 1px solid rgba(201, 168, 76, 0.20);
  color: var(--gold2);
}
```

### Component Patterns

**KPI Card**
```tsx
// White card, 1px border --border, border-radius 10px, padding 14px
// Label: 9px, letter-spacing 1.5px, uppercase, color --muted
// Value: 20px, font-weight 600, font-family IBM Plex Mono
// Badge below: inline pill with bg/text from semantic color
```

**Dark KPI Card (hero metric)**
```tsx
// background: --navy, same structure as above but white text + gold accent
```

**Badge / pill**
```tsx
// font-size 9px, padding 2px 7px, border-radius 10px, font-family mono
// green:  bg #EAF9F2  text #1A9E60
// red:    bg #FEF0F0  text #C43A3A
// amber:  bg #FEF5E7  text #B07010
// blue:   bg #E6F1FB  text #185FA5
// gray:   bg #EEF2F7  text --muted
```

**Data Table**
```tsx
// font-size 11px, th: 9px uppercase muted, 1px border-top on each row
// row hover: background #F8FAFC
// amounts use IBM Plex Mono, green for positive, red for negative
```

**Bar Chart** — build with plain divs (no chart library unless asked)
```tsx
// flexbox, align-items: flex-end, height 70px
// bars: border-radius 3px 3px 0 0, background #EEF2F7 default
// active bar: --navy, previous bar: rgba(201,168,76,0.4)
// label: 8px mono text below each bar
```

**Progress Bar rows**
```tsx
// label (80px) + flex bar track (bg #EEF2F7, h 5px, radius 3px) + value (mono)
```

**Alert card**
```tsx
// border-radius 8px, border 1px
// critical: bg #FEF0F0  border #F7C1C1
// warning:  bg #FEF5E7  border #FAC775
```

**EWI indicator tile**
```tsx
// small card, label 10px muted, value 13px bold
// color: --green (ok) / --amber (warn) / --red (alert)
```

**Toggle switch**
```tsx
// width 36px height 20px, border-radius 10px
// on: background --navy  off: background #D1D9E0
// thumb: 16px white circle, transitions left
```

### Pages to Build (6 total)

| Route | Page | Key components |
|---|---|---|
| `/` | Dashboard | KPI row, bar chart, stage donut, transactions table, quick actions |
| `/portfolio` | Portfolio | Exposure progress bars, region table, loan table |
| `/transactions` | Transactions | TCredits table, TAccounts table, CC_Event_LOG table |
| `/warnings` | Early Warnings | EWI tiles, alert cards, alert trend chart |
| `/clients/[id]` | Client Profile | Profile header, detail grid, DPD chart, risk meter, timeline |
| `/analytics` | Analytics | Delinquency bars, stage migration table, risk score distribution |
| `/settings` | Settings | DB config, alert thresholds, Claude Code settings, Power BI export |

### Client Profile page — special components
- **Risk meter:** horizontal gradient bar (green → amber → red), pin positioned by score (0–10)
- **Activity timeline:** vertical line with colored dots, event title + meta
- **DPD bar chart:** bars colored by severity (gray=0, amber=1–29, red=30+)
- **Profile header:** avatar initials circle + name + badges + risk score (large mono number, colored by stage)

### Quick Action Buttons
Every page has a "Quick actions" panel. Each button calls `sendPrompt()` via the Claude Code API with a pre-written, targeted prompt string. Style: full-width, left-aligned, `↗` suffix, border 1px --border, bg #F8FAFC, hover #EEF2F7.

### Page Skeleton (structure reference per page)

Use this as the structural template for every page component:

```tsx
// AppShell — wraps every page
<div className="wrap">          {/* flex row, full height */}
  <Sidebar activePage="..." />  {/* 210px fixed, navy */}
  <div className="main">        {/* flex:1, white */}
    <Topbar title="..." sub="..." />   {/* 54px, border-bottom */}
    <div className="content">   {/* scrollable, padding 18px 20px, gap 14px */}

      {/* Row of KPI cards */}
      <div className="row3">    {/* or row2 / row4 */}
        <KPICard label="..." value="..." badge="..." />
      </div>

      {/* Two-column panel row */}
      <div className="row2">
        <Panel title="...">
          <BarChart data={...} />
        </Panel>
        <Panel title="...">
          <DataTable columns={...} rows={...} />
        </Panel>
      </div>

    </div>
  </div>
</div>
```

Grid classes:
```css
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.row4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
```

---

### Full HTML Reference

This is the complete, production-ready HTML for all 6 pages. Claude Code must use this as the **exact reference** when converting to Next.js components. Do not change class names, colors, structure, or layout — only convert syntax to JSX/TSX.

```html
<!DOCTYPE html>
<html>
<head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#0D1B2A;--navy2:#162333;--navy3:#1E2F42;
  --gold:#C9A84C;--gold2:#E8C97A;
  --slate:#8FA3B8;--slate2:#B8CCDC;
  --white:#F4F7FA;--surface:#FFFFFF;
  --green:#2ECC8A;--red:#E85757;--amber:#F0A04B;--blue:#378ADD;
  --font:'Sora',sans-serif;--mono:'IBM Plex Mono',monospace;
  --border:#E8EDF2;--text:#0D1B2A;--muted:#8FA3B8;
}
.wrap{display:flex;height:620px;background:var(--navy);font-family:var(--font);border-radius:12px;overflow:hidden}
.page{display:none;flex-direction:column;height:100%}
.page.active{display:flex}
.sidebar{width:210px;background:var(--navy);border-right:1px solid rgba(201,168,76,0.15);display:flex;flex-direction:column;padding:20px 0;flex-shrink:0}
.logo{display:flex;align-items:center;gap:9px;padding:0 18px 22px;border-bottom:1px solid rgba(255,255,255,0.06)}
.logo-mark{width:30px;height:30px;background:var(--gold);border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-name{font-size:13px;font-weight:600;color:var(--white)}
.logo-sub{font-size:9px;color:var(--slate);letter-spacing:1.5px;text-transform:uppercase}
.nav{padding:16px 10px;flex:1}
.nav-group{margin-bottom:16px}
.nav-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--slate);padding:0 8px;margin-bottom:6px}
.nav-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:7px;cursor:pointer;margin-bottom:1px;border:1px solid transparent}
.nav-item:hover{background:rgba(255,255,255,0.04)}
.nav-item.active{background:rgba(201,168,76,0.1);border-color:rgba(201,168,76,0.2)}
.ni{width:15px;height:15px;color:var(--slate);flex-shrink:0}
.nav-item.active .ni{color:var(--gold)}
.nt{font-size:12px;color:var(--slate)}
.nav-item.active .nt{color:var(--gold2);font-weight:500}
.nb{margin-left:auto;background:var(--red);color:#fff;font-size:9px;padding:1px 5px;border-radius:8px;font-family:var(--mono)}
.nav-div{height:1px;background:rgba(255,255,255,0.05);margin:10px 0}
.s-user{padding:14px 18px;border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:9px}
.s-av{width:30px;height:30px;border-radius:50%;background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--gold);flex-shrink:0}
.s-name{font-size:11px;font-weight:500;color:var(--white)}
.s-role{font-size:9px;color:var(--slate)}
.s-dot{width:6px;height:6px;background:var(--green);border-radius:50%;margin-left:auto;flex-shrink:0}
.main{flex:1;background:var(--white);display:flex;flex-direction:column;overflow:hidden;min-width:0}
.topbar{height:54px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0}
.tb-title{font-size:14px;font-weight:600;color:var(--text)}
.tb-sub{font-size:11px;color:var(--muted);margin-left:3px}
.tb-right{margin-left:auto;display:flex;align-items:center;gap:10px}
.tb-btn{width:32px;height:32px;border-radius:7px;background:#F4F7FA;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative}
.nd{position:absolute;top:6px;right:6px;width:5px;height:5px;background:var(--red);border-radius:50%}
.tb-date{font-size:10px;color:var(--muted);font-family:var(--mono)}
.content{flex:1;overflow-y:auto;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.row4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px}
.ph{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pt{font-size:12px;font-weight:600;color:var(--text)}
.pa{font-size:10px;color:var(--muted);cursor:pointer;padding:3px 9px;border:1px solid var(--border);border-radius:5px}
.kcard{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px}
.kl{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:7px}
.kv{font-size:20px;font-weight:600;color:var(--text);font-family:var(--mono)}
.badge{display:inline-flex;align-items:center;font-size:9px;padding:2px 7px;border-radius:10px;font-family:var(--mono);margin-top:6px}
.bg{background:#EAF9F2;color:#1A9E60}.br{background:#FEF0F0;color:#C43A3A}.ba{background:#FEF5E7;color:#B07010}.bb{background:#E6F1FB;color:#185FA5}
.divider{height:1px;background:var(--border);margin:8px 0}
.tbl{width:100%;border-collapse:collapse;font-size:11px}
.tbl th{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);padding:0 10px 8px;text-align:left;font-weight:500}
.tbl td{padding:9px 10px;border-top:1px solid var(--border);color:var(--text);vertical-align:middle}
.tbl tr:hover td{background:#F8FAFC}
.mono{font-family:var(--mono);font-size:11px}
.avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600}
.bars{display:flex;align-items:flex-end;gap:5px;height:70px}
.bw{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px}
.b{width:100%;border-radius:3px 3px 0 0}
.bl{font-size:8px;color:var(--muted);font-family:var(--mono)}
.prog-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.prog-label{font-size:11px;color:var(--muted);width:80px;flex-shrink:0}
.prog-bar{flex:1;height:5px;background:#EEF2F7;border-radius:3px}
.prog-fill{height:100%;border-radius:3px}
.prog-val{font-size:11px;font-family:var(--mono);color:var(--text);width:36px;text-align:right;flex-shrink:0}
.meter{height:10px;border-radius:5px;background:linear-gradient(to right,#2ECC8A,#F0A04B,#E85757);position:relative;margin:8px 0}
.meter-pin{position:absolute;top:-3px;width:16px;height:16px;border-radius:50%;background:var(--surface);border:2px solid var(--navy);transform:translateX(-50%)}
.ewi-card{border-radius:8px;padding:10px 12px;border:1px solid var(--border)}
.ewi-name{font-size:10px;color:var(--muted);margin-bottom:3px}
.ewi-val{font-size:13px;font-weight:600}
.ewi-ok{color:var(--green)}.ewi-warn{color:var(--amber)}.ewi-alert{color:var(--red)}
.timeline{display:flex;flex-direction:column;gap:0}
.tl-item{display:flex;gap:12px;position:relative}
.tl-item:not(:last-child)::after{content:'';position:absolute;left:11px;top:22px;width:1px;height:100%;background:var(--border)}
.tl-dot{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;margin-top:1px}
.tl-content{flex:1;padding-bottom:14px}
.tl-title{font-size:11px;font-weight:500;color:var(--text)}
.tl-meta{font-size:10px;color:var(--muted);margin-top:2px}
.donut-wrap{display:flex;align-items:center;gap:16px}
.legend{display:flex;flex-direction:column;gap:5px;flex:1}
.leg-item{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--text)}
.leg-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.act-btn{width:100%;text-align:left;padding:8px 11px;border-radius:7px;border:1px solid var(--border);background:#F8FAFC;font-size:11px;color:var(--text);cursor:pointer;font-family:var(--font);margin-bottom:6px}
.act-btn:hover{background:#EEF2F7}
.alert-item{display:flex;gap:12px;padding:10px 12px;border-radius:8px;border:1px solid;margin-bottom:8px;align-items:flex-start}
.alert-icon{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px}
.alert-title{font-size:12px;font-weight:500;color:var(--text)}
.alert-meta{font-size:10px;color:var(--muted);margin-top:2px}
.alert-right{margin-left:auto;text-align:right}
.alert-time{font-size:9px;color:var(--muted);font-family:var(--mono)}
.profile-header{display:flex;gap:14px;align-items:flex-start;padding:14px;background:#F8FAFC;border-radius:10px;border:1px solid var(--border);margin-bottom:12px}
.prof-av{width:46px;height:46px;border-radius:50%;background:rgba(13,27,42,0.1);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--navy);flex-shrink:0}
.prof-name{font-size:14px;font-weight:600;color:var(--text)}
.prof-sub{font-size:11px;color:var(--muted);margin-top:2px}
.prof-badges{display:flex;gap:5px;margin-top:6px;flex-wrap:wrap}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.detail-item{background:#F8FAFC;border-radius:7px;padding:9px 11px;border:1px solid var(--border)}
.detail-label{font-size:9px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.detail-value{font-size:12px;font-weight:500;color:var(--text)}
.setting-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)}
.setting-label{font-size:12px;font-weight:500;color:var(--text)}
.setting-sub{font-size:10px;color:var(--muted);margin-top:2px}
.toggle{width:36px;height:20px;border-radius:10px;position:relative;cursor:pointer;flex-shrink:0}
.toggle.on{background:var(--navy)}.toggle.off{background:#D1D9E0}
.toggle::after{content:'';position:absolute;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left 0.15s}
.toggle.on::after{left:18px}.toggle.off::after{left:2px}
</style>
</head>
<body>

<!-- ═══════ DASHBOARD PAGE ═══════ -->
<div id="p-dashboard" class="page active">
  <div class="topbar">
    <div><span class="tb-title">Dashboard</span><span class="tb-sub">— March 2026</span></div>
    <div class="tb-right">
      <span class="tb-date">16 Mar 2026</span>
      <div class="tb-btn"><div class="nd"></div></div>
    </div>
  </div>
  <div class="content">
    <div class="row3">
      <div class="kcard" style="background:var(--navy)">
        <div class="kl" style="color:var(--slate)">Total Exposure</div>
        <div class="kv" style="color:#fff"><span style="color:var(--gold);font-size:13px">€</span>48.4M</div>
        <span class="badge" style="background:rgba(201,168,76,0.15);color:var(--gold2)">▲ +2.4% MoM</span>
      </div>
      <div class="kcard"><div class="kl">Delinquency Rate</div><div class="kv">6.3%</div><span class="badge br">▲ Watch list</span></div>
      <div class="kcard"><div class="kl">Avg Days Past Due</div><div class="kv">18.4</div><span class="badge ba">↗ +1.2 days</span></div>
    </div>
    <div class="row2">
      <div class="panel">
        <div class="ph"><span class="pt">Monthly exposure trend</span><span class="pa">12M</span></div>
        <div class="bars">
          <div class="bw"><div class="b" style="height:36px;background:#EEF2F7"></div><div class="bl">Apr</div></div>
          <div class="bw"><div class="b" style="height:48px;background:#EEF2F7"></div><div class="bl">May</div></div>
          <div class="bw"><div class="b" style="height:32px;background:#EEF2F7"></div><div class="bl">Jun</div></div>
          <div class="bw"><div class="b" style="height:55px;background:#EEF2F7"></div><div class="bl">Jul</div></div>
          <div class="bw"><div class="b" style="height:44px;background:#EEF2F7"></div><div class="bl">Aug</div></div>
          <div class="bw"><div class="b" style="height:62px;background:#EEF2F7"></div><div class="bl">Sep</div></div>
          <div class="bw"><div class="b" style="height:50px;background:#EEF2F7"></div><div class="bl">Oct</div></div>
          <div class="bw"><div class="b" style="height:58px;background:#EEF2F7"></div><div class="bl">Nov</div></div>
          <div class="bw"><div class="b" style="height:52px;background:#EEF2F7"></div><div class="bl">Dec</div></div>
          <div class="bw"><div class="b" style="height:66px;background:#EEF2F7"></div><div class="bl">Jan</div></div>
          <div class="bw"><div class="b" style="height:62px;background:rgba(201,168,76,0.4)"></div><div class="bl">Feb</div></div>
          <div class="bw"><div class="b" style="height:70px;background:var(--navy)"></div><div class="bl">Mar</div></div>
        </div>
      </div>
      <div class="panel">
        <div class="ph"><span class="pt">Risk stage distribution</span></div>
        <div class="donut-wrap">
          <svg width="70" height="70" viewBox="0 0 70 70">
            <circle cx="35" cy="35" r="28" fill="none" stroke="#EEF2F7" stroke-width="12"/>
            <circle cx="35" cy="35" r="28" fill="none" stroke="#2ECC8A" stroke-width="12" stroke-dasharray="138 40" stroke-dashoffset="0" transform="rotate(-90 35 35)"/>
            <circle cx="35" cy="35" r="28" fill="none" stroke="#F0A04B" stroke-width="12" stroke-dasharray="25 153" stroke-dashoffset="-138" transform="rotate(-90 35 35)"/>
            <circle cx="35" cy="35" r="28" fill="none" stroke="#E85757" stroke-width="12" stroke-dasharray="13 165" stroke-dashoffset="-163" transform="rotate(-90 35 35)"/>
          </svg>
          <div class="legend">
            <div class="leg-item"><div class="leg-dot" style="background:#2ECC8A"></div>Stage 1 — 78.4%</div>
            <div class="leg-item"><div class="leg-dot" style="background:#F0A04B"></div>Stage 2 — 14.2%</div>
            <div class="leg-item"><div class="leg-dot" style="background:#E85757"></div>Stage 3 — 7.4%</div>
          </div>
        </div>
      </div>
    </div>
    <div class="row2">
      <div class="panel">
        <div class="ph"><span class="pt">Recent transactions</span><span class="pa">View all</span></div>
        <table class="tbl">
          <tr><th>Client</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th></tr>
          <tr><td>A. Berisha</td><td style="color:var(--muted)">Consumer</td><td class="mono" style="color:var(--green)">+€1,240</td><td class="mono">15 Mar</td><td><span class="badge bg">Paid</span></td></tr>
          <tr><td>B. Krasniqi</td><td style="color:var(--muted)">Overdraft</td><td class="mono" style="color:var(--red)">-€3,800</td><td class="mono">14 Mar</td><td><span class="badge br">Overdue</span></td></tr>
          <tr><td>V. Hoxha</td><td style="color:var(--muted)">Mortgage</td><td class="mono" style="color:var(--green)">+€680</td><td class="mono">14 Mar</td><td><span class="badge bg">Paid</span></td></tr>
          <tr><td>D. Gashi</td><td style="color:var(--muted)">Credit Card</td><td class="mono" style="color:var(--red)">-€520</td><td class="mono">13 Mar</td><td><span class="badge ba">Missed</span></td></tr>
        </table>
      </div>
      <div class="panel">
        <div class="ph"><span class="pt">Quick actions</span></div>
        <button class="act-btn">Client risk profile ↗</button>
        <button class="act-btn">Run EWI scan ↗</button>
        <button class="act-btn">Export for Power BI ↗</button>
        <button class="act-btn">Delinquency by region ↗</button>
      </div>
    </div>
  </div>
</div>

<!-- ═══════ EARLY WARNINGS PAGE ═══════ -->
<div id="p-warnings" class="page">
  <div class="topbar">
    <div><span class="tb-title">Early Warnings</span><span class="tb-sub">— EWI Monitor</span></div>
    <div class="tb-right"><span style="font-size:10px;background:#FEF0F0;color:#C43A3A;padding:4px 10px;border-radius:5px;border:1px solid #F7C1C1">2 Critical alerts</span></div>
  </div>
  <div class="content">
    <div class="row4">
      <div class="ewi-card"><div class="ewi-name">Salary inflow stopped</div><div class="ewi-val ewi-alert">3 clients</div></div>
      <div class="ewi-card"><div class="ewi-name">Overdraft spike</div><div class="ewi-val ewi-alert">5 clients</div></div>
      <div class="ewi-card"><div class="ewi-name">Card utilization &gt;80%</div><div class="ewi-val ewi-warn">8 clients</div></div>
      <div class="ewi-card"><div class="ewi-name">Consecutive lates</div><div class="ewi-val ewi-ok">Normal</div></div>
    </div>
    <div class="row2">
      <div class="panel">
        <div class="ph"><span class="pt">Active alerts</span><span class="pa">Mark resolved</span></div>
        <div class="alert-item" style="background:#FEF0F0;border-color:#F7C1C1">
          <div class="alert-icon" style="background:#FCEBEB">🔴</div>
          <div>
            <div class="alert-title">Salary inflow stopped — D. Gashi</div>
            <div class="alert-meta">No salary credited for 47 days · AC-9903 · Mitrovica</div>
            <div style="margin-top:5px"><span class="badge br">Critical</span> <span class="badge ba">Stage 3</span></div>
          </div>
          <div class="alert-right"><div class="alert-time">13 Mar 09:14</div></div>
        </div>
        <div class="alert-item" style="background:#FEF0F0;border-color:#F7C1C1">
          <div class="alert-icon" style="background:#FCEBEB">🔴</div>
          <div>
            <div class="alert-title">Overdraft utilization 94% — B. Krasniqi</div>
            <div class="alert-meta">Limit €4,000 · Used €3,760 · AC-4412 · Peja</div>
            <div style="margin-top:5px"><span class="badge br">Critical</span> <span class="badge ba">Stage 2</span></div>
          </div>
          <div class="alert-right"><div class="alert-time">14 Mar 11:32</div></div>
        </div>
        <div class="alert-item" style="background:#FEF5E7;border-color:#FAC775">
          <div class="alert-icon" style="background:#FAEEDA">🟡</div>
          <div>
            <div class="alert-title">Card utilization 82% — F. Morina</div>
            <div class="alert-meta">Limit €2,000 · Used €1,640 · CD-3312</div>
            <div style="margin-top:5px"><span class="badge ba">Warning</span></div>
          </div>
          <div class="alert-right"><div class="alert-time">15 Mar 08:20</div></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="panel">
          <div class="ph"><span class="pt">Alert trend (6 months)</span></div>
          <div class="bars" style="height:60px">
            <div class="bw"><div class="b" style="height:20px;background:#EEF2F7"></div><div class="bl">Oct</div></div>
            <div class="bw"><div class="b" style="height:25px;background:#EEF2F7"></div><div class="bl">Nov</div></div>
            <div class="bw"><div class="b" style="height:18px;background:#EEF2F7"></div><div class="bl">Dec</div></div>
            <div class="bw"><div class="b" style="height:30px;background:#EEF2F7"></div><div class="bl">Jan</div></div>
            <div class="bw"><div class="b" style="height:35px;background:rgba(240,160,75,0.5)"></div><div class="bl">Feb</div></div>
            <div class="bw"><div class="b" style="height:55px;background:#E85757"></div><div class="bl">Mar</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="ph"><span class="pt">Quick actions</span></div>
          <button class="act-btn">Flag high DPD clients ↗</button>
          <button class="act-btn">Salary inflow query ↗</button>
          <button class="act-btn">Consecutive lates ↗</button>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════ CLIENT PROFILE PAGE ═══════ -->
<div id="p-clients" class="page">
  <div class="topbar"><div><span class="tb-title">Clients</span><span class="tb-sub">— Risk Profile</span></div></div>
  <div class="content">
    <div class="row2">
      <div>
        <div class="profile-header">
          <div class="prof-av">DG</div>
          <div>
            <div class="prof-name">D. Gashi</div>
            <div class="prof-sub">ID: PID-88421 · Gjilan · Male · Age 42</div>
            <div class="prof-badges">
              <span class="badge br">Stage 3</span>
              <span class="badge ba">Watch</span>
              <span class="badge" style="background:#EEF2F7;color:var(--muted)">Self-employed</span>
            </div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-size:11px;color:var(--muted)">Risk Score</div>
            <div style="font-size:24px;font-weight:600;color:var(--red);font-family:var(--mono)">7.4</div>
            <div style="font-size:9px;color:var(--muted)">/ 10 High risk</div>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-item"><div class="detail-label">Total Exposure</div><div class="detail-value">€92,000</div></div>
          <div class="detail-item"><div class="detail-label">Product</div><div class="detail-value">Consumer Loan</div></div>
          <div class="detail-item"><div class="detail-label">Current DPD</div><div class="detail-value" style="color:var(--red)">47 days</div></div>
          <div class="detail-item"><div class="detail-label">Max DPD (12M)</div><div class="detail-value" style="color:var(--red)">47 days</div></div>
          <div class="detail-item"><div class="detail-label">Missed payments</div><div class="detail-value">3 of 8</div></div>
          <div class="detail-item"><div class="detail-label">DTI Ratio</div><div class="detail-value" style="color:var(--amber)">58%</div></div>
          <div class="detail-item"><div class="detail-label">Cure Rate</div><div class="detail-value" style="color:var(--red)">0%</div></div>
          <div class="detail-item"><div class="detail-label">Tenure</div><div class="detail-value">3 years</div></div>
        </div>
        <div class="panel" style="padding:12px">
          <div class="ph" style="margin-bottom:8px"><span class="pt">Early warning indicators</span></div>
          <div class="row2" style="gap:8px">
            <div class="ewi-card"><div class="ewi-name">Salary inflow</div><div class="ewi-val ewi-alert">Stopped</div></div>
            <div class="ewi-card"><div class="ewi-name">Overdraft</div><div class="ewi-val ewi-ok">Normal</div></div>
            <div class="ewi-card"><div class="ewi-name">Card usage</div><div class="ewi-val ewi-warn">Elevated</div></div>
            <div class="ewi-card"><div class="ewi-name">Consec. lates</div><div class="ewi-val ewi-alert">3 in a row</div></div>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="panel">
          <div class="ph"><span class="pt">DPD history (12M)</span></div>
          <div class="bars" style="height:65px">
            <div class="bw"><div class="b" style="height:5px;background:#EEF2F7"></div><div class="bl">Apr</div></div>
            <div class="bw"><div class="b" style="height:8px;background:rgba(240,160,75,0.5)"></div><div class="bl">Jun</div></div>
            <div class="bw"><div class="b" style="height:18px;background:rgba(232,87,87,0.5)"></div><div class="bl">Oct</div></div>
            <div class="bw"><div class="b" style="height:22px;background:rgba(232,87,87,0.6)"></div><div class="bl">Nov</div></div>
            <div class="bw"><div class="b" style="height:5px;background:#EEF2F7"></div><div class="bl">Jan</div></div>
            <div class="bw"><div class="b" style="height:30px;background:rgba(232,87,87,0.7)"></div><div class="bl">Feb</div></div>
            <div class="bw"><div class="b" style="height:55px;background:var(--red)"></div><div class="bl">Mar</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="ph"><span class="pt">Risk meter</span></div>
          <div class="meter"><div class="meter-pin" style="left:74%"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:4px"><span>Low</span><span>Medium</span><span>High</span></div>
        </div>
        <div class="panel">
          <div class="ph"><span class="pt">Activity timeline</span></div>
          <div class="timeline">
            <div class="tl-item"><div class="tl-dot" style="background:var(--red)">!</div><div class="tl-content"><div class="tl-title">3rd consecutive missed payment</div><div class="tl-meta">13 Mar 2026 · CR-00301</div></div></div>
            <div class="tl-item"><div class="tl-dot" style="background:var(--amber)">~</div><div class="tl-content"><div class="tl-title">Salary inflow stopped</div><div class="tl-meta">28 Feb 2026 · AC-9903</div></div></div>
            <div class="tl-item"><div class="tl-dot" style="background:var(--slate2)">i</div><div class="tl-content"><div class="tl-title">Reclassified to Stage 3</div><div class="tl-meta">01 Mar 2026 · RiskPortfolio</div></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ═══════ SETTINGS PAGE ═══════ -->
<div id="p-settings" class="page">
  <div class="topbar"><div><span class="tb-title">Settings</span><span class="tb-sub">— System configuration</span></div></div>
  <div class="content">
    <div class="row2">
      <div class="panel">
        <div class="ph"><span class="pt">Database connection</span></div>
        <div class="setting-row"><div><div class="setting-label">SSMS connection</div><div class="setting-sub">[Hackathon].[dbo] · ODBC Driver 17</div></div><span class="badge bg">Connected</span></div>
        <div class="setting-row"><div><div class="setting-label">Credentials source</div><div class="setting-sub">.env file · Never hardcoded</div></div><span class="badge bb">Secure</span></div>
        <div class="setting-row"><div><div class="setting-label">Read-only mode</div><div class="setting-sub">No UPDATE, DELETE or DROP</div></div><div class="toggle on"></div></div>
        <div class="setting-row"><div><div class="setting-label">NOLOCK on large tables</div><div class="setting-sub">Prevents blocking production</div></div><div class="toggle on"></div></div>
      </div>
      <div class="panel">
        <div class="ph"><span class="pt">Alert thresholds</span></div>
        <div class="setting-row"><div><div class="setting-label">Delinquency flag</div><div class="setting-sub">DueDays ≥ 30</div></div><span class="badge ba">30 days</span></div>
        <div class="setting-row"><div><div class="setting-label">Exposure spike</div><div class="setting-sub">Trigger if growth &gt;20% in 30 days</div></div><span class="badge ba">20%</span></div>
        <div class="setting-row"><div><div class="setting-label">Z-score anomaly</div><div class="setting-sub">Flag if delay z-score &gt; 2.0</div></div><span class="badge ba">2.0σ</span></div>
        <div class="setting-row"><div><div class="setting-label">Consecutive lates</div><div class="setting-sub">Flag after N missed payments</div></div><span class="badge ba">3 in a row</span></div>
        <div class="setting-row"><div><div class="setting-label">Card utilization</div><div class="setting-sub">Trigger above threshold</div></div><span class="badge ba">80%</span></div>
      </div>
    </div>
  </div>
</div>

<script>
function show(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('p-' + page).classList.add('active');
  el.classList.add('active');
}
</script>
</body>
</html>
```

> **Claude Code instruction:** The HTML above is the design. Build this — not an interpretation of it.
> - Copy the `<style>` block into `globals.css` verbatim — do not rewrite, reorder, or rename any class.
> - Convert HTML structure to JSX/TSX 1:1 — same nesting, same elements, same hierarchy.
> - `class` → `className`. `onclick` → `onClick`. Inline styles → `style={{}}` JSX syntax. Nothing else changes.
> - Do not swap any color for a Tailwind class — use CSS variables from `globals.css`.
> - Do not add, remove, or rearrange any element.
> - If you are unsure whether something matches the HTML — it must match. Check the HTML reference, not your judgment.

---

## Power BI Dashboard Specs

When generating Power BI prep data or documentation, follow these specs:

### Portfolio Health Dashboard
- **KPI Cards:** % late payments, total high-risk exposure, # customers with deteriorating scores
- **Heatmap:** Loan performance by product type × region
- **Trend line:** Average delay days over time (monthly)
- **Bar chart:** Delinquency rate by customer segment
- **Filters/Slicers:** loan_type, customer segment, region, date range, risk_rating band

### Client Risk Profile Dashboard (per-customer drill-down)
- **Header:** Client ID, Age band, Employment, Region, Tenure, Risk Score badge (color-coded)
- **Exposure panel:** Donut chart (product breakdown) + total exposure vs. limit gauge
- **Repayment behavior:** DPD timeline (bar chart, last 24 months), Max DPD card, Cure rate %
- **EWI panel:** Red/amber/green indicator tiles for each of the 4 EWI categories
- **Designed for underwriters:** Clean, scannable layout — prioritize speed of comprehension over decoration

For each dashboard, produce:
- A **DAX measure file** (`.dax`) with all calculated measures documented
- A **data model description** (table relationships, grain of each table)
- A **mock layout spec** (text description or ASCII wireframe) if Power BI file cannot be generated directly

> **✅ Section Check:** Does the Portfolio dashboard have KPI cards, heatmap, trend line, and slicers? Does the Client Risk Profile have the EWI panel and exposure donut? DAX measures documented? If yes, proceed.

---

## File & Folder Structure

Maintain this structure:

```
project/
│
├── data/
│   ├── raw/                       # Simulated CSVs (loans, repayments, customers)
│   └── processed/                 # Flagged and enriched output datasets
│
├── sql/
│   ├── kpi_metrics.sql            # Portfolio-level KPI queries
│   ├── client_profile.sql         # Per-customer risk profile query
│   └── exposure_analysis.sql      # Exposure by segment / product / region
│
├── notebooks/
│   └── risk_trend_analysis.ipynb  # Main Python analysis notebook
│
├── scripts/
│   ├── flag_risks.py              # Risk flagging functions
│   └── export_for_powerbi.py      # Prepare and export enriched dataset
│
├── powerbi/
│   ├── measures.dax               # All DAX measures
│   └── data_model.md              # Table relationships and grain documentation
│
└── CLAUDE.md                      # This file
```

> **✅ Section Check:** Do you know where SQL queries, Python scripts, notebooks, and Power BI files go? Raw data in `/data/raw/`, processed in `/data/processed/`? If yes, proceed.

---

## Deliverables Checklist

Before considering any phase complete, verify:

- [ ] SSMS connection verified and schema cross-checked against this CLAUDE.md
- [ ] All 5 SQL KPI queries written, commented, and tested on sample data
- [ ] Python notebook complete with all 5 flagging functions implemented and documented
- [ ] Flagged dataset exported to `/data/processed/` as CSV (Power BI-ready)
- [ ] DAX measures written for all KPI cards and chart calculations
- [ ] Data model documented with table grain and relationships
- [ ] EWI indicators are computable from the available schema
- [ ] Client Risk Profile view producible at the single-customer level

> **✅ Section Check:** Go through each checkbox — can you confirm every item is completed before marking a phase done? If yes, proceed.

---

## Performance

Speed matters at every layer. Follow these rules to keep queries, scripts, and dashboards fast.

### SQL (SSMS)
- Always use `WITH (NOLOCK)` on large tables to avoid blocking.
- Filter early — apply `WHERE` clauses before `JOIN`s, never after.
- Use indexed columns in `WHERE`, `JOIN`, and `ORDER BY` — avoid functions on indexed columns (e.g., `YEAR(start_date)` kills index use; use a date range instead).
- Avoid `SELECT *` — only fetch the columns you need.
- Use `TOP N` when exploring or previewing data.
- For heavy aggregations, consider creating **views or indexed views** in SSMS rather than rerunning expensive queries every session.

### Python
- Load only the columns you need from SQL: `pd.read_sql("SELECT col1, col2 ...", conn)` — not full table dumps.
- Use vectorized `pandas` operations — avoid row-by-row `for` loops on DataFrames.
- For large exports, write to CSV in chunks: `df.to_csv(..., chunksize=10000)`.
- Cache intermediate DataFrames (`.pkl` or `.parquet`) so re-runs don't re-query the database.

### Next.js Frontend
- Use **Server Components** by default — only add `"use client"` when interactivity is strictly required. Server Components ship zero JS to the browser.
- Use `next/image` for all images — it auto-compresses, lazy-loads, and serves the right size per device.
- Use `next/link` for all navigation — it prefetches pages in the background automatically.
- Use **dynamic imports** (`next/dynamic`) for heavy components (charts, tables, modals) so they don't block the initial page load.
- Enable **ISR (Incremental Static Regeneration)** for dashboard pages that don't need real-time data — set a `revalidate` interval instead of fetching on every request.
- Fetch data as close to the source as possible — use **Server Components + `fetch()`** with caching rather than client-side `useEffect` data fetching.
- Avoid layout shift — always define `width` and `height` on images and reserve space for async content.
- Use `loading.tsx` and `Suspense` boundaries so pages are interactive immediately while slower parts stream in.
- Bundle size: run `next build` and check the output — no single page should exceed **200KB** of JS. Use `@next/bundle-analyzer` if pages are too heavy.

### Power BI Dashboard
- Use **Import mode** over DirectQuery where possible — pre-loaded data renders far faster.
- Aggregate and filter data **before** it reaches Power BI (in SQL or Python), not inside DAX.
- Avoid calculated columns in DAX — use measures instead.
- Limit visuals per page to 6–8 — too many visuals on one page slows render time significantly.
- Use **numeric keys** for relationships, not string fields like names or descriptions.

> **✅ Section Check:** SQL using `NOLOCK` + early filters? Python loading only needed columns? Next.js using Server Components + dynamic imports? Power BI on Import mode with max 8 visuals per page? If yes, proceed.

---

## Frontend Design System

Implement the UI exactly as specified below. Do not deviate from colors, fonts, layout, or component patterns unless explicitly told to.

### Fonts
```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
```
- **Body / UI:** `Sora` — weights 400 and 500 only
- **Numbers / codes / amounts:** `IBM Plex Mono` — weights 400 and 500
- Never use Inter, Roboto, Arial, or system fonts

### Color Tokens
```css
--navy:    #0D1B2A   /* sidebar background, dark cards, primary CTA */
--navy2:   #162333   /* hover states on dark surfaces */
--navy3:   #1E2F42   /* borders on dark surfaces */
--gold:    #C9A84C   /* primary accent, active nav, logo */
--gold2:   #E8C97A   /* active nav text, lighter gold accents */
--slate:   #8FA3B8   /* muted text, inactive nav icons */
--slate2:  #B8CCDC   /* subtle fills, secondary bars */
--white:   #F4F7FA   /* page background */
--surface: #FFFFFF   /* card backgrounds */
--border:  #E8EDF2   /* all card and table borders */
--text:    #0D1B2A   /* primary text */
--muted:   #8FA3B8   /* secondary / label text */
--green:   #2ECC8A   /* success, positive amounts, Stage 1 */
--red:     #E85757   /* danger, overdue, Stage 3, alerts */
--amber:   #F0A04B   /* warning, Stage 2, watch */
--blue:    #378ADD   /* informational, card type badges */
```

### Badge / status colors
```css
/* Green */  background:#EAF9F2; color:#1A9E60
/* Red */    background:#FEF0F0; color:#C43A3A
/* Amber */  background:#FEF5E7; color:#B07010
/* Blue */   background:#E6F1FB; color:#185FA5
/* Gray */   background:#EEF2F7; color:#8FA3B8
```

### Layout
- **Shell:** dark navy sidebar (210px) + white main area — fixed, never collapsible by default
- **Topbar:** 54px, white, 1px bottom border `#E8EDF2`, holds page title + date + icon buttons
- **Content area:** scrollable, `padding: 18px 20px`, `gap: 14px` between sections
- **Grids:** use CSS Grid — `row2` (1fr 1fr), `row3` (1fr 1fr 1fr), `row4` (repeat 4, 1fr), gap always 12–14px

### Components

**KPI card**
- White background, 1px border `#E8EDF2`, `border-radius: 10px`, `padding: 14px`
- Label: 9px, letter-spacing 1.5px, uppercase, color `--muted`
- Value: 20px, weight 600, `IBM Plex Mono`
- Badge below value for trend indicator

**Dark KPI card** (total exposure hero)
- Background `--navy`, same border-radius
- Label color `--slate`, value color `#fff`, accent color `--gold`

**Panel**
- White, 1px border, `border-radius: 10px`, `padding: 16px`
- Panel header: `font-size: 12px`, weight 600, color `--text`; action button right-aligned: 10px, muted, bordered

**Tables**
- `font-size: 11px`, `border-collapse: collapse`
- `th`: 9px, letter-spacing 1.5px, uppercase, color `--muted`, `padding: 0 10px 8px`
- `td`: `padding: 9px 10px`, `border-top: 1px solid var(--border)`
- Row hover: `background: #F8FAFC`
- Monetary values always in `IBM Plex Mono`

**Progress bars**
- Track: `height: 5px`, `background: #EEF2F7`, `border-radius: 3px`
- Fill: same height/radius, color varies by meaning
- Label left (80px fixed), value right (36px fixed), bar fills remaining space

**Bar charts**
- Pure CSS — flex row, bars are divs with fixed height, `border-radius: 3px 3px 0 0`
- Active bar: `--navy`; gold highlight bar: `rgba(201,168,76,0.4)`; default: `#EEF2F7`
- Labels: 8px, `--muted`, `IBM Plex Mono`

**Alert items**
- Bordered card, colored background matching severity (red/amber)
- Icon box left (28px, rounded), title 12px weight 500, meta 10px muted, time right-aligned

**Timeline**
- Vertical list with connecting line (`1px solid --border`)
- Dot: 22px circle, colored by severity, white text inside
- Content: title 11px weight 500, meta 10px muted

**Risk meter**
- `height: 10px`, gradient `left→right: #2ECC8A → #F0A04B → #E85757`
- Pin: 16px white circle with `2px solid --navy` border, positioned by `left: X%`

**Navigation — sidebar**
- Active item: `background: rgba(201,168,76,0.1)`, `border: 1px solid rgba(201,168,76,0.2)`
- Active icon: `--gold`, active text: `--gold2`, weight 500
- Inactive: no border, icon and text `--slate`
- Badges: red `--red` background, white text, 9px, `IBM Plex Mono`
- Divider: `1px solid rgba(255,255,255,0.05)`
- Nav label: 9px, letter-spacing 2px, uppercase, `--slate`

**Toggles**
- `width: 36px; height: 20px; border-radius: 10px`
- On: `background: --navy`; Off: `background: #D1D9E0`
- Knob: 16px white circle, transitions left on state change

### Pages to build
Build all 7 pages with sidebar navigation:

1. **Dashboard** — KPI cards (total exposure, delinquency rate, avg DPD), monthly exposure bar chart, risk stage donut, recent transactions table, quick action buttons
2. **Portfolio** — 4 KPI cards, exposure by product progress bars, exposure by region table, secured vs unsecured bars, top loans table
3. **Transactions** — TCredits table, TAccounts table, CC_Event_LOG table — all pulling from real SSMS tables
4. **Early Warnings** — 4 EWI tiles, alert cards with severity (red/amber), alert trend bar chart, quick action buttons
5. **Clients** — per-client risk profile: avatar + name + badges, detail grid (8 fields), EWI 2×2 grid, DPD history bars, risk meter, activity timeline, underwriter action button
6. **Analytics** — delinquency by segment, stage migration table, risk score distribution chart, provision adequacy bars, AI insight action buttons
7. **Settings** — database connection config, alert threshold display, Claude Code settings, Power BI export config — all reflecting CLAUDE.md values

### Do not
- Do not use Tailwind gradient utilities on backgrounds — use flat colors only
- Do not use box-shadow on cards — borders only
- Do not use font-weight 600 or 700 on body text — 400 and 500 only
- Do not use placeholder/lorem ipsum data — connect to real SSMS tables
- Do not add animations beyond hover state transitions (0.15s)

---

## Risk Prediction Module

This is the core differentiator of the project. The system must not only monitor and detect risk — it must **predict** which customers are likely to default or migrate to a worse stage before it happens. This transforms SPECTRA from a monitoring dashboard into a genuine credit risk prediction system.

---

### What to predict

| Target | Definition | Horizon |
|---|---|---|
| **Stage migration** | Will this Stage 1 client move to Stage 2 next month? | 30 days |
| **Default probability** | Will this client reach Stage 3 within 90 days? | 90 days |
| **DPD escalation** | Will DPD exceed 30 for this client next month? | 30 days |

---

### Feature Engineering
**File:** `scripts/feature_engineering.py`

Build a feature matrix per `clientID` using these tables:

```python
# From RiskPortfolio
features = [
    'Stage',                    # current IFRS 9 stage
    'BankCurrentRating',        # current internal rating
    'BankPreviousMonthRating',  # rating last month (change signal)
    'totalExposure',            # total outstanding
    'onBalanceExposure',        # on-balance portion
    'duePrincipal',             # overdue principal amount
    'penaltyInterest',          # penalty interest accrued
    'AccruedInterest',          # total accrued interest
    'Effective Interest Rate',  # loan interest rate
    'Restructuring',            # has the loan been restructured?
    'TotalOffBalance',          # contingent exposure
]

# From DueDaysDaily
features += [
    'DueDays',       # current DPD
    'DueMax6M',      # max DPD in last 6 months
    'DueMax1Y',      # max DPD in last 12 months
    'DueMax2Y',      # max DPD in last 24 months
    'DueTotal',      # total due days ever
]

# From AmortizationPlan (aggregated per client)
features += [
    'repayment_rate_avg',       # AVG(OTPLATA/ANUITET)
    'repayment_rate_min',       # MIN(OTPLATA/ANUITET) — worst installment
    'missed_payment_count',     # installments where OTPLATA = 0
    'missed_payment_ratio',     # missed / total installments
    'consecutive_lates',        # max consecutive missed payments
]

# From TAccounts (aggregated per client)
features += [
    'salary_months_active',     # months with positive inflow
    'salary_stopped_flag',      # 1 if no salary in last 60 days
    'overdraft_months',         # months with negative balance
    'overdraft_dependency',     # 1 if 3+ months of overdraft
]

# From CC_Event_LOG (aggregated per client)
features += [
    'card_spend_last30d',       # total card spend last 30 days
    'card_spend_mom_growth',    # MoM % growth in card spend
    'card_acceleration_flag',   # 1 if MoM growth > 30%
]

# Engineered features
features += [
    'rating_deterioration',     # 1 if BankCurrentRating < BankPreviousMonthRating
    'stage_age_months',         # months in current stage
    'exposure_growth_rate',     # MoM % change in totalExposure
    'dpd_trend',                # slope of DPD over last 3 snapshots (linear regression)
]
```

---

### Label Construction
**File:** `scripts/build_labels.py`

```python
# Target 1: Stage migration (Stage 1 → Stage 2 within 30 days)
# Join RiskPortfolio on clientID across two consecutive CalculationDate snapshots
# label_stage_migration = 1 if stage_next > stage_current else 0

# Target 2: Default (any stage → Stage 3 within 90 days)
# label_default_90d = 1 if stage reaches 3 within next 3 snapshots else 0

# Target 3: DPD escalation (DueDays crosses 30 next month)
# label_dpd_escalation = 1 if next_month_DueDays >= 30 and current_DueDays < 30 else 0
```

---

### Model Training
**File:** `scripts/train_model.py`

```python
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import roc_auc_score, classification_report, confusion_matrix
from sklearn.preprocessing import StandardScaler
import shap

# Train 3 models, compare AUC — use the best one
models = {
    'logistic_regression': LogisticRegression(class_weight='balanced'),
    'random_forest': RandomForestClassifier(n_estimators=100, class_weight='balanced'),
    'gradient_boosting': GradientBoostingClassifier(n_estimators=100)
}

# Class imbalance handling — defaulters are minority class
# Use class_weight='balanced' or SMOTE if imbalance > 10:1

# Evaluation metrics — use AUC-ROC, not accuracy (class imbalance)
# Target AUC > 0.75 for Hackathon demo quality

# Feature importance — use SHAP values to explain predictions
# This is critical for the underwriter dashboard — "why is this client high risk?"
explainer = shap.TreeExplainer(best_model)
shap_values = explainer.shap_values(X_test)
```

---

### Prediction Output
**File:** `scripts/predict.py`

For every active client, produce:

```python
{
    'clientID': '...',
    'prediction_date': '2026-03-16',
    'pd_score': 0.73,               # probability of default 0–1
    'risk_label': 'High',           # Low / Medium / High / Critical
    'stage_migration_prob': 0.61,   # probability of moving to worse stage
    'dpd_escalation_prob': 0.44,    # probability DPD crosses 30
    'top_risk_factors': [           # top 3 SHAP features driving the score
        'DueMax6M',
        'missed_payment_ratio',
        'salary_stopped_flag'
    ],
    'recommended_action': 'Immediate review — contact client'
}
```

Export to `/data/processed/predictions.csv` for Power BI and the dashboard.

---

### Recommended Actions Logic
Map `pd_score` to an action:

| PD Score | Risk Label | Recommended Action |
|---|---|---|
| 0.00 – 0.20 | Low | No action required |
| 0.21 – 0.40 | Medium | Monitor monthly |
| 0.41 – 0.65 | High | Schedule client review |
| 0.66 – 0.85 | Critical | Immediate contact — restructuring review |
| 0.86 – 1.00 | Default imminent | Escalate to recovery team |

---

### Dashboard Integration

**Client Profile page** — add a "Prediction" panel:
- Large `pd_score` displayed as % (e.g. "73% default probability")
- Risk label badge (color-coded: green/amber/red/dark red)
- Top 3 SHAP factors listed as: *"This client's score is driven by: high missed payment ratio, salary inflow stopped, rising DPD trend"*
- Recommended action button

**Early Warnings page** — add a "Predicted High Risk" table:
- All clients with `pd_score > 0.65` who are currently still in Stage 1 or Stage 2
- These are the clients the bank does NOT yet know are about to default
- Sorted by `pd_score` DESC — this is the most actionable output in the entire system

**Analytics page** — add:
- Distribution of `pd_score` across portfolio (histogram)
- `stage_migration_prob` trend over time
- Model AUC score and last training date

---

### File Structure — Prediction Module
```
scripts/
├── feature_engineering.py    # Build feature matrix from SSMS tables
├── build_labels.py           # Construct prediction targets
├── train_model.py            # Train, evaluate, and save best model
├── predict.py                # Score all active clients
└── explain.py                # SHAP explanations per client

models/
└── best_model.pkl            # Saved trained model

data/processed/
└── predictions.csv           # Final scored client list for dashboard
```

---

### Prediction Checklist
- [ ] Feature matrix built from all 11 tables — no nulls, no leakage
- [ ] Labels constructed for all 3 targets (stage migration, default 90d, DPD escalation)
- [ ] 3 models trained and compared — best model selected by AUC
- [ ] AUC > 0.70 achieved on test set
- [ ] SHAP values computed — top 3 factors per client
- [ ] `predictions.csv` exported to `/data/processed/`
- [ ] Prediction panel added to Client Profile page
- [ ] "Predicted High Risk" table added to Early Warnings page
- [ ] Model AUC and last training date shown on Analytics page

---

## Advanced Calculations

These 11 calculations must be implemented as part of the project. Each one maps to a real table in `[Hackathon].[dbo]`. SQL queries go in `/sql/`, Python functions go in `scripts/calculations.py`.

---

### PERFECT FIT — Core to Portfolio Monitoring & Risk Trend Discovery

---

#### 1. Rollrate Matrix
**What it does:** Tracks how customers move between DPD buckets month-over-month (0→30, 30→60, 60→90, 90+). Shows whether the portfolio is deteriorating or recovering over time.
**Tables:** `DueDaysDaily` (dateID, CreditAccount, PersonalID, DueDays)

```sql
-- Description: Rollrate matrix — customer movement between DPD buckets MoM
WITH bucketed AS (
    SELECT
        PersonalID, CreditAccount, dateID,
        CASE
            WHEN DueDays = 0               THEN '0 - Current'
            WHEN DueDays BETWEEN 1 AND 29  THEN '1-29 DPD'
            WHEN DueDays BETWEEN 30 AND 59 THEN '30-59 DPD'
            WHEN DueDays BETWEEN 60 AND 89 THEN '60-89 DPD'
            ELSE '90+ DPD'
        END AS dpd_bucket,
        LAG(CASE
            WHEN DueDays = 0               THEN '0 - Current'
            WHEN DueDays BETWEEN 1 AND 29  THEN '1-29 DPD'
            WHEN DueDays BETWEEN 30 AND 59 THEN '30-59 DPD'
            WHEN DueDays BETWEEN 60 AND 89 THEN '60-89 DPD'
            ELSE '90+ DPD'
        END) OVER (PARTITION BY CreditAccount ORDER BY dateID) AS prev_bucket
    FROM [Hackathon].[dbo].[DueDaysDaily] WITH (NOLOCK)
)
SELECT
    prev_bucket  AS from_bucket,
    dpd_bucket   AS to_bucket,
    COUNT(*)     AS transitions
FROM bucketed
WHERE prev_bucket IS NOT NULL
GROUP BY prev_bucket, dpd_bucket
ORDER BY prev_bucket, dpd_bucket;
```

**Python task:** Pivot result into a matrix heatmap. Flag if `0 → 30-59 DPD` transition rate increases MoM by more than 10%.

---

#### 2. Vintage Analysis
**What it does:** Groups loans by `FromYear` and tracks how each cohort's average DPD evolved over time. Reveals whether credit standards are tightening or loosening.
**Tables:** `Credits` (CreditAccount, PersonalID, FromYear), `DueDaysDaily` (CreditAccount, dateID, DueDays)

```sql
-- Description: Vintage analysis — avg DPD per loan cohort (issuance year) over time
SELECT
    c.FromYear                              AS vintage_year,
    d.dateID                                AS snapshot_date,
    COUNT(DISTINCT d.CreditAccount)         AS loan_count,
    AVG(CAST(d.DueDays AS FLOAT))           AS avg_due_days,
    SUM(CASE WHEN d.DueDays >= 30 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(*), 0)               AS delinquency_rate_pct
FROM [Hackathon].[dbo].[Credits] c WITH (NOLOCK)
JOIN [Hackathon].[dbo].[DueDaysDaily] d WITH (NOLOCK)
    ON c.CreditAccount = d.CreditAccount
GROUP BY c.FromYear, d.dateID
ORDER BY c.FromYear, d.dateID;
```

**Python task:** Plot each vintage year as a separate line. Flag vintages where `delinquency_rate_pct` exceeds 10% within 12 months of issuance.

---

#### 3. NPL Ratio (Non-Performing Loan)
**What it does:** % of loans with DPD >= 90 out of total active loans. The primary regulatory portfolio health KPI.
**Tables:** `DueDaysDaily` (DueDays, dateID, CreditAccount)

```sql
-- Description: NPL ratio — loans with DPD >= 90 as % of total active portfolio
WITH latest_dpd AS (
    SELECT
        CreditAccount, DueDays,
        ROW_NUMBER() OVER (PARTITION BY CreditAccount ORDER BY dateID DESC) AS rn
    FROM [Hackathon].[dbo].[DueDaysDaily] WITH (NOLOCK)
)
SELECT
    COUNT(*)                                                AS total_loans,
    SUM(CASE WHEN DueDays >= 90 THEN 1 ELSE 0 END)         AS npl_count,
    SUM(CASE WHEN DueDays >= 90 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(*), 0)                               AS npl_ratio_pct
FROM latest_dpd
WHERE rn = 1;
```

**Python task:** Calculate NPL ratio monthly over time. Flag if it exceeds 5% or increases more than 1% in a single month.

---

#### 4. ECL — Expected Credit Loss (IFRS 9)
**What it does:** `PD × LGD × EAD` — regulatory formula for expected loss. Compare calculated ECL against bank's own `CalculatedProvision` to find gaps.
**Tables:** `RiskPortfolio` (Stage, totalExposure, CalculatedProvision, [Effective Interest Rate])

```sql
-- Description: ECL by stage using IFRS 9 PD tiers vs bank CalculatedProvision
-- PD: Stage 1 = 1%, Stage 2 = 20%, Stage 3 = 100% | LGD: 45% standard
SELECT
    Stage, stageDescr,
    COUNT(*)                                            AS loan_count,
    SUM(totalExposure)                                  AS total_exposure,
    SUM(CalculatedProvision)                            AS bank_provision,
    SUM(totalExposure *
        CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.20 ELSE 1.0 END * 0.45
    )                                                   AS calculated_ecl,
    SUM(CalculatedProvision) - SUM(totalExposure *
        CASE Stage WHEN 1 THEN 0.01 WHEN 2 THEN 0.20 ELSE 1.0 END * 0.45
    )                                                   AS provision_gap
FROM [Hackathon].[dbo].[RiskPortfolio] WITH (NOLOCK)
GROUP BY Stage, stageDescr
ORDER BY Stage;
```

**Python task:** Flag any stage where `provision_gap` is negative (under-provisioned). Surface as a red alert on the Analytics page.

---

#### 5. Repayment Rate
**What it does:** `OTPLATA / ANUITET` per installment — actual vs scheduled payment. Below 1.0 = partial payment; below 0.5 = critical distress.
**Tables:** `AmortizationPlan` (PARTIJA, DATUMDOSPECA, OTPLATA, ANUITET)

```sql
-- Description: Repayment rate per installment — actual vs scheduled payment
SELECT
    PARTIJA                                             AS credit_account,
    DATUMDOSPECA                                        AS due_date,
    OTPLATA                                             AS amount_paid,
    ANUITET                                             AS amount_due,
    CAST(OTPLATA AS FLOAT) / NULLIF(ANUITET, 0)        AS repayment_rate,
    CASE
        WHEN CAST(OTPLATA AS FLOAT) / NULLIF(ANUITET, 0) >= 1.0 THEN 'Full'
        WHEN CAST(OTPLATA AS FLOAT) / NULLIF(ANUITET, 0) >= 0.5 THEN 'Partial'
        ELSE 'Critical'
    END                                                 AS payment_status
FROM [Hackathon].[dbo].[AmortizationPlan] WITH (NOLOCK)
WHERE ANUITET > 0
ORDER BY DATUMDOSPECA DESC;
```

**Python task:** Flag any `CreditAccount` with `repayment_rate < 0.8` for 3+ consecutive installments as `flag_low_repayment`.

---

#### 6. Interest Income at Risk
**What it does:** `totalExposure × Effective Interest Rate` for Stage 2 and 3 — how much interest will not be collected if these customers don't cure.
**Tables:** `RiskPortfolio` (Stage, totalExposure, [Effective Interest Rate])

```sql
-- Description: Interest income at risk — Stage 2 and Stage 3 exposure × interest rate
SELECT
    Stage, stageDescr,
    COUNT(*)                                              AS client_count,
    SUM(totalExposure)                                    AS at_risk_exposure,
    AVG([Effective Interest Rate])                        AS avg_interest_rate,
    SUM(totalExposure * [Effective Interest Rate] / 100)  AS interest_income_at_risk
FROM [Hackathon].[dbo].[RiskPortfolio] WITH (NOLOCK)
WHERE Stage IN (2, 3)
GROUP BY Stage, stageDescr
ORDER BY Stage;
```

**Python task:** Track monthly trend. Flag if total `interest_income_at_risk` exceeds 5% of total expected portfolio interest income.

---

### STRONG SUPPORTING — Behavioral & Portfolio Depth

---

#### 7. Probability of Default (PD) by Rating
**What it does:** Historical transition rate from each rating band to Stage 3 (default). Calibrates the PD assumptions used in ECL.
**Tables:** `RiskPortfolio` (clientID, BankPreviousMonthRating, Stage)

```sql
-- Description: PD by rating — % of clients per rating that migrated to Stage 3
SELECT
    BankPreviousMonthRating                             AS rating_last_month,
    COUNT(*)                                            AS total_clients,
    SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END)         AS defaulted,
    SUM(CASE WHEN Stage = 3 THEN 1 ELSE 0 END) * 100.0
        / NULLIF(COUNT(*), 0)                           AS pd_pct
FROM [Hackathon].[dbo].[RiskPortfolio] WITH (NOLOCK)
WHERE BankPreviousMonthRating IS NOT NULL
GROUP BY BankPreviousMonthRating
ORDER BY pd_pct DESC;
```

**Python task:** Flag any rating band where PD increased more than 5% vs the prior calculation period.

---

#### 8. Coverage Ratio
**What it does:** `CalculatedProvision / totalExposure` by stage and month. A declining ratio signals the portfolio health is worse than reported.
**Tables:** `RiskPortfolio` (CalculationDate, CalculatedProvision, totalExposure, Stage)

```sql
-- Description: Coverage ratio — provision vs exposure by stage and calculation date
SELECT
    CalculationDate,
    Stage,
    SUM(CalculatedProvision)                            AS total_provision,
    SUM(totalExposure)                                  AS total_exposure,
    SUM(CalculatedProvision) * 100.0
        / NULLIF(SUM(totalExposure), 0)                 AS coverage_ratio_pct
FROM [Hackathon].[dbo].[RiskPortfolio] WITH (NOLOCK)
GROUP BY CalculationDate, Stage
ORDER BY CalculationDate, Stage;
```

**Python task:** Flag any month where `coverage_ratio_pct` for Stage 2 or 3 drops more than 2% compared to the previous month.

---

#### 9. Time to First Delinquency
**What it does:** Days from loan issuance to first late payment. Short time-to-delinquency flags loans that should not have been approved.
**Tables:** `Credits` (CreditAccount, PersonalID, FromYear), `DueDaysDaily` (CreditAccount, dateID, DueDays)

```sql
-- Description: Time to first delinquency per loan
WITH first_late AS (
    SELECT CreditAccount, MIN(dateID) AS first_late_date
    FROM [Hackathon].[dbo].[DueDaysDaily] WITH (NOLOCK)
    WHERE DueDays > 0
    GROUP BY CreditAccount
)
SELECT
    c.CreditAccount, c.PersonalID, c.FromYear, c.Amount,
    f.first_late_date,
    DATEDIFF(day,
        CAST(CAST(c.FromYear AS VARCHAR) + '-01-01' AS DATE),
        CAST(f.first_late_date AS DATE)
    )                                                   AS days_to_first_delinquency
FROM [Hackathon].[dbo].[Credits] c WITH (NOLOCK)
JOIN first_late f ON c.CreditAccount = f.CreditAccount
ORDER BY days_to_first_delinquency ASC;
```

**Python task:** Flag loans where `days_to_first_delinquency < 90` as `flag_fast_default`. Segment by `FromYear` to show vintage quality trend over years.

---

#### 10. Card Spend Acceleration
**What it does:** Month-over-month % growth in card spend per account. A spike of 30%+ triggers the "credit card utilization spike" EWI automatically.
**Tables:** `CC_Event_LOG` (Account, trans_date, Ammount)

```sql
-- Description: Monthly card spend per account with MoM growth rate
WITH monthly AS (
    SELECT
        Account,
        FORMAT(trans_date, 'yyyy-MM')   AS spend_month,
        SUM(Ammount)                    AS monthly_spend
    FROM [Hackathon].[dbo].[CC_Event_LOG] WITH (NOLOCK)
    GROUP BY Account, FORMAT(trans_date, 'yyyy-MM')
)
SELECT
    Account, spend_month, monthly_spend,
    LAG(monthly_spend) OVER (PARTITION BY Account ORDER BY spend_month) AS prev_spend,
    (monthly_spend - LAG(monthly_spend) OVER (PARTITION BY Account ORDER BY spend_month))
        * 100.0 / NULLIF(LAG(monthly_spend) OVER (
            PARTITION BY Account ORDER BY spend_month), 0) AS mom_growth_pct
FROM monthly
ORDER BY Account, spend_month;
```

**Python task:** Flag accounts where `mom_growth_pct > 30` for 2+ consecutive months as `flag_card_acceleration`. Join to `Cards.PersonalID` to surface in the client EWI panel.

---

#### 11. Overdraft Dependency Score
**What it does:** Counts consecutive months of overdraft usage per customer. 3+ months = watch (amber), 6+ months = critical (red).
**Tables:** `TAccounts` (NoAccount, Date, Amount, AccountType), `Accounts` (NoAccount, PersonalID)

```sql
-- Description: Overdraft dependency — consecutive months of overdraft use per customer
WITH monthly_od AS (
    SELECT
        a.PersonalID, t.NoAccount,
        FORMAT(t.Date, 'yyyy-MM')   AS usage_month,
        SUM(t.Amount)               AS net_amount
    FROM [Hackathon].[dbo].[TAccounts] t WITH (NOLOCK)
    JOIN [Hackathon].[dbo].[Accounts] a WITH (NOLOCK)
        ON t.NoAccount = a.NoAccount
    WHERE t.AccountType LIKE '%overdraft%' OR t.AccountType LIKE '%OD%'
    GROUP BY a.PersonalID, t.NoAccount, FORMAT(t.Date, 'yyyy-MM')
)
SELECT
    PersonalID, NoAccount,
    COUNT(DISTINCT usage_month)     AS months_with_overdraft,
    MIN(usage_month)                AS first_od_month,
    MAX(usage_month)                AS last_od_month
FROM monthly_od
GROUP BY PersonalID, NoAccount
ORDER BY months_with_overdraft DESC;
```

**Python task:** Flag `PersonalID` where `months_with_overdraft >= 3` as `flag_overdraft_dependent`. Score: 3–5 months = amber, 6+ = red. Feed into EWI panel on Client Profile page.

---

> **✅ Calculations Checklist — complete before final demo**
> - [ ] Rollrate matrix → exported to `/data/processed/rollrate.csv`
> - [ ] Vintage analysis → plotted by cohort in notebook
> - [ ] NPL ratio → added as monthly KPI card
> - [ ] ECL → calculated by stage, provision gap flagged
> - [ ] Repayment rate → `flag_low_repayment` added per account
> - [ ] Interest income at risk → Stage 2 and 3 total surfaced
> - [ ] PD by rating → trend flagged
> - [ ] Coverage ratio → monthly decline flagged
> - [ ] Time to first delinquency → `flag_fast_default` added
> - [ ] Card spend acceleration → `flag_card_acceleration` added
> - [ ] Overdraft dependency → `flag_overdraft_dependent` scored and color-coded

---





Claude Code uses prompt caching — this CLAUDE.md is cached after the first load and costs almost nothing on subsequent turns. Follow every rule below to avoid hitting usage limits.

### Model
- **Always use Sonnet** — never switch to Opus. If you are on Opus, run `/model` and switch immediately. Opus consumes limits ~5× faster than Sonnet.

### Session hygiene
- **Run `/compact` after every completed task** — after finishing a SQL query, a Python function, or any discrete unit of work, compact before starting the next one. Do not wait 30–45 minutes; do it after every task.
- **Run `/clear` when switching to an unrelated task** — a fresh session is cheaper than carrying dead context.
- **Run `/status` before starting any large task** — if you are close to the limit, compact or clear first.

### How to prompt efficiently
- Always target a **specific file and function**: `"In flag_risks.py, fix the z_score_flag function"` — never `"review the code"`.
- **Batch related sub-tasks into one message** — instead of 5 separate prompts, send one: `"Write the SQL query, save it to /sql/kpi_metrics.sql, then run it and show the first 10 rows."`
- **Never ask Claude Code to read the whole codebase** — point it at the exact file it needs.
- **Avoid open-ended exploration prompts** — `"what could we improve?"` burns tokens with no guaranteed output. Ask for something specific instead.

### Context window rules
- A single "edit this file" task can consume 50,000–150,000 tokens once context is assembled. Every follow-up grows this further.
- **Never keep a session open across unrelated tasks** — end it, `/clear`, start fresh.
- **Do not re-explain context that is already in this CLAUDE.md** — it is cached. Reference it by section name instead.

### Output discipline
- Do not produce long explanations unless asked — write the code, save the file, give a 2-line summary.
- Do not re-read files you have already read in the same session unless the file has changed.
- Do not run `SELECT *` on large tables — always specify columns and use `TOP 100` for previews.

> **✅ Section Check:** Are you on Sonnet? Will you `/compact` after every task? Are prompts targeting specific files? No open-ended exploration? If yes, proceed.

---

## What NOT to Do

- Do not hardcode customer IDs, loan IDs, or dates — use parameters or config variables.
- Do not leave `print()` debug statements in scripts — use `logging`.
- Do not skip null handling — credit data is messy; always account for missing values.
- Do not flatten all logic into one giant SQL query — use CTEs and views.
- Do not generate synthetic data that is perfectly clean — add realistic noise.
- Do not build the dashboard without first validating the underlying data model.
- Do not use `SELECT *` in production queries — always name columns explicitly.