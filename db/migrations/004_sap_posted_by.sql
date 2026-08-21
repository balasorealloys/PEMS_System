-- Record which PEMS user submitted each SAP posting.
ALTER TABLE pems_sap_posting
  ADD COLUMN posted_by VARCHAR(80) NULL AFTER posted_at;
