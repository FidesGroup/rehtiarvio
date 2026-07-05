-- Stage 1: subscription entitlements (Stripe) gating asuntocard generation.
-- Access model: after checkout the subscriber gets an access_token cookie;
-- the ?/report action only creates work for an active token. No passwords.
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'active'
    check (status in ('active', 'past_due', 'canceled')),
  access_token uuid not null unique default gen_random_uuid()
);

alter table subscribers enable row level security;
-- no public policies: server-side (service role) access only

alter table reports add column if not exists subscriber_id uuid references subscribers(id);
