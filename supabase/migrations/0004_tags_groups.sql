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
