-- ============================================================
-- SPECTRA Seed Script — Arben Morina (PersonalID: 193847562)
-- Worst-case client: Stage 3 NPL | DPD = 114 | Exposure €87,426
--
-- Products:
--   Personal Loan  CN/7700442819  €75,000 (84-month annuity, 17 paid)
--   Overdraft      CN/7700558934  €15,000 limit, €14,300 drawn
--   Credit Card    CN/7700601122  €10,000 limit, €9,930 used
--
-- Run against the SPECTRA database (DB_NAME=SPECTRA in .env.local).
-- Execute in SSMS or via sqlcmd:
--   sqlcmd -S localhost -d SPECTRA -E -i seed_arben_morina.sql
--
-- Generated: 2026-03-25
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Guard: abort if client already exists
-- ─────────────────────────────────────────────────────────────
IF EXISTS (SELECT 1 FROM [dbo].[Customer] WHERE PersonalID = '193847562')
BEGIN
    RAISERROR('Client 193847562 already exists. Drop existing rows first or remove this guard.', 16, 1);
    RETURN;
END
GO

-- ============================================================
-- SECTION A: CORE BANKING TABLES
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- A1. Customer
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[Customer]
  (PersonalID, name, surname, City, Branch, DOB, Gender, Occupation,
   Address, Tel, email, Resident, CustomerType, DateOfRegister, Status)
VALUES (
  '193847562', 'Arben', 'Morina', 'Pristina', 'Main',
  '1978-03-15', 'M', 'Construction Worker',
  'Rr. Fehmi Agani 45, Pristina', '+383 44 123 456',
  'filan.fisteku@gmail.com', '1', 'Individual', '2018-05-12', 'Active'
);
GO

-- ─────────────────────────────────────────────────────────────
-- A2. Credits (3 products)
--
-- TypeOfCalculatioin: note intentional double-i (matches DB column)
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[Credits]
  (NoCredit, CreditAccount, NoAccount, PersonalID,
   Amount, InstallmentsAmount, Interes, Period,
   FromYear, ToYear, TypeOfCalculatioin, Currency, STATUS, Branch)
VALUES
  -- Personal Loan: €75,000 | 84 months | 8.5% | monthly annuity €1,188
  ('CN/7700442819', '7700442819', '7700200001', '193847562',
   75000.00, 1188.00, 8.50, 84,
   '2024-06-15', '2031-06-15', 'Annuity', 'EUR', 'Active', 'Main'),
  -- Overdraft: €15,000 limit | 12.5% revolving | matured Jan 2023 (extended)
  ('CN/7700558934', '7700558934', '7700200001', '193847562',
   15000.00, 0.00, 12.50, 12,
   '2022-01-01', '2023-01-01', 'Revolving', 'EUR', 'Active', 'Main'),
  -- Credit Card: €10,000 limit | 18.0% revolving
  ('CN/7700601122', '7700601122', '7700200001', '193847562',
   10000.00, 0.00, 18.00, 12,
   '2021-03-01', '2022-03-01', 'Revolving', 'EUR', 'Active', 'Main');
GO

-- ─────────────────────────────────────────────────────────────
-- A3. Accounts (current account, overdraft drawn)
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[Accounts]
  (NoAccount, PersonalID, AccountType, Balance, amountonhold,
   Currency, OpenDate, Branch, AccountStatus)
VALUES
  ('7700200001', '193847562', 'Current', -14300.00, 0.00,
   'EUR', '2018-05-12', 'Main', 'Active');
GO

-- ─────────────────────────────────────────────────────────────
-- A4. Cards
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[Cards]
  (NoCards, PersonalID, brand, type, kind,
   card_status, production_date, delivery_date)
VALUES
  ('7700601122', '193847562', 'VISA', 'Credit', 'Classic',
   'Active', '2021-03-01', '2021-03-08');
GO

-- ─────────────────────────────────────────────────────────────
-- A5. TAccounts (last 10 account transactions)
--     Shows: salary declining → loan debit → NSF → sporadic cash
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[TAccounts]
  (NoAccount, Kod, Amount, Date, TDescription1)
VALUES
  ('7700200001', 1,  1250.00, '2025-10-25', 'Salary — Ndertimi Kosova shpk'),
  ('7700200001', 2, -1188.00, '2025-10-15', 'Loan installment CN/7700442819'),
  ('7700200001', 2,  -250.00, '2025-10-20', 'ATM cash withdrawal'),
  ('7700200001', 1,   850.00, '2025-11-25', 'Partial salary — Ndertimi Kosova shpk'),
  ('7700200001', 2, -1188.00, '2025-11-15', 'Loan installment CN/7700442819'),
  ('7700200001', 2,  -320.00, '2025-11-28', 'Utility — KEK sh.a'),
  ('7700200001', 2,     0.00, '2025-12-15', 'Loan installment FAILED — insufficient funds'),
  ('7700200001', 1,   650.00, '2026-01-10', 'Cash deposit'),
  ('7700200001', 2,  -200.00, '2026-01-22', 'ATM cash withdrawal'),
  ('7700200001', 1,   400.00, '2026-02-14', 'Cash deposit — partial');
GO

-- ─────────────────────────────────────────────────────────────
-- A6. CC_Event_LOG (last 10 credit card transactions)
--     Note: column is Ammount (double-m — matches DB schema)
-- ─────────────────────────────────────────────────────────────
-- eventno: use large values to avoid collisions with existing rows
INSERT INTO [dbo].[CC_Event_LOG]
  (eventno, Account, EventID, Ammount, trans_date, TERMINAL_ID)
VALUES
  (9900001, '7700601122', 'POS Purchase',    -180.50, '2025-10-03', 'TERM_0041'),
  (9900002, '7700601122', 'POS Purchase',    -320.00, '2025-10-18', 'TERM_0099'),
  (9900003, '7700601122', 'Cash Advance',    -500.00, '2025-11-01', 'ATM_MAIN1'),
  (9900004, '7700601122', 'POS Purchase',    -210.00, '2025-11-14', 'TERM_0041'),
  (9900005, '7700601122', 'Cash Advance',    -400.00, '2025-11-30', 'ATM_MAIN1'),
  (9900006, '7700601122', 'POS Purchase',    -180.00, '2025-12-05', 'TERM_0022'),
  (9900007, '7700601122', 'Min Pmt Missed',     0.00, '2025-12-20', 'SYSTEM'),
  (9900008, '7700601122', 'POS Declined',       0.00, '2026-01-08', 'TERM_0041'),
  (9900009, '7700601122', 'Cash Advance',    -139.50, '2026-01-15', 'ATM_MAIN1'),
  (9900010, '7700601122', 'Over-limit Fee',   -35.00, '2026-02-01', 'SYSTEM');
GO

-- ─────────────────────────────────────────────────────────────
-- A7. TCredits (loan payment history — 17 installments paid)
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[TCredits]
  (CreditAccount, Kod, Amount, Date, Kind)
VALUES
  ('7700442819', 1, 1188.00, '2024-07-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2024-08-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2024-09-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2024-10-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2024-11-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2024-12-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-01-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-02-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-03-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-04-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-05-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-06-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-07-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-08-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-09-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-10-15', 'Installment'),
  ('7700442819', 1, 1188.00, '2025-11-15', 'Installment');
GO

-- ─────────────────────────────────────────────────────────────
-- A8. DueDaysDaily
--     Monthly end-of-period DPD snapshots for all 3 credit accounts.
--     Personal loan: first missed Dec 15, 2025 → DPD 114 on Mar 25, 2026.
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[DueDaysDaily]
  (CreditAccount, PersonalID, DueDays, dateID)
VALUES
  -- ── Personal Loan (CN/7700442819) ──────────────────────────
  ('7700442819', '193847562',   0, '2025-03-31'),
  ('7700442819', '193847562',   0, '2025-04-30'),
  ('7700442819', '193847562',   0, '2025-05-31'),
  ('7700442819', '193847562',   0, '2025-06-30'),
  ('7700442819', '193847562',   0, '2025-07-31'),
  ('7700442819', '193847562',   0, '2025-08-31'),
  ('7700442819', '193847562',   0, '2025-09-30'),
  ('7700442819', '193847562',   0, '2025-10-31'),
  ('7700442819', '193847562',   0, '2025-11-30'),
  ('7700442819', '193847562',  16, '2025-12-31'),   -- Dec 15 due, 16 DPD at month-end
  ('7700442819', '193847562',  47, '2026-01-31'),   -- Jan 31 − Dec 15 = 47 days
  ('7700442819', '193847562',  75, '2026-02-28'),   -- Feb 28 − Dec 15 = 75 days
  ('7700442819', '193847562', 114, '2026-03-25'),   -- TODAY — 114 DPD
  -- ── Overdraft (CN/7700558934) ──────────────────────────────
  ('7700558934', '193847562',   0, '2025-09-30'),
  ('7700558934', '193847562',   0, '2025-10-31'),
  ('7700558934', '193847562',   0, '2025-11-30'),
  ('7700558934', '193847562',   8, '2025-12-31'),
  ('7700558934', '193847562',  39, '2026-01-31'),
  ('7700558934', '193847562',  67, '2026-02-28'),
  ('7700558934', '193847562',  95, '2026-03-25'),
  -- ── Credit Card (CN/7700601122) ────────────────────────────
  ('7700601122', '193847562',   0, '2025-09-30'),
  ('7700601122', '193847562',   0, '2025-10-31'),
  ('7700601122', '193847562',   0, '2025-11-30'),
  ('7700601122', '193847562',  11, '2025-12-31'),
  ('7700601122', '193847562',  42, '2026-01-31'),
  ('7700601122', '193847562',  70, '2026-02-28'),
  ('7700601122', '193847562', 100, '2026-03-25');
GO

-- ─────────────────────────────────────────────────────────────
-- A9. RiskPortfolio
--     13 monthly snapshots × 3 products = 39 rows.
--     Stage progression: 1 (Mar–Oct 2025) → 2 (Nov 2025) → 3 (Dec 2025–Mar 2026)
--     [Effective Interest Rate] column has spaces — use bracket notation.
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[RiskPortfolio]
  (clientID, contractNumber, CalculationDate, Stage, stageDescr,
   totalExposure, onBalanceExposure, TotalOffBalance,
   TypeOfProduct, CalculatedProvision,
   BankCurrentRating, BankPreviousMonthRating,
   [Effective Interest Rate], arrangementID)
VALUES
  -- ── Personal Loan: CN/7700442819 ─────────────────────────────
  -- Stage 1 (performing), exposure declining with each paid installment
  ('193847562','CN/7700442819','2025-03-31',1,'Performing', 68928, 68928,    0,'Personal Loan',  689,'B','B',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2025-04-30',1,'Performing', 68229, 68229,    0,'Personal Loan',  682,'B','B',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2025-05-31',1,'Performing', 67525, 67525,    0,'Personal Loan',  675,'B','B',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2025-06-30',1,'Performing', 66816, 66816,    0,'Personal Loan',  668,'B','B',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2025-07-31',1,'Performing', 66102, 66102,    0,'Personal Loan',  661,'B','B',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2025-08-31',1,'Performing', 65383, 65383,    0,'Personal Loan',  654,'B','B',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2025-09-30',1,'Performing', 64659, 64659,    0,'Personal Loan',  647,'B','B',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2025-10-31',1,'Performing', 63930, 63930,    0,'Personal Loan',  639,'B','B',0.085,'ARR/7700442819'),
  -- Stage 2 (SICR): overdraft maxed, salary dropped, EWI flags triggered
  ('193847562','CN/7700442819','2025-11-30',2,'SICR',       63196, 63196,    0,'Personal Loan', 3160,'C','B',0.085,'ARR/7700442819'),
  -- Stage 3 (NPL): first installment missed Dec 15 2025
  ('193847562','CN/7700442819','2025-12-31',3,'Non-Performing',63196,63196,  0,'Personal Loan',12639,'D','C',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2026-01-31',3,'Non-Performing',63196,63196,  0,'Personal Loan',12639,'D','D',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2026-02-28',3,'Non-Performing',63196,63196,  0,'Personal Loan',12639,'D','D',0.085,'ARR/7700442819'),
  ('193847562','CN/7700442819','2026-03-25',3,'Non-Performing',63196,63196,  0,'Personal Loan',12639,'D','D',0.085,'ARR/7700442819'),

  -- ── Overdraft: CN/7700558934 ─────────────────────────────────
  ('193847562','CN/7700558934','2025-03-31',1,'Performing',  8000,  8000,    0,'Overdraft',       80,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-04-30',1,'Performing',  9000,  9000,    0,'Overdraft',       90,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-05-31',1,'Performing', 10000, 10000,    0,'Overdraft',      100,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-06-30',1,'Performing', 11500, 11500,    0,'Overdraft',      115,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-07-31',1,'Performing', 12500, 12500,    0,'Overdraft',      125,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-08-31',1,'Performing', 13000, 13000,    0,'Overdraft',      130,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-09-30',1,'Performing', 13500, 13500,    0,'Overdraft',      135,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-10-31',1,'Performing', 14000, 14000,    0,'Overdraft',      140,'B','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-11-30',2,'SICR',       14300, 14300,    0,'Overdraft',      715,'C','B',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2025-12-31',3,'Non-Performing',14300,14300,  0,'Overdraft',     2860,'D','C',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2026-01-31',3,'Non-Performing',14300,14300,  0,'Overdraft',     2860,'D','D',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2026-02-28',3,'Non-Performing',14300,14300,  0,'Overdraft',     2860,'D','D',0.125,'ARR/7700558934'),
  ('193847562','CN/7700558934','2026-03-25',3,'Non-Performing',14300,14300,  0,'Overdraft',     2860,'D','D',0.125,'ARR/7700558934'),

  -- ── Credit Card: CN/7700601122 ───────────────────────────────
  ('193847562','CN/7700601122','2025-03-31',1,'Performing',  5200,  5200,    0,'Credit Card',     52,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-04-30',1,'Performing',  6000,  6000,    0,'Credit Card',     60,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-05-31',1,'Performing',  6800,  6800,    0,'Credit Card',     68,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-06-30',1,'Performing',  7500,  7500,    0,'Credit Card',     75,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-07-31',1,'Performing',  8000,  8000,    0,'Credit Card',     80,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-08-31',1,'Performing',  8400,  8400,    0,'Credit Card',     84,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-09-30',1,'Performing',  8900,  8900,    0,'Credit Card',     89,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-10-31',1,'Performing',  9300,  9300,    0,'Credit Card',     93,'B','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-11-30',2,'SICR',        9930,  9930,    0,'Credit Card',    497,'C','B',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2025-12-31',3,'Non-Performing', 9930,9930,   0,'Credit Card',   1986,'D','C',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2026-01-31',3,'Non-Performing', 9930,9930,   0,'Credit Card',   1986,'D','D',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2026-02-28',3,'Non-Performing', 9930,9930,   0,'Credit Card',   1986,'D','D',0.180,'ARR/7700601122'),
  ('193847562','CN/7700601122','2026-03-25',3,'Non-Performing', 9930,9930,   0,'Credit Card',   1986,'D','D',0.180,'ARR/7700601122');
GO

-- ─────────────────────────────────────────────────────────────
-- A10. AmortizationPlan — Personal Loan CN/7700442819
--      84 installments: 2024-07-15 to 2031-06-15
--      Loan: €75,000 | 8.5% p.a. | 84 months | PMT = €1,188/month
--      Rows 1–17:  PAID   (Jul 2024 – Nov 2025)
--      Rows 18–20: OVERDUE (Dec 2025 – Feb 2026)
--      Rows 21–84: FUTURE  (Mar 2026 – Jun 2031)
--
--  PARTIJA = CreditAccount
--  OTPLATA = actual amount paid (0 if unpaid)
--  ZADOLZENO = scheduled remaining balance after this installment
-- ─────────────────────────────────────────────────────────────
INSERT INTO [dbo].[AmortizationPlan]
  (PARTIJA, RB, DATUMDOSPECA, ANUITET, IZNOS, KAMATA, OTPLATA, ZADOLZENO, InsuranceAmount)
VALUES
  -- ── Paid installments (rows 1–17) ────────────────────────────
  ('7700442819', 1, '2024-07-15', 1188, 657, 531, 1188, 74343, 15.00),
  ('7700442819', 2, '2024-08-15', 1188, 661, 527, 1188, 73682, 15.00),
  ('7700442819', 3, '2024-09-15', 1188, 666, 522, 1188, 73016, 15.00),
  ('7700442819', 4, '2024-10-15', 1188, 671, 517, 1188, 72345, 15.00),
  ('7700442819', 5, '2024-11-15', 1188, 676, 512, 1188, 71669, 15.00),
  ('7700442819', 6, '2024-12-15', 1188, 680, 508, 1188, 70989, 15.00),
  ('7700442819', 7, '2025-01-15', 1188, 685, 503, 1188, 70304, 15.00),
  ('7700442819', 8, '2025-02-15', 1188, 690, 498, 1188, 69614, 15.00),
  ('7700442819', 9, '2025-03-15', 1188, 695, 493, 1188, 68919, 15.00),
  ('7700442819',10, '2025-04-15', 1188, 700, 488, 1188, 68219, 15.00),
  ('7700442819',11, '2025-05-15', 1188, 705, 483, 1188, 67514, 15.00),
  ('7700442819',12, '2025-06-15', 1188, 710, 478, 1188, 66804, 15.00),
  ('7700442819',13, '2025-07-15', 1188, 715, 473, 1188, 66089, 15.00),
  ('7700442819',14, '2025-08-15', 1188, 720, 468, 1188, 65369, 15.00),
  ('7700442819',15, '2025-09-15', 1188, 725, 463, 1188, 64644, 15.00),
  ('7700442819',16, '2025-10-15', 1188, 730, 458, 1188, 63914, 15.00),
  ('7700442819',17, '2025-11-15', 1188, 735, 453, 1188, 63179, 15.00),
  -- ── OVERDUE installments (rows 18–20) ────────────────────────
  ('7700442819',18, '2025-12-15', 1188, 740, 448,    0, 62439, 15.00),
  ('7700442819',19, '2026-01-15', 1188, 746, 442,    0, 61693, 15.00),
  ('7700442819',20, '2026-02-15', 1188, 751, 437,    0, 60942, 15.00),
  -- ── Future installments (rows 21–84) ─────────────────────────
  ('7700442819',21, '2026-03-15', 1188, 756, 432,    0, 60186, 15.00),
  ('7700442819',22, '2026-04-15', 1188, 762, 426,    0, 59424, 15.00),
  ('7700442819',23, '2026-05-15', 1188, 767, 421,    0, 58657, 15.00),
  ('7700442819',24, '2026-06-15', 1188, 773, 415,    0, 57884, 15.00),
  ('7700442819',25, '2026-07-15', 1188, 778, 410,    0, 57106, 15.00),
  ('7700442819',26, '2026-08-15', 1188, 784, 404,    0, 56322, 15.00),
  ('7700442819',27, '2026-09-15', 1188, 789, 399,    0, 55533, 15.00),
  ('7700442819',28, '2026-10-15', 1188, 795, 393,    0, 54738, 15.00),
  ('7700442819',29, '2026-11-15', 1188, 800, 388,    0, 53938, 15.00),
  ('7700442819',30, '2026-12-15', 1188, 806, 382,    0, 53132, 15.00),
  ('7700442819',31, '2027-01-15', 1188, 812, 376,    0, 52320, 15.00),
  ('7700442819',32, '2027-02-15', 1188, 817, 371,    0, 51503, 15.00),
  ('7700442819',33, '2027-03-15', 1188, 823, 365,    0, 50680, 15.00),
  ('7700442819',34, '2027-04-15', 1188, 829, 359,    0, 49851, 15.00),
  ('7700442819',35, '2027-05-15', 1188, 835, 353,    0, 49016, 15.00),
  ('7700442819',36, '2027-06-15', 1188, 841, 347,    0, 48175, 15.00),
  ('7700442819',37, '2027-07-15', 1188, 847, 341,    0, 47328, 15.00),
  ('7700442819',38, '2027-08-15', 1188, 853, 335,    0, 46475, 15.00),
  ('7700442819',39, '2027-09-15', 1188, 859, 329,    0, 45616, 15.00),
  ('7700442819',40, '2027-10-15', 1188, 865, 323,    0, 44751, 15.00),
  ('7700442819',41, '2027-11-15', 1188, 871, 317,    0, 43880, 15.00),
  ('7700442819',42, '2027-12-15', 1188, 877, 311,    0, 43003, 15.00),
  ('7700442819',43, '2028-01-15', 1188, 883, 305,    0, 42120, 15.00),
  ('7700442819',44, '2028-02-15', 1188, 890, 298,    0, 41230, 15.00),
  ('7700442819',45, '2028-03-15', 1188, 896, 292,    0, 40334, 15.00),
  ('7700442819',46, '2028-04-15', 1188, 902, 286,    0, 39432, 15.00),
  ('7700442819',47, '2028-05-15', 1188, 909, 279,    0, 38523, 15.00),
  ('7700442819',48, '2028-06-15', 1188, 915, 273,    0, 37608, 15.00),
  ('7700442819',49, '2028-07-15', 1188, 922, 266,    0, 36686, 15.00),
  ('7700442819',50, '2028-08-15', 1188, 928, 260,    0, 35758, 15.00),
  ('7700442819',51, '2028-09-15', 1188, 935, 253,    0, 34823, 15.00),
  ('7700442819',52, '2028-10-15', 1188, 941, 247,    0, 33882, 15.00),
  ('7700442819',53, '2028-11-15', 1188, 948, 240,    0, 32934, 15.00),
  ('7700442819',54, '2028-12-15', 1188, 955, 233,    0, 31979, 15.00),
  ('7700442819',55, '2029-01-15', 1188, 961, 227,    0, 31018, 15.00),
  ('7700442819',56, '2029-02-15', 1188, 968, 220,    0, 30050, 15.00),
  ('7700442819',57, '2029-03-15', 1188, 975, 213,    0, 29075, 15.00),
  ('7700442819',58, '2029-04-15', 1188, 982, 206,    0, 28093, 15.00),
  ('7700442819',59, '2029-05-15', 1188, 989, 199,    0, 27104, 15.00),
  ('7700442819',60, '2029-06-15', 1188, 996, 192,    0, 26108, 15.00),
  ('7700442819',61, '2029-07-15', 1188,1003, 185,    0, 25105, 15.00),
  ('7700442819',62, '2029-08-15', 1188,1010, 178,    0, 24095, 15.00),
  ('7700442819',63, '2029-09-15', 1188,1017, 171,    0, 23078, 15.00),
  ('7700442819',64, '2029-10-15', 1188,1024, 164,    0, 22054, 15.00),
  ('7700442819',65, '2029-11-15', 1188,1032, 156,    0, 21022, 15.00),
  ('7700442819',66, '2029-12-15', 1188,1039, 149,    0, 19983, 15.00),
  ('7700442819',67, '2030-01-15', 1188,1046, 142,    0, 18937, 15.00),
  ('7700442819',68, '2030-02-15', 1188,1054, 134,    0, 17883, 15.00),
  ('7700442819',69, '2030-03-15', 1188,1061, 127,    0, 16822, 15.00),
  ('7700442819',70, '2030-04-15', 1188,1069, 119,    0, 15753, 15.00),
  ('7700442819',71, '2030-05-15', 1188,1076, 112,    0, 14677, 15.00),
  ('7700442819',72, '2030-06-15', 1188,1084, 104,    0, 13593, 15.00),
  ('7700442819',73, '2030-07-15', 1188,1092,  96,    0, 12501, 15.00),
  ('7700442819',74, '2030-08-15', 1188,1099,  89,    0, 11402, 15.00),
  ('7700442819',75, '2030-09-15', 1188,1107,  81,    0, 10295, 15.00),
  ('7700442819',76, '2030-10-15', 1188,1115,  73,    0,  9180, 15.00),
  ('7700442819',77, '2030-11-15', 1188,1123,  65,    0,  8057, 15.00),
  ('7700442819',78, '2030-12-15', 1188,1131,  57,    0,  6926, 15.00),
  ('7700442819',79, '2031-01-15', 1188,1139,  49,    0,  5787, 15.00),
  ('7700442819',80, '2031-02-15', 1188,1147,  41,    0,  4640, 15.00),
  ('7700442819',81, '2031-03-15', 1188,1155,  33,    0,  3485, 15.00),
  ('7700442819',82, '2031-04-15', 1188,1163,  25,    0,  2322, 15.00),
  ('7700442819',83, '2031-05-15', 1188,1172,  16,    0,  1150, 15.00),
  ('7700442819',84, '2031-06-15', 1158,1150,   8,    0,     0, 15.00);
  -- Row 84: adjusted annuity (1158) to zero out remaining balance
GO


-- ============================================================
-- SECTION B: SPECTRA-OWNED TABLES (DDL-on-first-use + seed data)
-- All in [SPECTRA].[dbo].*
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- B1. FrozenLimits — active freeze since Jan 2026
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='FrozenLimits' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[FrozenLimits] (
  id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id    NVARCHAR(50)     NOT NULL,
  frozen_by    NVARCHAR(100)    NOT NULL,
  reason       NVARCHAR(MAX)    NULL,
  frozen_at    DATETIME         NOT NULL DEFAULT GETDATE(),
  unfrozen_at  DATETIME         NULL,
  unfrozen_by  NVARCHAR(100)    NULL,
  active       BIT              NOT NULL DEFAULT 1
);
GO

INSERT INTO [SPECTRA].[dbo].[FrozenLimits]
  (client_id, frozen_by, reason, frozen_at, active)
VALUES (
  '193847562',
  'risk_officer1',
  'Stage 3 NPL confirmed. DPD=47 at time of freeze. All new disbursements blocked pending Credit Committee review. Client failed to appear for Nov meeting.',
  '2026-01-08 09:15:00',
  1
);
GO

-- ─────────────────────────────────────────────────────────────
-- B2. ClientActions — audit trail of actions taken
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='ClientActions' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[ClientActions] (
  id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  clientId    NVARCHAR(50)     NOT NULL,
  action      NVARCHAR(100)    NOT NULL,
  status      NVARCHAR(20)     NOT NULL DEFAULT 'active',
  actionedBy  NVARCHAR(100)    NULL,
  notes       NVARCHAR(MAX)    NULL,
  metadata    NVARCHAR(MAX)    NULL,
  createdAt   DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[ClientActions]
  (clientId, action, status, actionedBy, notes, metadata, createdAt)
VALUES
  ('193847562', 'EWI Flag: Overdraft >90% Utilized',
   'completed', 'SYSTEM',
   'Overdraft utilization reached 95.3% (€14,300 / €15,000). Combined with 2 consecutive months of declining salary receipts.',
   '{"ewi_type":"overdraft_utilization","value":0.953,"threshold":0.90}',
   '2025-10-31 02:00:00'),

  ('193847562', 'EWI Flag: Salary Reduction Detected',
   'completed', 'SYSTEM',
   'Salary credit decreased from €1,250 (Oct) to €850 (Nov) — 32% reduction. Employer: Ndertimi Kosova shpk.',
   '{"ewi_type":"salary_reduction","prev_salary":1250,"curr_salary":850,"pct_change":-0.32}',
   '2025-11-30 02:00:00'),

  ('193847562', 'Stage Migration: Stage 1 → Stage 2 (SICR)',
   'completed', 'SYSTEM',
   'SICR triggered: PD threshold breached + overdraft EWI. Client moved to Lifetime ECL provisioning.',
   '{"old_stage":1,"new_stage":2,"trigger":"EWI+PD","ecl_rate":0.05}',
   '2025-11-30 08:00:00'),

  ('193847562', 'Restructuring Proposed: Payment Holiday',
   'completed', 'risk_officer1',
   '3-month payment holiday on personal loan proposed due to employer difficulties. Submitted to Credit Committee.',
   '{"plan_type":"PaymentHoliday","holiday_months":3,"credit_id":"CN/7700442819"}',
   '2025-11-18 11:30:00'),

  ('193847562', 'Restructuring Rejected',
   'completed', 'admin1',
   'Payment holiday rejected. Client''s financial position deemed insufficient for restructuring approval without collateral. Escalated to recovery pathway.',
   '{"plan_type":"PaymentHoliday","decision":"Rejected"}',
   '2025-12-05 14:00:00'),

  ('193847562', 'Stage Migration: Stage 2 → Stage 3 (NPL)',
   'completed', 'SYSTEM',
   'DPD=16 on 2025-12-31. NPL threshold breached (DPD ≥ 30 backstop imminent). Stage 3 effective December 2025.',
   '{"old_stage":2,"new_stage":3,"trigger":"DPD_threshold","dpd":16,"ecl_rate":0.20}',
   '2025-12-31 02:00:00'),

  ('193847562', 'Freeze Applied',
   'active', 'risk_officer1',
   'All disbursements frozen. Client confirmed non-contactable. Employer reports redundancy.',
   '{"freeze_id":"auto","reason":"NPL_stage3"}',
   '2026-01-08 09:15:00'),

  ('193847562', 'Escalated to Credit Committee',
   'active', 'risk_officer1',
   'Formal escalation for WriteOff/LegalAction decision. Total exposure €87,426. No collateral on record.',
   '{"committee_decision":"Pending","total_exposure":87426}',
   '2026-01-08 09:30:00'),

  ('193847562', 'Recovery Case Initiated: Debt Collection',
   'active', 'risk_officer1',
   'Debt collection letter issued. 30-day cure period started. Assigned to external collection team.',
   '{"stage":"DebtCollection","assigned_to":"collection_team","cure_deadline":"2026-02-08"}',
   '2026-01-08 10:00:00'),

  ('193847562', 'Credit Committee Decision: Write-Off',
   'active', 'admin1',
   'Credit Committee voted Write-Off on 2026-03-15. Legal proceedings to follow pending final asset check.',
   '{"decision":"WriteOff","decided_by":"admin1","decision_date":"2026-03-15"}',
   '2026-03-15 16:00:00');
GO

-- ─────────────────────────────────────────────────────────────
-- B3. SystemActions — automated stage-change audit log
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='SystemActions' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[SystemActions] (
  id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id       NVARCHAR(50)     NOT NULL,
  credit_id       NVARCHAR(50)     NULL,
  event_type      NVARCHAR(50)     NOT NULL,
  old_stage       INT              NULL,
  new_stage       INT              NULL,
  old_risk_score  FLOAT            NULL,
  new_risk_score  FLOAT            NULL,
  trigger_reason  NVARCHAR(MAX)    NULL,
  performed_by    NVARCHAR(100)    NOT NULL DEFAULT 'SYSTEM',
  created_at      DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[SystemActions]
  (client_id, credit_id, event_type, old_stage, new_stage,
   old_risk_score, new_risk_score, trigger_reason, performed_by, created_at)
VALUES
  ('193847562', 'CN/7700442819', 'stage_migration', 1, 2,
   38.5, 61.2,
   'SICR: PD threshold 24.7% (>20%). EWI flags: overdraft_utilization, salary_reduction. Stage 2 effective 2025-11-30.',
   'SYSTEM', '2025-11-30 08:00:00'),

  ('193847562', 'CN/7700442819', 'stage_migration', 2, 3,
   61.2, 84.7,
   'DPD backstop: loan installment missed 2025-12-15. DPD=16 at month-end. NPL threshold confirmed. Stage 3 effective 2025-12-31.',
   'SYSTEM', '2025-12-31 02:00:00'),

  ('193847562', NULL, 'ecl_provision', NULL, NULL,
   NULL, NULL,
   'ECL Stage 3 provision recorded: €17,485 (20% × €87,426). IFRS 9 Lifetime ECL.',
   'SYSTEM', '2025-12-31 02:05:00');
GO

-- ─────────────────────────────────────────────────────────────
-- B4. Notifications
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='Notifications' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[Notifications] (
  id                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id         NVARCHAR(50)     NOT NULL,
  credit_id         NVARCHAR(50)     NULL,
  notification_type NVARCHAR(50)     NOT NULL,
  priority          NVARCHAR(20)     NOT NULL DEFAULT 'medium',
  title             NVARCHAR(200)    NOT NULL,
  message           NVARCHAR(MAX)    NOT NULL,
  assigned_rm       NVARCHAR(100)    NULL,
  created_at        DATETIME         NOT NULL DEFAULT GETDATE(),
  read_at           DATETIME         NULL
);
GO

INSERT INTO [SPECTRA].[dbo].[Notifications]
  (client_id, credit_id, notification_type, priority, title, message, assigned_rm, created_at)
VALUES
  ('193847562', NULL, 'risk_escalation', 'high',
   'SICR Detected — Stage 2 Migration',
   'Client 193847562 (Arben Morina) has been migrated to Stage 2 (SICR). Triggers: PD=24.7%, overdraft utilization 95.3%, salary reduction 32%. Immediate RM review required.',
   'risk_officer1', '2025-11-30 08:00:00'),

  ('193847562', 'CN/7700442819', 'risk_escalation', 'critical',
   'NPL Confirmed — Stage 3 Migration',
   'Client 193847562 (Arben Morina) has crossed into Stage 3 (Non-Performing). First installment missed: 2025-12-15. DPD=16 at month-end. Total exposure €87,426. ECL provision €17,485 raised. Escalate to Credit Committee immediately.',
   'risk_officer1', '2025-12-31 02:00:00'),

  ('193847562', NULL, 'risk_escalation', 'critical',
   'Recovery Case Opened — Debt Collection',
   'Recovery case initiated for client 193847562 (Arben Morina). Stage: Debt Collection. Assigned to: collection_team. Client confirmed redundant from employer Ndertimi Kosova shpk. 30-day cure window expires 2026-02-08.',
   'risk_officer1', '2026-01-08 10:00:00'),

  ('193847562', NULL, 'risk_escalation', 'critical',
   'Credit Committee: Write-Off Decision',
   'Credit Committee voted to Write-Off client 193847562 (Arben Morina) on 2026-03-15. Decision by admin1. Total exposure €87,426. Legal proceedings pending final asset assessment.',
   'admin1', '2026-03-15 16:00:00');
GO

-- ─────────────────────────────────────────────────────────────
-- B5. CreditCommitteeLog
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='CreditCommitteeLog' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[CreditCommitteeLog] (
  id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id      NVARCHAR(50)     NOT NULL,
  credit_id      NVARCHAR(50)     NULL,
  escalated_by   NVARCHAR(100)    NOT NULL,
  escalated_at   DATETIME         NOT NULL DEFAULT GETDATE(),
  decision       NVARCHAR(30)     NOT NULL DEFAULT 'Pending',
  decision_date  DATE             NULL,
  decided_by     NVARCHAR(100)    NULL,
  notes          NVARCHAR(MAX)    NULL,
  updated_at     DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[CreditCommitteeLog]
  (client_id, credit_id, escalated_by, escalated_at,
   decision, decision_date, decided_by, notes, updated_at)
VALUES (
  '193847562', NULL, 'risk_officer1',
  '2026-01-08 09:30:00',
  'WriteOff',
  '2026-03-15',
  'admin1',
  'Client declared redundant. No collateral. All three credit facilities in default. DPD=114 as of 2026-03-25. Recovery (Debt Collection) active. Committee voted unanimous Write-Off. Legal proceedings initiated for remaining balance recovery.',
  '2026-03-15 16:00:00'
);
GO

-- ─────────────────────────────────────────────────────────────
-- B6. RestructuringPlans — proposed Nov 2025, rejected Dec 2025
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='RestructuringPlans' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[RestructuringPlans] (
  id                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id               NVARCHAR(50)     NOT NULL,
  credit_id               NVARCHAR(50)     NULL,
  type                    NVARCHAR(50)     NOT NULL,
  new_maturity_date       DATE             NULL,
  holiday_duration_months INT              NULL,
  new_interest_rate       FLOAT            NULL,
  forgiven_amount         FLOAT            NULL,
  status                  NVARCHAR(20)     NOT NULL DEFAULT 'Proposed',
  approved_by             NVARCHAR(100)    NULL,
  approved_at             DATETIME         NULL,
  notes                   NVARCHAR(MAX)    NULL,
  created_by              NVARCHAR(100)    NOT NULL,
  created_at              DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at              DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[RestructuringPlans]
  (client_id, credit_id, type,
   holiday_duration_months, status,
   approved_by, approved_at, notes, created_by, created_at, updated_at)
VALUES (
  '193847562', 'CN/7700442819', 'PaymentHoliday',
  3, 'Rejected',
  'admin1', '2025-12-05 14:00:00',
  'PROPOSED (2025-11-18): 3-month payment holiday on personal loan due to employer difficulties at Ndertimi Kosova shpk. RM assessment: temporary hardship, likely to self-cure. REJECTED (2025-12-05): Credit Committee declined — client''s income insufficient for post-holiday resumption. No collateral. Escalated to recovery pathway instead.',
  'risk_officer1', '2025-11-18 11:30:00', '2025-12-05 14:00:00'
);
GO

-- ─────────────────────────────────────────────────────────────
-- B7. RecoveryCases — debt collection opened Jan 2026
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='RecoveryCases' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[RecoveryCases] (
  id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id    NVARCHAR(50)     NOT NULL,
  credit_id    NVARCHAR(50)     NULL,
  stage        NVARCHAR(30)     NOT NULL,
  assigned_to  NVARCHAR(100)    NULL,
  status       NVARCHAR(20)     NOT NULL DEFAULT 'Open',
  notes        NVARCHAR(MAX)    NULL,
  opened_at    DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at   DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[RecoveryCases]
  (client_id, credit_id, stage, assigned_to, status, notes, opened_at, updated_at)
VALUES (
  '193847562', NULL, 'DebtCollection', 'collection_team', 'Open',
  'Formal demand letter issued 2026-01-08. 30-day cure window expired 2026-02-08 with no response or payment. Client confirmed redundant from Ndertimi Kosova shpk (employer letter received 2026-01-20). No assets or collateral on record. Case escalated to Credit Committee 2026-01-08; Write-Off decision issued 2026-03-15. Next step: LegalProceedings.',
  '2026-01-08 10:00:00', '2026-03-15 16:00:00'
);
GO

-- ─────────────────────────────────────────────────────────────
-- B8. ECLProvisions — three provision snapshots (one per stage)
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='ECLProvisions' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[ECLProvisions] (
  id                   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id            NVARCHAR(50)     NOT NULL,
  credit_id            NVARCHAR(50)     NULL,
  stage                INT              NOT NULL,
  ecl_type             NVARCHAR(20)     NOT NULL,
  outstanding_balance  FLOAT            NOT NULL,
  provision_rate       FLOAT            NOT NULL,
  provision_amount     FLOAT            NOT NULL,
  calculated_at        DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[ECLProvisions]
  (client_id, credit_id, stage, ecl_type,
   outstanding_balance, provision_rate, provision_amount, calculated_at)
VALUES
  -- Stage 1 snapshot (Oct 2025 — last Stage 1 month)
  -- Total exposure: 63930 + 14000 + 9300 = 87,230
  ('193847562', NULL, 1, '12Month',  87230, 0.01,  872.30, '2025-10-31 02:00:00'),
  -- Stage 2 snapshot (Nov 2025 — SICR migration)
  -- Total exposure: 63196 + 14300 + 9930 = 87,426
  ('193847562', NULL, 2, 'Lifetime', 87426, 0.05, 4371.30, '2025-11-30 08:00:00'),
  -- Stage 3 snapshot (Dec 2025 — NPL confirmed)
  ('193847562', NULL, 3, 'Lifetime', 87426, 0.20,17485.20, '2025-12-31 02:05:00');
GO

-- ─────────────────────────────────────────────────────────────
-- B9. ClientEngagements — 3 RM interactions logged
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='ClientEngagements' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[ClientEngagements] (
  id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id    NVARCHAR(50)     NOT NULL,
  credit_id    NVARCHAR(50)     NULL,
  type         NVARCHAR(20)     NOT NULL,   -- 'call' | 'meeting'
  scheduled_at DATETIME         NOT NULL,
  status       NVARCHAR(20)     NOT NULL DEFAULT 'scheduled',
  outcome      NVARCHAR(50)     NULL,
  notes        NVARCHAR(MAX)    NULL,
  logged_by    NVARCHAR(100)    NOT NULL,
  created_at   DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at   DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[ClientEngagements]
  (client_id, credit_id, type, scheduled_at, status, outcome, notes, logged_by, created_at, updated_at)
VALUES
  -- Oct 2025: RM meeting — rising overdraft discussed
  ('193847562', 'CN/7700558934', 'meeting',
   '2025-10-22 10:00:00', 'completed', 'Completed',
   'Client attended. Discussed overdraft utilization (95%). Client cited reduced hours at employer. Agreed to reduce discretionary spend. No payment plan formalized. RM flagged for EWI monitoring.',
   'risk_officer1', '2025-10-20 09:00:00', '2025-10-22 11:30:00'),

  -- Nov 2025: Call — payment arrangement discussion
  ('193847562', 'CN/7700442819', 'call',
   '2025-11-12 14:00:00', 'completed', 'Completed',
   'Client confirmed salary reduced to €850 (from €1,250). Partial payment difficulty for December installment anticipated. Proposed restructuring (payment holiday) discussed — client agreed to apply. RM submitted restructuring request.',
   'risk_officer1', '2025-11-12 09:00:00', '2025-11-12 15:00:00'),

  -- Jan 2026: Meeting — client no-show after NPL
  ('193847562', NULL, 'meeting',
   '2026-01-15 11:00:00', 'cancelled', 'No Show',
   'Urgent review meeting scheduled following Stage 3 migration and freeze. Client failed to appear. No contact via phone (+383 44 123 456) — number rings out. Employer confirms redundancy effective 2026-01-01. Case escalated to recovery.',
   'risk_officer1', '2026-01-08 09:30:00', '2026-01-15 11:30:00');
GO

-- ─────────────────────────────────────────────────────────────
-- B10. DocumentRequests — outstanding income docs
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name='DocumentRequests' AND schema_id=SCHEMA_ID('dbo')
)
CREATE TABLE [SPECTRA].[dbo].[DocumentRequests] (
  id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  client_id      NVARCHAR(50)     NOT NULL,
  credit_id      NVARCHAR(50)     NULL,
  requested_docs NVARCHAR(MAX)    NOT NULL,
  requested_by   NVARCHAR(100)    NOT NULL,
  due_date       DATE             NULL,
  status         NVARCHAR(20)     NOT NULL DEFAULT 'Pending',
  notes          NVARCHAR(MAX)    NULL,
  fulfilled_at   DATETIME         NULL,
  created_at     DATETIME         NOT NULL DEFAULT GETDATE(),
  updated_at     DATETIME         NOT NULL DEFAULT GETDATE()
);
GO

INSERT INTO [SPECTRA].[dbo].[DocumentRequests]
  (client_id, credit_id, requested_docs, requested_by,
   due_date, status, notes, created_at, updated_at)
VALUES (
  '193847562', NULL,
  '["Pay Slips (last 3 months)","Employer Confirmation Letter","Bank Statements (6 months)","Proof of Residence"]',
  'risk_officer1',
  '2026-01-22',
  'Overdue',
  'Documents requested as part of Stage 3 review and restructuring assessment. Client failed to provide by due date 2026-01-22. Employer subsequently confirmed redundancy — pay slips no longer obtainable. Case closed to recovery.',
  '2026-01-08 09:45:00', '2026-01-23 08:00:00'
);
GO

-- ============================================================
-- DONE — Arben Morina (193847562) fully seeded.
-- Summary:
--   Customer record:        1 row
--   Credits:                3 rows (loan, OD, CC)
--   Accounts:               1 row
--   Cards:                  1 row
--   TAccounts:             10 rows
--   CC_Event_LOG:          10 rows
--   TCredits:              17 rows (paid installments)
--   DueDaysDaily:          27 rows (3 products × monthly snapshots)
--   RiskPortfolio:         39 rows (3 products × 13 months)
--   AmortizationPlan:      84 rows (full 7-year schedule)
--   FrozenLimits:           1 row (active)
--   ClientActions:         10 rows
--   SystemActions:          3 rows
--   Notifications:          4 rows
--   CreditCommitteeLog:     1 row (WriteOff decision)
--   RestructuringPlans:     1 row (rejected)
--   RecoveryCases:          1 row (open)
--   ECLProvisions:          3 rows (Stage 1/2/3 snapshots)
--   ClientEngagements:      3 rows
--   DocumentRequests:       1 row (overdue)
-- ============================================================
