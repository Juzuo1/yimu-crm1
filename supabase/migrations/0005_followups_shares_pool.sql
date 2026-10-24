-- =============================================================
-- 0005 跟进 / 共享 / 公海记录 / 通知
-- =============================================================

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  customer_id uuid not null references customers on delete cascade,
  contact_id uuid references contacts on delete set null,
  type followup_type not null default 'note',
  content text not null,
  contacted_at timestamptz not null default now(),
  next_follow_up_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index followups_customer_idx on follow_ups(customer_id, created_at desc);
create index followups_due_idx on follow_ups(created_by, next_follow_up_at) where next_follow_up_at is not null;

-- 客户共享（多人协同跟进）
create table customer_shares (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  customer_id uuid not null references customers on delete cascade,
  shared_by uuid not null,
  shared_with uuid not null references profiles,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  created_at timestamptz not null default now(),
  unique (customer_id, shared_with)
);
create index shares_with_idx on customer_shares(shared_with);

-- 公海变动流水
create table pool_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  customer_id uuid not null references customers on delete cascade,
  action pool_action not null,
  from_user_id uuid,
  to_user_id uuid,
  reason text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index pool_records_customer_idx on pool_records(customer_id, created_at desc);

-- 站内通知
create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  user_id uuid not null references profiles on delete cascade,
  type notify_type not null,
  title text not null,
  content text,
  customer_id uuid references customers on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, is_read, created_at desc);
