// 与数据库 Schema 对应的 TypeScript 类型（手写维护，改表时同步更新）

export type UserRole = 'owner' | 'admin' | 'manager' | 'sales';
export type CustomerGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type CustomerStatus = 'active' | 'dormant' | 'lost';
export type CustomerSource = 'alibaba' | 'exhibition' | 'website' | 'self_develop' | 'referral' | 'customs_data' | 'other';
export type CompanyType = 'manufacturer' | 'trading' | 'distributor' | 'retailer' | 'end_user' | 'other';
export type CompanyScale = 'lt10' | 's10_50' | 's51_200' | 's201_500' | 'gt500';
export type DecisionRole = 'decision_maker' | 'influencer' | 'technical' | 'purchasing' | 'gatekeeper' | 'user' | 'other';
export type FollowUpType = 'email' | 'phone' | 'whatsapp' | 'wechat' | 'meeting' | 'visit' | 'note' | 'system';
export type PoolAction = 'recycle' | 'claim' | 'assign' | 'release';
export type EmailDirection = 'in' | 'out';
export type AccountStatus = 'active' | 'error' | 'disabled';
export type NotifyType = 'followup_due' | 'unreplied' | 'pool_recycled' | 'pool_claimed' | 'shared' | 'system';

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: 'active' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface OrgSettings {
  org_id: string;
  recycle_days: number;
  max_private_customers: number;
  protection_days: number;
  unreplied_remind_days: number;
  updated_at: string;
}

export interface Customer {
  id: string;
  org_id: string;
  company_name: string;
  company_name_en: string | null;
  website: string | null;
  website_domain?: string;
  country: string | null;
  region: string | null;
  company_type: CompanyType;
  company_scale: CompanyScale;
  industry: string | null;
  main_products: string | null;
  address: string | null;
  grade: CustomerGrade;
  star_level: number;
  source: CustomerSource;
  status: CustomerStatus;
  owner_id: string | null;
  in_pool: boolean;
  pool_entered_at: string | null;
  claimed_at: string | null;
  protection_until: string | null;
  closeness_score: number | null;
  match_score: number | null;
  activity_score: number | null;
  completeness_score: number | null;
  last_follow_up_at: string | null;
  next_follow_up_at: string | null;
  last_contact_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  org_id: string;
  customer_id: string;
  name: string;
  name_en: string | null;
  position: string | null;
  decision_role: DecisionRole;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  wechat: string | null;
  is_primary: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface Tag {
  id: string;
  org_id: string;
  name: string;
  color: string;
}

export interface Group {
  id: string;
  org_id: string;
  name: string;
  color: string;
}

export interface FollowUp {
  id: string;
  org_id: string;
  customer_id: string;
  contact_id: string | null;
  type: FollowUpType;
  content: string;
  contacted_at: string;
  next_follow_up_at: string | null;
  created_by: string;
  created_at: string;
}

export interface CustomerShare {
  id: string;
  org_id: string;
  customer_id: string;
  shared_by: string;
  shared_with: string;
  permission: 'view' | 'edit';
  created_at: string;
}

export interface PoolRecord {
  id: string;
  org_id: string;
  customer_id: string;
  action: PoolAction;
  from_user_id: string | null;
  to_user_id: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export interface Notification {
  id: string;
  org_id: string;
  user_id: string;
  type: NotifyType;
  title: string;
  content: string | null;
  customer_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface EmailAccount {
  id: string;
  org_id: string;
  user_id: string;
  label: string;
  email: string;
  imap_host: string;
  imap_port: number;
  use_ssl: boolean;
  username: string;
  vault_secret_name: string;
  status: AccountStatus;
  last_sync_at: string | null;
  last_uid: number;
  sync_error: string | null;
  created_at: string;
}

export interface EmailMessage {
  id: string;
  org_id: string;
  account_id: string;
  customer_id: string | null;
  contact_id: string | null;
  message_id: string;
  uid: number;
  folder: string;
  direction: EmailDirection;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body_text: string | null;
  snippet: string | null;
  received_at: string;
  is_read: boolean;
  matched_by: string | null;
  created_at: string;
}

export interface TimelineItem {
  id: string;
  customer_id: string;
  kind: 'email' | 'followup' | 'pool';
  title: string;
  summary: string | null;
  occurred_at: string;
  created_by: string | null;
}

export interface DashboardSummary {
  total_customers: number;
  my_customers: number;
  pool_customers: number;
  due_today: number;
  overdue: number;
  new_trend: { month: string; count: number }[];
  source_dist: { name: string; value: number }[];
  grade_dist: { name: string; value: number }[];
  status_dist: { name: string; value: number }[];
  followup_ranking: { name: string; count: number }[];
}
