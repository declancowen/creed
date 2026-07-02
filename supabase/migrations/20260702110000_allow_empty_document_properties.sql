-- Document dashboard properties are optional. Keep existing values as-is, but
-- allow new and edited documents to clear each property to null.

alter table public.creed_documents
  alter column document_type drop not null,
  alter column document_type drop default,
  alter column stage drop not null,
  alter column stage drop default,
  alter column lifecycle drop not null,
  alter column lifecycle drop default,
  alter column status drop not null,
  alter column status drop default,
  alter column priority drop not null,
  alter column priority drop default,
  alter column size drop not null,
  alter column size drop default;
