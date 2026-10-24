-- =============================================================
-- YIMU 外贸客户管理系统 - 数据库一键部署脚本
-- 在 Supabase 控制台 SQL Editor 中整段粘贴执行即可
-- =============================================================


-- >>>>>>>>> 0001_extensions_enums.sql <<<<<<<<<

-- =============================================================
-- 0001 扩展与枚举类型
-- =============================================================

create extension if not exists pg_trgm;        -- 查重模糊匹配
create extension if not exists pgcrypto;       -- gen_random_uuid
create extension if not exists supabase_vault; -- 邮箱授权码加密存储
create extension if not exists pg_cron;        -- 定时任务（公海回收/未回复提醒/重算评分）
create extension if not exists pg_net;         -- 定时调用 Edge Function（邮件同步，可选）

-- 用户角色（多团队预留）
create type user_role as enum ('owner', 'admin', 'manager', 'sales');

-- 用户状态
create type user_status as enum ('active', 'disabled');

-- 客户等级
create type customer_grade as enum ('S', 'A', 'B', 'C', 'D');

-- 客户状态
create type customer_status as enum ('active', 'dormant', 'lost');

-- 客户来源渠道
create type customer_source as enum ('alibaba', 'exhibition', 'website', 'self_develop', 'referral', 'customs_data', 'other');

-- 公司类型
create type company_type as enum ('manufacturer', 'trading', 'distributor', 'retailer', 'end_user', 'other');

-- 公司规模
create type company_scale as enum ('lt10', 's10_50', 's51_200', 's201_500', 'gt500');

-- 联系人决策角色
create type decision_role as enum ('decision_maker', 'influencer', 'technical', 'purchasing', 'gatekeeper', 'user', 'other');

-- 跟进类型
create type followup_type as enum ('email', 'phone', 'whatsapp', 'wechat', 'meeting', 'visit', 'note', 'system');

-- 公海动作
create type pool_action as enum ('recycle', 'claim', 'assign', 'release');

-- 邮件方向
create type email_direction as enum ('in', 'out');

-- 邮箱账号状态
create type account_status as enum ('active', 'error', 'disabled');

-- 通知类型
create type notify_type as enum ('followup_due', 'unreplied', 'pool_recycled', 'pool_claimed', 'shared', 'system');

-- >>>>>>>>> 0002_org_profiles.sql <<<<<<<<<

-- =============================================================
-- 0002 组织与人员（多团队预留，V1 单 org）
-- =============================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  org_id uuid not null references organizations,
  name text not null,
  email text not null,
  phone text,
  avatar_url text,
  role user_role not null default 'sales',
  status user_status not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index profiles_org_idx on profiles(org_id);

-- 组织级规则配置（公海机制参数化，管理员可在界面修改）
create table org_settings (
  org_id uuid primary key references organizations,
  recycle_days int not null default 30 check (recycle_days >= 1),            -- 超期未跟进回收天数
  max_private_customers int not null default 100 check (max_private_customers >= 1), -- 每人私海上限
  protection_days int not null default 7 check (protection_days >= 0),       -- 领取后保护期
  unreplied_remind_days int not null default 3 check (unreplied_remind_days >= 1), -- 邮件未回复提醒天数
  updated_at timestamptz default now()
);

-- 注册邀请（邀请制：只有被邀请的邮箱才能注册加入团队）
create table pending_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  email text not null,
  role user_role not null default 'sales',
  created_by uuid not null,
  created_at timestamptz default now(),
  unique (org_id, email)
);

-- =============================================================
-- 新用户注册触发器：
-- 1) 邮箱在 pending_invites 中 → 按邀请建立 profile
-- 2) 系统尚无任何组织 → 自动创建组织，本人成为 owner（第一个注册者即管理员）
-- 3) 其他情况 → 拒绝注册
-- =============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_invite pending_invites;
  v_org_id uuid;
  v_org_count int;
begin
  -- 情况 1：被邀请加入已有团队
  select * into v_invite from pending_invites
  where lower(email) = lower(new.email) order by created_at limit 1;

  if v_invite.id is not null then
    insert into profiles (id, org_id, name, email, role)
    values (new.id, v_invite.org_id,
            coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
            new.email, v_invite.role);
    delete from pending_invites where id = v_invite.id;
    return new;
  end if;

  -- 情况 2：系统第一个用户，自动建组织当 owner
  select count(*) into v_org_count from organizations;
  if v_org_count = 0 then
    insert into organizations (name) values ('我的团队') returning id into v_org_id;
    insert into org_settings (org_id) values (v_org_id);
    insert into profiles (id, org_id, name, email, role)
    values (new.id, v_org_id,
            coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
            new.email, 'owner');
    return new;
  end if;

  -- 情况 3：无邀请且已有组织 → 拒绝
  raise exception '未受邀请的邮箱无法注册，请联系团队管理员在「成员管理」中邀请你';
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- >>>>>>>>> 0003_customers.sql <<<<<<<<<

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

-- >>>>>>>>> 0004_tags_groups.sql <<<<<<<<<

-- =============================================================
-- 0004 标签与分组
-- =============================================================

create table tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  name text not null,
  color text not null default 'blue',
  unique (org_id, name)
);

create table customer_tags (
  customer_id uuid not null references customers on delete cascade,
  tag_id uuid not null references tags on delete cascade,
  primary key (customer_id, tag_id)
);
create index customer_tags_tag_idx on customer_tags(tag_id);

create table groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations,
  name text not null,
  color text not null default 'blue',
  unique (org_id, name)
);

create table customer_groups (
  customer_id uuid not null references customers on delete cascade,
  group_id uuid not null references groups on delete cascade,
  primary key (customer_id, group_id)
);
create index customer_groups_group_idx on customer_groups(group_id);

-- >>>>>>>>> 0005_followups_shares_pool.sql <<<<<<<<<

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

-- >>>>>>>>> 0006_email_timeline.sql <<<<<<<<<

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

-- >>>>>>>>> 0007_rls.sql <<<<<<<<<

-- =============================================================
-- 0007 RLS 行级安全策略 + 归属保护触发器
-- 原则：全部表默认拒绝、显式放行
-- =============================================================

-- ---------- 辅助函数（SECURITY DEFINER，避免策略递归） ----------
create or replace function auth_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid() $$;

create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() $$;

create or replace function is_manager_plus() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('owner', 'admin', 'manager'), false) $$;

-- 当前用户是否可见该客户（本人 / 公海 / 被共享 / 主管以上）
create or replace function customer_visible(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from customers c
    where c.id = cid and c.org_id = auth_org_id()
      and (c.owner_id = auth.uid() or c.in_pool or is_manager_plus()
           or exists (select 1 from customer_shares s
                      where s.customer_id = c.id and s.shared_with = auth.uid()))
  ) $$;

-- 当前用户是否可写该客户（本人 / 主管以上 / 被共享且 edit）
create or replace function can_write_customer(cid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from customers c
    where c.id = cid and c.org_id = auth_org_id()
      and (c.owner_id = auth.uid() or is_manager_plus()
           or exists (select 1 from customer_shares s
                      where s.customer_id = c.id and s.shared_with = auth.uid() and s.permission = 'edit'))
  ) $$;

-- ---------- 客户归属保护：owner_id/in_pool 等字段只能经 RPC 变更 ----------
create or replace function protect_customer_ownership() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (NEW.owner_id is distinct from OLD.owner_id)
     or (NEW.in_pool is distinct from OLD.in_pool)
     or (NEW.claimed_at is distinct from OLD.claimed_at)
     or (NEW.protection_until is distinct from OLD.protection_until)
     or (NEW.pool_entered_at is distinct from OLD.pool_entered_at) then
    if coalesce(current_setting('crm.allow_owner_change', true), 'off') <> 'on' then
      raise exception '客户归属变更必须通过领取/回收/分配操作完成';
    end if;
  end if;
  NEW.updated_at := now();
  return new;
end $$;

create trigger customers_protect_ownership before update on customers
  for each row execute function protect_customer_ownership();

-- updated_at 自动维护
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin NEW.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger org_settings_touch before update on org_settings
  for each row execute function touch_updated_at();
create trigger email_accounts_touch before update on email_accounts
  for each row execute function touch_updated_at();

-- ---------- 启用 RLS ----------
alter table organizations    enable row level security;
alter table profiles         enable row level security;
alter table org_settings     enable row level security;
alter table pending_invites  enable row level security;
alter table customers        enable row level security;
alter table contacts         enable row level security;
alter table tags             enable row level security;
alter table customer_tags    enable row level security;
alter table groups           enable row level security;
alter table customer_groups  enable row level security;
alter table follow_ups       enable row level security;
alter table customer_shares  enable row level security;
alter table pool_records     enable row level security;
alter table notifications    enable row level security;
alter table email_accounts   enable row level security;
alter table email_messages   enable row level security;

-- ---------- organizations ----------
create policy "同组织可见" on organizations for select using (id = auth_org_id());
create policy "owner/admin 可改" on organizations for update using (auth_role() in ('owner', 'admin'));

-- ---------- profiles ----------
create policy "同组织可见成员" on profiles for select using (org_id = auth_org_id());
create policy "本人可改自己资料" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and org_id = auth_org_id());
create policy "admin 可管理成员" on profiles for update using (is_manager_plus() and auth_role() in ('owner', 'admin'));

-- ---------- org_settings ----------
create policy "同组织可见规则" on org_settings for select using (org_id = auth_org_id());
create policy "admin 可改规则" on org_settings for update using (org_id = auth_org_id() and auth_role() in ('owner', 'admin'));

-- ---------- pending_invites ----------
create policy "admin 管理邀请" on pending_invites for all
  using (org_id = auth_org_id() and auth_role() in ('owner', 'admin'));

-- ---------- customers ----------
create policy "可见客户" on customers for select using (customer_visible(id));
create policy "同组织可建档" on customers for insert
  with check (org_id = auth_org_id() and created_by = auth.uid());
create policy "可写客户" on customers for update
  using (can_write_customer(id)) with check (org_id = auth_org_id());
create policy "admin 可删客户" on customers for delete
  using (org_id = auth_org_id() and auth_role() in ('owner', 'admin'));

-- ---------- contacts ----------
create policy "联系人随客户可见" on contacts for select
  using (org_id = auth_org_id() and customer_visible(customer_id));
create policy "联系人随客户可写" on contacts for insert
  with check (org_id = auth_org_id() and can_write_customer(customer_id));
create policy "联系人可更新" on contacts for update
  using (org_id = auth_org_id() and can_write_customer(customer_id));
create policy "联系人可删除" on contacts for delete
  using (org_id = auth_org_id() and can_write_customer(customer_id));

-- ---------- tags / groups ----------
create policy "同组织可见标签" on tags for select using (org_id = auth_org_id());
create policy "同组织管理标签" on tags for all
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());
create policy "同组织可见分组" on groups for select using (org_id = auth_org_id());
create policy "同组织管理分组" on groups for all
  using (org_id = auth_org_id()) with check (org_id = auth_org_id());

create policy "客户标签随客户" on customer_tags for all
  using (customer_visible(customer_id)) with check (customer_visible(customer_id));
create policy "客户分组随客户" on customer_groups for all
  using (customer_visible(customer_id)) with check (customer_visible(customer_id));

-- ---------- follow_ups ----------
create policy "跟进随客户可见" on follow_ups for select
  using (org_id = auth_org_id() and customer_visible(customer_id));
create policy "跟进可录入" on follow_ups for insert
  with check (org_id = auth_org_id() and can_write_customer(customer_id) and created_by = auth.uid());
create policy "本人跟进可改" on follow_ups for update
  using (created_by = auth.uid() or is_manager_plus());
create policy "本人或主管可删跟进" on follow_ups for delete
  using (created_by = auth.uid() or is_manager_plus());

-- ---------- customer_shares ----------
create policy "共享相关方可见" on customer_shares for select
  using (org_id = auth_org_id() and (shared_with = auth.uid() or shared_by = auth.uid() or is_manager_plus()));
create policy "客户归属人或主管可共享" on customer_shares for insert
  with check (org_id = auth_org_id()
    and exists (select 1 from customers c where c.id = customer_id
                and (c.owner_id = auth.uid() or is_manager_plus())));
create policy "共享方可撤销" on customer_shares for delete
  using (shared_by = auth.uid() or is_manager_plus()
    or exists (select 1 from customers c where c.id = customer_id and c.owner_id = auth.uid()));

-- ---------- pool_records ----------
create policy "同组织可见公海记录" on pool_records for select using (org_id = auth_org_id());

-- ---------- notifications ----------
create policy "本人通知" on notifications for select using (user_id = auth.uid());
create policy "本人可已读" on notifications for update using (user_id = auth.uid());
create policy "本人可删除通知" on notifications for delete using (user_id = auth.uid());

-- ---------- email_accounts ----------
create policy "本人或主管可见邮箱" on email_accounts for select
  using (org_id = auth_org_id() and (user_id = auth.uid() or is_manager_plus()));
create policy "本人可绑邮箱" on email_accounts for insert
  with check (org_id = auth_org_id() and user_id = auth.uid());
create policy "本人可改自己邮箱" on email_accounts for update
  using (user_id = auth.uid() or auth_role() in ('owner', 'admin'));
create policy "本人或admin可删" on email_accounts for delete
  using (user_id = auth.uid() or auth_role() in ('owner', 'admin'));

-- ---------- email_messages（写入只走 service_role 的同步 Worker） ----------
create policy "邮件可见范围" on email_messages for select
  using (org_id = auth_org_id() and (
    exists (select 1 from email_accounts a where a.id = account_id
            and (a.user_id = auth.uid() or is_manager_plus()))
    or (customer_id is not null and customer_visible(customer_id))
  ));

-- >>>>>>>>> 0008_rpc_cron.sql <<<<<<<<<

-- =============================================================
-- 0008 核心 RPC + pg_cron 定时任务
-- =============================================================

-- ---------- 1. 领取公海客户（行锁防并发 + 私海上限 + 保护期） ----------
create or replace function claim_customer(p_customer_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := auth_org_id();
  v_uid uuid := auth.uid();
  v_limit int;
  v_count int;
begin
  if v_uid is null then raise exception '未登录'; end if;

  select max_private_customers into v_limit from org_settings where org_id = v_org;
  select count(*) into v_count from customers
   where org_id = v_org and owner_id = v_uid and not in_pool;
  if v_count >= v_limit then
    raise exception '私海客户已达上限（%），请先跟进或释放部分客户', v_limit;
  end if;

  perform set_config('crm.allow_owner_change', 'on', true);
  update customers
     set owner_id = v_uid, in_pool = false, claimed_at = now(),
         protection_until = now() + interval '1 day' * (select protection_days from org_settings where org_id = v_org),
         pool_entered_at = null
   where id = p_customer_id and org_id = v_org and in_pool;
  if not found then
    raise exception '该客户已被领取或已分配，请刷新列表';
  end if;

  insert into pool_records (org_id, customer_id, action, to_user_id, reason, created_by)
  values (v_org, p_customer_id, 'claim', v_uid, '从公海领取', v_uid);
end $$;

-- ---------- 2. 主动退回公海 ----------
create or replace function release_customer(p_customer_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := auth_org_id();
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  select owner_id into v_owner from customers where id = p_customer_id and org_id = v_org;
  if v_owner is null then raise exception '客户不存在'; end if;
  if v_owner <> v_uid and not is_manager_plus() then
    raise exception '只有归属人或主管可以退回客户';
  end if;

  perform set_config('crm.allow_owner_change', 'on', true);
  update customers
     set in_pool = true, pool_entered_at = now(), owner_id = null,
         claimed_at = null, protection_until = null
   where id = p_customer_id;

  insert into pool_records (org_id, customer_id, action, from_user_id, reason, created_by)
  values (v_org, p_customer_id, 'release', v_owner, '主动退回公海', v_uid);
end $$;

-- ---------- 3. 主管分配客户给业务员 ----------
create or replace function assign_customer(p_customer_id uuid, p_user_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := auth_org_id();
begin
  if not is_manager_plus() then raise exception '只有主管及以上可以分配客户'; end if;
  if not exists (select 1 from profiles where id = p_user_id and org_id = v_org) then
    raise exception '目标成员不存在或不在本团队';
  end if;

  perform set_config('crm.allow_owner_change', 'on', true);
  update customers
     set owner_id = p_user_id, in_pool = false, claimed_at = now(),
         protection_until = now() + interval '1 day' * (select protection_days from org_settings where org_id = v_org),
         pool_entered_at = null
   where id = p_customer_id and org_id = v_org;

  insert into pool_records (org_id, customer_id, action, to_user_id, reason, created_by)
  values (v_org, p_customer_id, 'assign', p_user_id, '主管分配', auth.uid());

  insert into notifications (org_id, user_id, type, title, customer_id)
  values (v_org, p_user_id, 'pool_claimed', '主管分配了一个客户给你', p_customer_id);
end $$;

-- ---------- 4. 每日公海自动回收（pg_cron 每日 02:00） ----------
create or replace function recycle_dormant_customers() returns void
  language plpgsql security definer set search_path = public as $$
begin
  perform set_config('crm.allow_owner_change', 'on', true);

  -- 收集本次回收的客户（临时表，供后续两条插入引用）
  create temp table _recycled on commit drop as
    with recycled as (
      update customers c
         set in_pool = true, pool_entered_at = now(), owner_id = null,
             claimed_at = null, protection_until = null, next_follow_up_at = null
        from org_settings s
       where c.org_id = s.org_id
         and c.owner_id is not null and not c.in_pool
         and coalesce(c.last_follow_up_at, c.created_at) < now() - (s.recycle_days || ' days')::interval
         and (c.protection_until is null or c.protection_until < now())
       returning c.id, c.org_id, c.owner_id, s.recycle_days
    )
    select * from recycled;

  insert into pool_records (org_id, customer_id, action, from_user_id, reason, created_by)
  select org_id, id, 'recycle', owner_id,
         concat('超过', recycle_days, '天未跟进，自动回收到公海'), owner_id
    from _recycled;

  insert into notifications (org_id, user_id, type, title, customer_id)
  select org_id, owner_id, 'pool_recycled', '您的客户已被回收到公海', id
    from _recycled;
end $$;

-- ---------- 5. 每日未回复邮件提醒（pg_cron 每日 09:00） ----------
create or replace function remind_unreplied() returns void
  language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (org_id, user_id, type, title, content, customer_id)
  select c.org_id, c.owner_id, 'unreplied', '客户邮件未回复提醒',
         concat(c.company_name, ' 的往来邮件已超过 ',
                (select unreplied_remind_days from org_settings o where o.org_id = c.org_id),
                ' 天未回复'),
         c.id
    from customers c
   where c.owner_id is not null and not c.in_pool
     and c.last_contact_at < now() - ((select unreplied_remind_days from org_settings o where o.org_id = c.org_id) || ' days')::interval
     and exists (select 1 from email_messages e where e.customer_id = c.id and e.direction = 'out')
     and not exists (select 1 from notifications n
                      where n.customer_id = c.id and n.type = 'unreplied'
                        and n.created_at > now() - interval '1 day');
end $$;

-- ---------- 6. 每周重算客户评分（活跃度/完整度） ----------
create or replace function recompute_customer_scores() returns void
  language plpgsql security definer set search_path = public as $$
begin
  update customers c set
    activity_score = case
      when c.last_contact_at is null then 0
      when c.last_contact_at > now() - interval '7 days' then 100
      when c.last_contact_at > now() - interval '30 days' then 80
      when c.last_contact_at > now() - interval '90 days' then 50
      when c.last_contact_at > now() - interval '180 days' then 25
      else 5 end,
    completeness_score = (
      (case when coalesce(c.company_name, '') <> '' then 1 else 0 end) +
      (case when coalesce(c.company_name_en, '') <> '' then 1 else 0 end) +
      (case when coalesce(c.website, '') <> '' then 1 else 0 end) +
      (case when coalesce(c.country, '') <> '' then 1 else 0 end) +
      (case when coalesce(c.industry, '') <> '' then 1 else 0 end) +
      (case when coalesce(c.main_products, '') <> '' then 1 else 0 end) +
      (case when c.notes is not null and c.notes <> '' then 1 else 0 end) +
      (case when exists (select 1 from contacts ct where ct.customer_id = c.id) then 1 else 0 end) +
      (case when c.last_follow_up_at is not null then 1 else 0 end) +
      (case when c.grade in ('S', 'A') then 1 else 0 end)
    ) * 10
  where c.org_id is not null;
end $$;

-- ---------- 7. 客户查重（防撞单第一道闸） ----------
create or replace function find_duplicates(
  p_name text default null,
  p_website text default null,
  p_email text default null
) returns table (
  customer_id uuid, company_name text, website text, country text,
  owner_id uuid, owner_name text, reason text, similarity real
)
  language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := auth_org_id();
  v_domain text;
  v_email_domain text;
begin
  v_domain := lower(regexp_replace(replace(replace(coalesce(p_website, ''), 'https://', ''), 'http://', ''), '^www\.', ''));
  v_email_domain := lower(split_part(coalesce(p_email, ''), '@', 2));

  return query
  select c.id, c.company_name, c.website, c.country, c.owner_id, p.name,
         case
           when c.website_domain = v_domain and v_domain <> '' then '官网域名相同'
           when c.website_domain = v_email_domain and v_email_domain <> '' then '联系邮箱域名相同'
           else '公司名称相似'
         end::text,
         case when p_name is not null then similarity(c.company_name, p_name) else 1.0 end
    from customers c
    left join profiles p on p.id = c.owner_id
   where c.org_id = v_org
     and (
       (v_domain <> '' and c.website_domain = v_domain)
       or (v_email_domain <> '' and c.website_domain = v_email_domain)
       or (p_name is not null and c.company_name % p_name and similarity(c.company_name, p_name) > 0.3)
     )
   order by 8 desc
   limit 10;
end $$;

-- ---------- 8. 邮件批量入库（同步 Worker 用 service_role 调用） ----------
create or replace function ingest_emails(p_account_id uuid, p_messages jsonb) returns int
  language plpgsql security definer set search_path = public as $$
declare
  v_account email_accounts;
  v_msg jsonb;
  v_inserted int := 0;
  v_customer_id uuid;
  v_from text;
  v_domain text;
begin
  select * into v_account from email_accounts where id = p_account_id;
  if v_account.id is null then raise exception '邮箱账号不存在'; end if;

  for v_msg in select * from jsonb_array_elements(p_messages) loop
    v_from := lower(v_msg->>'from_address');
    v_domain := split_part(v_from, '@', 2);

    -- 匹配客户：先按发件人精确邮箱，再按域名
    select ct.customer_id into v_customer_id
      from contacts ct
     where ct.org_id = v_account.org_id and lower(ct.email) = v_from
     limit 1;
    if v_customer_id is null then
      select c.id into v_customer_id
        from customers c
       where c.org_id = v_account.org_id and c.website_domain = v_domain and v_domain <> ''
       limit 1;
    end if;

    insert into email_messages (
      org_id, account_id, customer_id, message_id, uid, folder, direction,
      from_address, from_name, to_addresses, cc_addresses, subject,
      body_text, snippet, received_at, matched_by
    ) values (
      v_account.org_id, p_account_id, v_customer_id, v_msg->>'message_id',
      (v_msg->>'uid')::bigint, coalesce(v_msg->>'folder', 'INBOX'),
      (v_msg->>'direction')::email_direction, v_msg->>'from_address', v_msg->>'from_name',
      array(select jsonb_array_elements_text(coalesce(v_msg->'to_addresses', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(v_msg->'cc_addresses', '[]'::jsonb))),
      v_msg->>'subject', left(coalesce(v_msg->>'body_text', ''), 32768),
      left(coalesce(v_msg->>'body_text', ''), 200),
      (v_msg->>'received_at')::timestamptz,
      case when v_customer_id is null then null
           when exists (select 1 from contacts ct where ct.org_id = v_account.org_id and lower(ct.email) = v_from) then 'contact_email'
           else 'domain' end
    )
    on conflict (message_id) do nothing;

    if FOUND then
      v_inserted := v_inserted + 1;
      if v_customer_id is not null then
        update customers c set last_contact_at = greatest(coalesce(c.last_contact_at, (v_msg->>'received_at')::timestamptz), (v_msg->>'received_at')::timestamptz)
         where c.id = v_customer_id;
      end if;
    end if;
  end loop;

  update email_accounts set last_sync_at = now() where id = p_account_id;
  return v_inserted;
end $$;

-- 仅同步 Worker（service_role）可调用
revoke all on function ingest_emails(uuid, jsonb) from anon, authenticated;
grant execute on function ingest_emails(uuid, jsonb) to service_role;

-- ---------- 8.5 IMAP 授权码加密存取（Supabase Vault） ----------
-- 前端绑定邮箱时调用：把自己的授权码加密存入 Vault（不明文落库）
create or replace function store_email_credential(p_secret_name text, p_secret text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from email_accounts where user_id = auth.uid() and vault_secret_name = p_secret_name)
     and not is_manager_plus() then
    raise exception '无权存储该密钥';
  end if;
  if exists (select 1 from vault.secrets where name = p_secret_name) then
    perform vault.update_secret(p_secret_name, p_secret);
  else
    perform vault.create_secret(p_secret, p_secret_name, 'email imap credential');
  end if;
end $$;

-- 同步 Worker 读取授权码（仅 service_role 可调）
create or replace function get_email_credential(p_secret_name text) returns text
  language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = p_secret_name;
  return v;
end $$;
revoke all on function get_email_credential(text) from anon, authenticated;
grant execute on function get_email_credential(text) to service_role;

-- ---------- 9. 看板聚合（单 RPC 返回 jsonb） ----------
create or replace function dashboard_summary() returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  with visible as (
    select c.* from customers c where customer_visible(c.id)
  )
  select jsonb_build_object(
    'total_customers', (select count(*) from visible),
    'my_customers', (select count(*) from visible where owner_id = auth.uid()),
    'pool_customers', (select count(*) from visible where in_pool),
    'due_today', (select count(*) from visible
                   where owner_id = auth.uid() and next_follow_up_at is not null
                     and next_follow_up_at >= date_trunc('day', now())
                     and next_follow_up_at < date_trunc('day', now()) + interval '1 day'),
    'overdue', (select count(*) from visible
                 where owner_id = auth.uid() and next_follow_up_at is not null
                   and next_follow_up_at < date_trunc('day', now())),
    'new_trend', (
      select coalesce(jsonb_agg(t order by t.month), '[]'::jsonb) from (
        select to_char(date_trunc('month', created_at), 'YYYY-MM') as month, count(*)::int as count
          from visible
         where created_at > now() - interval '12 months'
         group by 1) t),
    'source_dist', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select source::text as name, count(*)::int as value from visible group by 1) t),
    'grade_dist', (
      select coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) from (
        select grade::text as name, count(*)::int as value from visible group by 1) t),
    'status_dist', (
      select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select status::text as name, count(*)::int as value from visible group by 1) t),
    'followup_ranking', (
      select coalesce(jsonb_agg(t order by t.count desc), '[]'::jsonb) from (
        select p.name, count(f.id)::int as count
          from follow_ups f join profiles p on p.id = f.created_by
         where f.org_id = auth_org_id() and f.created_at > now() - interval '30 days'
         group by p.name) t)
  ) into v_result;
  return v_result;
end $$;

-- ---------- 10. pg_cron 定时任务 ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 每日 02:00 回收超期客户
    perform cron.schedule('recycle-dormant-customers', '0 2 * * *',
      $cmd$ select recycle_dormant_customers(); $cmd$);
    -- 每日 09:00 未回复提醒
    perform cron.schedule('remind-unreplied', '0 9 * * *',
      $cmd$ select remind_unreplied(); $cmd$);
    -- 每周一 03:00 重算评分
    perform cron.schedule('recompute-scores', '0 3 * * 1',
      $cmd$ select recompute_customer_scores(); $cmd$);
  end if;
end $$;

-- =============================================================
-- 邮件同步定时触发（二选一，部署时启用）：
--
-- 方案 A（推荐）：Edge Function + pg_net 每 15 分钟触发
--   先执行：create extension if not exists pg_net;
--   然后把下面的 <项目REF> 换成你的 Supabase 项目 ref 后取消注释执行：
--
-- select cron.schedule('imap-sync', '*/15 * * * *', $$
--   select net.http_post(
--     url := 'https://<项目REF>.supabase.co/functions/v1/imap-sync',
--     headers := jsonb_build_object('Content-Type', 'application/json'),
--     body := '{}'::jsonb
--   );
-- $$);
--
-- 方案 B：GitHub Actions Worker（仓库已含 .github/workflows/imap-sync.yml）
--   在仓库 Secrets 加 SUPABASE_SERVICE_ROLE_KEY 即可，无需改数据库。
--   注意：公开仓库 60 天无提交时定时任务会被禁用，长假后需在仓库页面点 Enable。
-- =============================================================
