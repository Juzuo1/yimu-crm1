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
