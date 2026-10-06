-- Generated updates: one version per pull request and head commit; Crux shows the latest.
create table star_catch.catch_versions (
  catch_id   text not null,
  head_sha   text not null,
  repo       text not null, -- lower-cased owner/repo
  pr_number  integer not null,
  created_at timestamptz not null default now(),
  version    jsonb not null,
  primary key (catch_id, head_sha)
);
create index catch_versions_repo on star_catch.catch_versions (repo, created_at desc);

-- Each generation attempt and how it ended.
create table star_catch.catch_runs (
  id          bigserial primary key,
  repo        text not null,
  pr_number   integer not null,
  head_sha    text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'done', 'failed')),
  step        text,
  error       text
);
create index catch_runs_pr on star_catch.catch_runs (repo, pr_number, started_at desc);

-- Which repos get updates; Crux turns them on and off through the API.
create table star_catch.repo_settings (
  repo       text primary key,
  enabled    boolean not null,
  updated_at timestamptz not null default now()
);
