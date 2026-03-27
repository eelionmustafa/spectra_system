-- =============================================================================
-- SPECTRA — AlertAcknowledgements Table
-- =============================================================================
-- Run once on the [SPECTRA] database to migrate alert acks off the file system.
-- =============================================================================

USE [SPECTRA];
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE object_id = OBJECT_ID('[dbo].[AlertAcknowledgements]')
)
BEGIN
    CREATE TABLE [dbo].[AlertAcknowledgements] (
        [id]                INT IDENTITY(1,1) PRIMARY KEY,
        [credit_id]         NVARCHAR(100)  NOT NULL,
        [personal_id]       NVARCHAR(100)  NOT NULL,
        [action]            NVARCHAR(20)   NOT NULL  CHECK ([action] IN ('reviewed', 'actioned', 'false_positive')),
        [note]              NVARCHAR(1000) NOT NULL  DEFAULT '',
        [acknowledged_by]   NVARCHAR(100)  NOT NULL,
        [acknowledged_at]   DATETIME2      NOT NULL  DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_AlertAcks_credit_id ON [dbo].[AlertAcknowledgements] (credit_id);
    CREATE NONCLUSTERED INDEX IX_AlertAcks_personal_id ON [dbo].[AlertAcknowledgements] (personal_id);
    PRINT 'AlertAcknowledgements table created.';
END
ELSE
    PRINT 'AlertAcknowledgements table already exists.';
GO
