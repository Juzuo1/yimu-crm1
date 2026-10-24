-- =============================================================
-- 0006 邮箱同步 + 360° 时间线视图
-- =============================================================

create table email_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  user_id uuid not null references profiles,
  label text not null default '我的邮箱',
  email text not null,
  imap_host text not null,
  imap_port int not null default 993,
  use_ssl boolean not null default true,   -- 强制 993 隐式 TLS（Edge Function 禁 587）
  username text not null,
  vault_secret_name text not null,          -- 指向 Vault 中的授权码，不明文存密码
  status account_status not null default 'active',
  last_sync_at timestamptz,
  last_uid bigint not null default 0,
  sync_error text,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index email_accounts_user_idx on email_accounts(user_id);

create table email_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  account_id uuid not null references email_accounts on delete cascade,
  customer_id uuid references customers on delete set null,   -- NULL=未关联，待人工分派
  contact_id uuid references contacts on delete set null,
  message_id text not null,                                    -- RFC822 Message-ID
  uid bigint not null,
  folder text not null default 'INBOX',
  direction email_direction not null,
  from_address text not null,
  from_name text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,
  body_text text check (length(body_text) <= 32768),           -- 32KB 上限，控制库容
  snippet text,
  received_at timestamptz not null,
  is_read boolean not null default false,
  matched_by text,                                             -- domain / contact_email / manual
  created_at timestamptz not null default now(),
  unique (message_id)
);
create index emails_customer_idx on email_messages(customer_id, received_at desc);
create index emails_account_uid_idx on email_messages(account_id, uid);
create index emails_unmatched_idx on email_messages(org_id) where customer_id is null;
create index emails_from_idx on email_messages(lower(from_address));

-- =============================================================
-- 360° 时间线视图：邮件 + 跟进 + 公海记录三类动态 UNION
-- security_invoker 透传 RLS（PG15+）
-- =============================================================
create or replace view customer_timeline with (security_invoker = true) as
  select id, customer_id, 'email' as kind, coalesce(subject, '(无主题)') as title,
         snippet as summary, received_at as occurred_at, null::uuid as created_by
  from email_messages where customer_id is not null
  union all
  select id, customer_id, 'followup' as kind, type::text as title,
         content as summary, contacted_at as occurred_at, created_by
  from follow_ups
  union all
  select id, customer_id, 'pool' as kind, action::text as title,
         reason as summary, created_at as occurred_at, created_by
  from pool_records;
