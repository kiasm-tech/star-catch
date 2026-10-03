create schema if not exists star_catch;

-- Every delivery GitHub sent, once: a redelivery conflicts on the id.
create table star_catch.webhook_deliveries (
  delivery_id     text primary key,
  event           text not null,
  action          text,
  installation_id bigint,
  received_at     timestamptz not null default now(),
  payload         jsonb not null
);
create index webhook_deliveries_received_at on star_catch.webhook_deliveries (received_at);

-- Immutable snapshots, one per repo and head commit.
create table star_catch.pr_snapshots (
  repo        text not null, -- lower-cased owner/repo
  head_sha    text not null,
  pr_number   integer not null,
  captured_at timestamptz not null default now(),
  snapshot    jsonb not null,
  primary key (repo, head_sha)
);
