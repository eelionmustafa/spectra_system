-- =============================================================================
-- SPECTRA — Recommended SQL Server Indexes
-- =============================================================================
-- Run this script ONCE on the [SPECTRA] database to enable index seeks on the
-- most-queried columns. Without these, every dashboard query does a full table
-- scan even on filtered (WHERE) columns.
--
-- Impact per table:
--   DueDaysDaily   — scanned on EVERY page load (dateID, PersonalID filters)
--   RiskPortfolio  — scanned on EVERY page load (CalculationDate filter)
--   TAccounts      — scanned for EWI / overdraft queries (Date, NoAccount)
--   CC_Event_LOG   — scanned for card spend alerts (trans_date, Account)
--   TCredits       — scanned for transaction page (Date filter)
--   AmortizationPlan — scanned for repayment rate (PARTIJA filter)
--
-- All indexes are created with IF NOT EXISTS guards — safe to re-run.
-- =============================================================================

USE [SPECTRA];
GO

-- ---------------------------------------------------------------------------
-- DueDaysDaily
-- ---------------------------------------------------------------------------
-- Most critical: every dashboard query filters WHERE dateID = @latest
-- Secondary: client profile / EWI filters by PersonalID

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[DueDaysDaily]') AND name = 'IX_DueDaysDaily_dateID'
)
    CREATE NONCLUSTERED INDEX IX_DueDaysDaily_dateID
    ON [dbo].[DueDaysDaily] (dateID)
    INCLUDE (PersonalID, CreditAccount, DueDays);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[DueDaysDaily]') AND name = 'IX_DueDaysDaily_PersonalID_dateID'
)
    CREATE NONCLUSTERED INDEX IX_DueDaysDaily_PersonalID_dateID
    ON [dbo].[DueDaysDaily] (PersonalID, dateID)
    INCLUDE (DueDays, CreditAccount);
GO

-- ---------------------------------------------------------------------------
-- RiskPortfolio
-- ---------------------------------------------------------------------------
-- Every portfolio/analytics/client query filters WHERE CalculationDate = @mcd

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[RiskPortfolio]') AND name = 'IX_RiskPortfolio_CalculationDate'
)
    CREATE NONCLUSTERED INDEX IX_RiskPortfolio_CalculationDate
    ON [dbo].[RiskPortfolio] (CalculationDate)
    INCLUDE (clientID, Stage, totalExposure, TypeOfProduct, contractNumber,
             arrangementID, onBalanceExposure, TotalOffBalance, BankCurrentRating,
             CalculatedProvision);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[RiskPortfolio]') AND name = 'IX_RiskPortfolio_clientID_CalcDate'
)
    CREATE NONCLUSTERED INDEX IX_RiskPortfolio_clientID_CalcDate
    ON [dbo].[RiskPortfolio] (clientID, CalculationDate)
    INCLUDE (Stage, totalExposure, TypeOfProduct, contractNumber);
GO

-- ---------------------------------------------------------------------------
-- TAccounts
-- ---------------------------------------------------------------------------
-- EWI salary query scans WHERE ta.Date >= @d60d; overdraft scans by NoAccount

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[TAccounts]') AND name = 'IX_TAccounts_Date'
)
    CREATE NONCLUSTERED INDEX IX_TAccounts_Date
    ON [dbo].[TAccounts] (Date)
    INCLUDE (NoAccount, Amount);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[TAccounts]') AND name = 'IX_TAccounts_NoAccount_Date'
)
    CREATE NONCLUSTERED INDEX IX_TAccounts_NoAccount_Date
    ON [dbo].[TAccounts] (NoAccount, Date)
    INCLUDE (Amount);
GO

-- ---------------------------------------------------------------------------
-- CC_Event_LOG
-- ---------------------------------------------------------------------------
-- Card spend alert query scans WHERE trans_date >= @d3m GROUP BY Account

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[CC_Event_LOG]') AND name = 'IX_CC_Event_LOG_trans_date'
)
    CREATE NONCLUSTERED INDEX IX_CC_Event_LOG_trans_date
    ON [dbo].[CC_Event_LOG] (trans_date)
    INCLUDE (Account, Ammount, EventID, TERMINAL_ID);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[CC_Event_LOG]') AND name = 'IX_CC_Event_LOG_Account_date'
)
    CREATE NONCLUSTERED INDEX IX_CC_Event_LOG_Account_date
    ON [dbo].[CC_Event_LOG] (Account, trans_date)
    INCLUDE (Ammount);
GO

-- ---------------------------------------------------------------------------
-- TCredits
-- ---------------------------------------------------------------------------
-- Transaction page scans WHERE tc.Date >= @dateFrom

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[TCredits]') AND name = 'IX_TCredits_Date'
)
    CREATE NONCLUSTERED INDEX IX_TCredits_Date
    ON [dbo].[TCredits] (Date)
    INCLUDE (CreditAccount, Amount, Kind);
GO

-- ---------------------------------------------------------------------------
-- Credits
-- ---------------------------------------------------------------------------
-- Many queries join Credits ON cr.NoCredit = rp.contractNumber

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[Credits]') AND name = 'IX_Credits_NoCredit'
)
    CREATE NONCLUSTERED INDEX IX_Credits_NoCredit
    ON [dbo].[Credits] (NoCredit)
    INCLUDE (CreditAccount, PersonalID, TypeOfCalculatioin, Amount,
             InstallmentsAmount, FromYear, NoAccount);
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[Credits]') AND name = 'IX_Credits_CreditAccount'
)
    CREATE NONCLUSTERED INDEX IX_Credits_CreditAccount
    ON [dbo].[Credits] (CreditAccount)
    INCLUDE (NoCredit, PersonalID, Amount, TypeOfCalculatioin);
GO

-- ---------------------------------------------------------------------------
-- AmortizationPlan
-- ---------------------------------------------------------------------------
-- Client profile repayment rate scans WHERE PARTIJA = @creditAccount

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[AmortizationPlan]') AND name = 'IX_AmortizationPlan_PARTIJA'
)
    CREATE NONCLUSTERED INDEX IX_AmortizationPlan_PARTIJA
    ON [dbo].[AmortizationPlan] (PARTIJA)
    INCLUDE (OTPLATA, DATUMDOSPECA, ANUITET);
GO

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
-- EWI / overdraft queries join ON ta.NoAccount = a.NoAccount

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[Accounts]') AND name = 'IX_Accounts_PersonalID'
)
    CREATE NONCLUSTERED INDEX IX_Accounts_PersonalID
    ON [dbo].[Accounts] (PersonalID)
    INCLUDE (NoAccount, AccountType, Balance, amountonhold, Currency);
GO

-- ---------------------------------------------------------------------------
-- Customer
-- ---------------------------------------------------------------------------
-- Client profile joins ON cu.PersonalID = rp.clientID

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[Customer]') AND name = 'IX_Customer_PersonalID'
)
    CREATE NONCLUSTERED INDEX IX_Customer_PersonalID
    ON [dbo].[Customer] (PersonalID)
    INCLUDE (name, surname, City, Branch, Gender, DOB, Occupation);
GO

-- ---------------------------------------------------------------------------
-- Cards
-- ---------------------------------------------------------------------------
-- Card spend queries join ON ca.NoCards = cc.Account

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('[dbo].[Cards]') AND name = 'IX_Cards_NoCards'
)
    CREATE NONCLUSTERED INDEX IX_Cards_NoCards
    ON [dbo].[Cards] (NoCards)
    INCLUDE (PersonalID, brand, card_status);
GO

PRINT 'All SPECTRA indexes created (or already existed).';
GO
