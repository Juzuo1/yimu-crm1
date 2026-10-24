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
      $$ select recycle_dormant_customers(); $$);
    -- 每日 09:00 未回复提醒
    perform cron.schedule('remind-unreplied', '0 9 * * *',
      $$ select remind_unreplied(); $$);
    -- 每周一 03:00 重算评分
    perform cron.schedule('recompute-scores', '0 3 * * 1',
      $$ select recompute_customer_scores(); $$);
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
