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
