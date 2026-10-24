-- =============================================================
-- 0003 客户核心表
-- =============================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  -- 企业信息
  company_name text not null,
  company_name_en text,
  website text,
  website_domain text generated always as (
    lower(regexp_replace(replace(replace(website, 'https://', ''), 'http://', ''), '^www\.', ''))
  ) stored,
  country text,
  region text,
  company_type company_type not null default 'other',
  company_scale company_scale not null default 'lt10',
  industry text,
  main_products text,
  address text,
  -- 管理字段
  grade customer_grade not null default 'C',
  star_level smallint not null default 3 check (star_level between 1 and 5),
  source customer_source not null default 'other',
  status customer_status not null default 'active',
  owner_id uuid references profiles,
  in_pool boolean not null default false,
  pool_entered_at timestamptz,
  claimed_at timestamptz,
  protection_until timestamptz,
  -- 评分（紧密度/匹配度手动 1-5；活跃度/完整度自动 0-100）
  closeness_score smallint check (closeness_score between 1 and 5),
  match_score smallint check (match_score between 1 and 5),
  activity_score smallint check (activity_score between 0 and 100),
  completeness_score smallint check (completeness_score between 0 and 100),
  -- 跟进（冗余字段，列表页免聚合）
  last_follow_up_at timestamptz,
  next_follow_up_at timestamptz,
  last_contact_at timestamptz,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_org_idx on customers(org_id);
create index customers_owner_idx on customers(owner_id);
create index customers_pool_idx on customers(org_id, in_pool) where in_pool;
create index customers_status_idx on customers(org_id, status);
create index customers_grade_idx on customers(org_id, grade);
create index customers_next_followup_idx on customers(owner_id, next_follow_up_at) where next_follow_up_at is not null;
create index customers_domain_idx on customers(org_id, website_domain);
create index customers_trgm_idx on customers using gin (company_name gin_trgm_ops);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  customer_id uuid not null references customers on delete cascade,
  name text not null,
  name_en text,
  position text,
  decision_role decision_role not null default 'other',
  email text,
  phone text,
  whatsapp text,
  wechat text,
  is_primary boolean not null default false,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index contacts_customer_idx on contacts(customer_id);
create index contacts_email_idx on contacts(lower(email));
