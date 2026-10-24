# YIMU 外贸客户管理系统

参照 OKKI 客户管理模块打造的外贸客户管理系统，**全免费、零服务器**部署方案。

## 核心功能（V1）

- **客户档案**：企业中英文名、官网、国家、类型、规模、行业、主营产品、等级（S/A/B/C/D）、星级、来源渠道、状态
- **360° 客户视图**：档案 + 联系人 + 跟进记录 + 往来邮件 + 公海变动，一个页面看全部动态
- **跟进管理**：跟进记录（邮件/电话/WhatsApp/拜访）、下次跟进提醒、今日待跟进、站内通知
- **公海机制**：超期未跟进自动回收、领取（行锁防撞单）、保护期、私海上限、变动记录
- **防撞单**：新建客户自动查重（公司名/域名/邮箱相似度）
- **IMAP 邮件同步**：绑定邮箱后自动拉取往来邮件，按域名/邮箱自动关联客户
- **数据看板**：客户增长趋势、来源/等级/状态分布、业务员跟进统计
- **多团队架构**：四级角色（老板/管理员/主管/业务员）、邀请制注册、行级数据隔离

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + ECharts |
| 后端/数据库 | Supabase 免费层（PostgreSQL + Auth + RLS + pg_cron + Vault） |
| 部署 | GitHub Pages + GitHub Actions |
| 邮件同步 | imapflow（Edge Function 或 GitHub Actions Worker） |

## 快速开始（开发）

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制 .env.example 为 .env，填入 Supabase 项目信息）
cp .env.example .env

# 3. 启动开发服务器
npm run dev
```

## 部署

详见 [DEPLOY.md](./DEPLOY.md)——从零开始、每一步都有截图级说明，全程不需要买服务器。

## 目录结构

```
├── .github/workflows/    # CI/CD：部署 / 探活 / 备份 / 邮件同步
├── public/               # 静态资源（404 兜底页、favicon）
├── src/                  # 前端源码
│   ├── lib/              # supabase 客户端、类型、常量
│   ├── hooks/            # useAuth 等通用 hooks
│   ├── components/       # 通用组件
│   ├── layouts/          # 主布局（侧边导航 + 顶栏）
│   └── features/         # 业务模块（auth/customers/pool/followups/emails/dashboard/settings）
├── supabase/
│   ├── migrations/       # 数据库迁移（0001~0008）
│   └── functions/        # Edge Function（imap-sync）
├── workers/imap-sync/    # 邮件同步 Node Worker（备选路径）
└── supabase-all-in-one.sql  # 全部迁移合并单文件（控制台粘贴执行）
```

## 安全设计

- 所有表启用 RLS（行级安全），默认拒绝、显式放行，团队成员只能看到授权数据
- 客户归属变更（领取/回收/分配）只能通过带行锁的存储过程，前端无法直接篡改
- IMAP 邮箱授权码加密存入 Supabase Vault，不明文落库
