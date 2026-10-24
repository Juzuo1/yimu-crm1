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
