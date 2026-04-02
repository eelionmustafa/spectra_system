-- =============================================================================
-- SPECTRA — Foreign Key Constraints Migration
-- Adds referential integrity between all SPECTRA application tables and the
-- source Customer table (Customer.PersonalID).
--
-- IMPORTANT: Run AFTER all DDL scripts (system_tables, ewi_tables, etc.) have
-- been applied and AFTER the Customer table exists.
--
-- Each constraint is wrapped in an existence check — safe to re-run.
-- =============================================================================

USE [SPECTRA];
GO

-- ---------------------------------------------------------------------------
-- SystemActions.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_SystemActions_Customer'
    AND parent_object_id = OBJECT_ID('dbo.SystemActions')
)
BEGIN
  ALTER TABLE [dbo].[SystemActions]
    ADD CONSTRAINT FK_SystemActions_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_SystemActions_Customer';
END
ELSE
  PRINT 'FK already exists: FK_SystemActions_Customer';
GO

-- ---------------------------------------------------------------------------
-- Notifications.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_Notifications_Customer'
    AND parent_object_id = OBJECT_ID('dbo.Notifications')
)
BEGIN
  ALTER TABLE [dbo].[Notifications]
    ADD CONSTRAINT FK_Notifications_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_Notifications_Customer';
END
ELSE
  PRINT 'FK already exists: FK_Notifications_Customer';
GO

-- ---------------------------------------------------------------------------
-- EWIPredictions.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_EWIPredictions_Customer'
    AND parent_object_id = OBJECT_ID('dbo.EWIPredictions')
)
BEGIN
  ALTER TABLE [dbo].[EWIPredictions]
    ADD CONSTRAINT FK_EWIPredictions_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_EWIPredictions_Customer';
END
ELSE
  PRINT 'FK already exists: FK_EWIPredictions_Customer';
GO

-- ---------------------------------------------------------------------------
-- EWIRecommendations.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_EWIRecommendations_Customer'
    AND parent_object_id = OBJECT_ID('dbo.EWIRecommendations')
)
BEGIN
  ALTER TABLE [dbo].[EWIRecommendations]
    ADD CONSTRAINT FK_EWIRecommendations_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_EWIRecommendations_Customer';
END
ELSE
  PRINT 'FK already exists: FK_EWIRecommendations_Customer';
GO

-- ---------------------------------------------------------------------------
-- AlertAcknowledgements.personal_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_AlertAcknowledgements_Customer'
    AND parent_object_id = OBJECT_ID('dbo.AlertAcknowledgements')
)
BEGIN
  ALTER TABLE [dbo].[AlertAcknowledgements]
    ADD CONSTRAINT FK_AlertAcknowledgements_Customer
    FOREIGN KEY (personal_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_AlertAcknowledgements_Customer';
END
ELSE
  PRINT 'FK already exists: FK_AlertAcknowledgements_Customer';
GO

-- ---------------------------------------------------------------------------
-- ECLProvisions.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_ECLProvisions_Customer'
    AND parent_object_id = OBJECT_ID('dbo.ECLProvisions')
)
BEGIN
  ALTER TABLE [dbo].[ECLProvisions]
    ADD CONSTRAINT FK_ECLProvisions_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_ECLProvisions_Customer';
END
ELSE
  PRINT 'FK already exists: FK_ECLProvisions_Customer';
GO

-- ---------------------------------------------------------------------------
-- ClientMonitoring.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_ClientMonitoring_Customer'
    AND parent_object_id = OBJECT_ID('dbo.ClientMonitoring')
)
BEGIN
  ALTER TABLE [dbo].[ClientMonitoring]
    ADD CONSTRAINT FK_ClientMonitoring_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_ClientMonitoring_Customer';
END
ELSE
  PRINT 'FK already exists: FK_ClientMonitoring_Customer';
GO

-- ---------------------------------------------------------------------------
-- DocumentRequests.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_DocumentRequests_Customer'
    AND parent_object_id = OBJECT_ID('dbo.DocumentRequests')
)
BEGIN
  ALTER TABLE [dbo].[DocumentRequests]
    ADD CONSTRAINT FK_DocumentRequests_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_DocumentRequests_Customer';
END
ELSE
  PRINT 'FK already exists: FK_DocumentRequests_Customer';
GO

-- ---------------------------------------------------------------------------
-- CollateralReview.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_CollateralReview_Customer'
    AND parent_object_id = OBJECT_ID('dbo.CollateralReview')
)
BEGIN
  ALTER TABLE [dbo].[CollateralReview]
    ADD CONSTRAINT FK_CollateralReview_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_CollateralReview_Customer';
END
ELSE
  PRINT 'FK already exists: FK_CollateralReview_Customer';
GO

-- ---------------------------------------------------------------------------
-- CreditCommitteeLog.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_CreditCommitteeLog_Customer'
    AND parent_object_id = OBJECT_ID('dbo.CreditCommitteeLog')
)
BEGIN
  ALTER TABLE [dbo].[CreditCommitteeLog]
    ADD CONSTRAINT FK_CreditCommitteeLog_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_CreditCommitteeLog_Customer';
END
ELSE
  PRINT 'FK already exists: FK_CreditCommitteeLog_Customer';
GO

-- ---------------------------------------------------------------------------
-- RestructuringPlans.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_RestructuringPlans_Customer'
    AND parent_object_id = OBJECT_ID('dbo.RestructuringPlans')
)
BEGIN
  ALTER TABLE [dbo].[RestructuringPlans]
    ADD CONSTRAINT FK_RestructuringPlans_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_RestructuringPlans_Customer';
END
ELSE
  PRINT 'FK already exists: FK_RestructuringPlans_Customer';
GO

-- ---------------------------------------------------------------------------
-- RecoveryCases.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_RecoveryCases_Customer'
    AND parent_object_id = OBJECT_ID('dbo.RecoveryCases')
)
BEGIN
  ALTER TABLE [dbo].[RecoveryCases]
    ADD CONSTRAINT FK_RecoveryCases_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_RecoveryCases_Customer';
END
ELSE
  PRINT 'FK already exists: FK_RecoveryCases_Customer';
GO

-- ---------------------------------------------------------------------------
-- WrittenOffClients.client_id → Customer.PersonalID
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'FK_WrittenOffClients_Customer'
    AND parent_object_id = OBJECT_ID('dbo.WrittenOffClients')
)
BEGIN
  ALTER TABLE [dbo].[WrittenOffClients]
    ADD CONSTRAINT FK_WrittenOffClients_Customer
    FOREIGN KEY (client_id) REFERENCES [dbo].[Customer](PersonalID)
    ON DELETE NO ACTION ON UPDATE NO ACTION;
  PRINT 'Created FK: FK_WrittenOffClients_Customer';
END
ELSE
  PRINT 'FK already exists: FK_WrittenOffClients_Customer';
GO

PRINT 'SPECTRA FK constraints migration complete.';
GO
