-- Set once a delivery is routed; a redelivery of one that never was gets routed again.
alter table star_catch.webhook_deliveries add column handled_at timestamptz;
