-- @ingram-tech/nk-email — nk_email_log.
--
-- The optional send-log: one row per dispatch, written by createMailer() (and by
-- @ingram-tech/nk-marketing for its broadcasts/lifecycle sends). Like
-- nk-marketing's tables it carries NO row-level security — a nextkit site reaches
-- it through its app role and an operator surface reads it through a read-only
-- role. Apply this only if you turn logging on; nk-email works without it.
--
-- Ids use gen_random_uuid() to match nk-marketing's convention: these ids never
-- cross a public contract, and it keeps the migration extension-free and
-- identical across Postgres and PGlite (no uuidv7()/pgcrypto assumption). The
-- log is append-only from the app's side; there is no updated_at.

create table if not exists nk_email_log (
	id           uuid        primary key default gen_random_uuid(),
	-- 'transactional' | 'marketing' — discriminates the two history views.
	kind         text        not null,
	-- Primary recipient address (first, when a send had several).
	recipient    text        not null,
	subject      text        not null,
	-- The rendered "Name <addr>" sender string.
	sender       text        not null,
	-- Catalog entry key this send corresponds to (email-catalog.json), if any.
	template_key text,
	-- nk-marketing campaign/issue key for a marketing send, if any.
	campaign_key text,
	-- Provider message id when the transport returns one (Cloudflare does not).
	message_id   text,
	-- 'sent' | 'failed'.
	status       text        not null,
	-- Error text on a failed send.
	error        text,
	created_at   timestamptz not null default now(),
	constraint nk_email_log_kind_check check (kind in ('transactional', 'marketing')),
	constraint nk_email_log_status_check check (status in ('sent', 'failed'))
);

-- Hot path: the history views read newest-first, optionally filtered by kind.
create index if not exists idx_nk_email_log_created on nk_email_log (created_at desc);
create index if not exists idx_nk_email_log_kind_created on nk_email_log (kind, created_at desc);
