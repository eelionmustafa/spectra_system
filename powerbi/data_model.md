# SPECTRA — Power BI Data Model

## Tables and Grain

| Table | Grain | Row count (approx) |
|---|---|---|
| `Customer` | One row per customer (PersonalID) | ~2,000 |
| `Credits` | One row per credit account (CreditAccount) | ~3,500 |
| `Accounts` | One row per bank account (NoAccount) | ~4,000 |
| `DueDaysDaily` | One row per (date, CreditAccount) — daily snapshot | ~500K |
| `RiskPortfolio` | One row per (CalculationDate, arrangementID) — monthly snapshot | ~50K |
| `AmortizationPlan` | One row per scheduled installment (PARTIJA, DATUMDOSPECA) | ~100K |
| `TCredits` | One row per credit transaction | ~200K |
| `TAccounts` | One row per account transaction | ~300K |
| `Cards` | One row per card (NoCards) | ~1,500 |
| `CC_Event_LOG` | One row per card transaction event | ~80K |

## Relationships

```
Customer.PersonalID  (1) ──── (M) Credits.PersonalID
Customer.PersonalID  (1) ──── (M) Accounts.PersonalID
Customer.PersonalID  (1) ──── (M) Cards.PersonalID
Customer.PersonalID  (1) ──── (M) DueDaysDaily.PersonalID
Customer.PersonalID  (1) ──── (M) RiskPortfolio.clientID

Credits.CreditAccount (1) ── (M) AmortizationPlan.PARTIJA
Credits.CreditAccount (1) ── (M) DueDaysDaily.CreditAccount
Credits.CreditAccount (1) ── (M) TCredits.CreditAccount

Accounts.NoAccount   (1) ─── (M) TAccounts.NoAccount

Cards.NoCards        (1) ─── (M) CC_Event_LOG.Account
```

## Import Mode Recommendation

Use **Import mode** for all tables. Pre-filter in SQL before loading into Power BI:
- `DueDaysDaily`: filter to last 24 months only
- `RiskPortfolio`: filter to last 12 monthly snapshots only
- `TCredits` / `TAccounts`: filter to last 6 months only

This keeps the model under 500 MB and ensures fast render times.

## Date Table

Add a `Calendar` table generated in Power Query:

```m
= List.Dates(#date(2020,1,1), 2192, #duration(1,0,0,0))
```

Mark as **Date Table** and relate to:
- `DueDaysDaily[dateID]`
- `RiskPortfolio[CalculationDate]`
- `TCredits[Date]`
- `TAccounts[Date]`

## Slicers to expose in Portfolio Health Dashboard

- `Calendar[Year]`, `Calendar[Month]`
- `Credits[KAMGRUPA]` (product type)
- `Customer[City]` (region)
- `RiskPortfolio[Stage]`
- `RiskPortfolio[BankCurrentRating]`
