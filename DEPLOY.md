# 部署手册（小白版 · 每一步都有）

> 目标：不花一分钱，把系统部署到网上，团队通过浏览器访问。
> 全程约 30-40 分钟。如果某一步卡住，把报错截图发给我。

---

## 第一步：创建 Supabase 项目（免费数据库，约 5 分钟）

Supabase 是我们的免费数据库 + 登录系统，相当于系统的"云端大脑"。

1. 打开 https://supabase.com ，点击右上角 **Sign in**，用 GitHub 账号登录（没有 GitHub 就先注册一个）。
2. 登录后点击 **New project**：
   - **Name**：填 `yimu-crm`
   - **Database Password**：点 **Generate a password** 自动生成，**把密码复制保存到记事本**（后面备份功能要用）
   - **Region**：选 **Singapore**（离国内近，访问快）
   - **Pricing Plan**：保持 **Free**
3. 点击 **Create new project**，等待 1-2 分钟出现项目界面。

### 记下两个关键信息

1. 点击左下角齿轮 **Project Settings** → **API**：
   - **Project URL**（形如 `https://abcdefgh.supabase.co`）→ 复制保存
   - **anon public** key（一长串字符）→ 复制保存
2. 同时记下 **Project URL 中的项目 ref**（就是 `abcdefgh` 那一段，备份和邮件同步要用）。

> 这两个信息等会儿要填到 GitHub 里。anon key 是设计上公开的，不用担心泄露，数据安全由数据库规则保护。

---

## 第二步：创建数据库表（约 3 分钟）

1. 在 Supabase 项目左侧菜单，点击 **SQL Editor**（图标是一个 `>` 符号）。
2. 点击 **New query**。
3. 打开本项目里的 `supabase-all-in-one.sql` 文件，**全选复制**（约 950 行），粘贴到 SQL Editor 的输入框里。
4. 点击右下角 **Run**（或按 Ctrl+Enter）。
5. 看到 **Success. No rows returned** 就是成功了。

> 这一步会一次性创建所有表、安全规则和定时任务。如果报错，把红色错误信息发给我。

---

## 第三步：把代码传到 GitHub（约 10 分钟）

### 3.1 在 GitHub 上创建仓库

1. 打开 https://github.com 登录，点击右上角 **+** → **New repository**。
2. 填写：
   - **Repository name**：`yimu-crm`
   - 选 **Public**（GitHub Pages 免费版要求公开仓库；系统没有密钥，客户数据在 Supabase 里，不在代码里）
   - **不要**勾选 "Add a README file"（我们本地已有）
3. 点击 **Create repository**。

### 3.2 上传代码

如果你电脑上已经会 `git`，在项目文件夹执行：

```bash
git init
git add .
git commit -m "YIMU 外贸客户管理系统 V1"
git branch -M main
git remote add origin https://github.com/你的GitHub用户名/yimu-crm.git
git push -u origin main
```

> 不会用命令行？在仓库页面点 **uploading an existing file**，把项目文件夹里的**所有文件**拖进去上传（node_modules 文件夹不要传），点 **Commit changes**。

---

## 第四步：开启 GitHub Pages 自动部署（约 5 分钟）

1. 在仓库页面点击 **Settings** → 左侧 **Pages**。
2. **Source** 选择 **GitHub Actions**。
3. 点击左侧 **Secrets and variables** → **Actions** → **New repository secret**，添加两个密钥（名称必须一字不差）：

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | 第一步记下的 Project URL |
   | `VITE_SUPABASE_ANON_KEY` | 第一步记下的 anon key |

4. 再添加两个（备份和邮件同步用）：

   | Name | Value |
   |---|---|
   | `SUPABASE_DB_URL` | `postgresql://postgres.你的项目ref:数据库密码@aws-0-singapore.pooler.supabase.com:5432/postgres`（密码用第一步保存的；Region 不同则地址不同，不确定就在 Supabase → Project Settings → Database → Connection string → Session pooler 里复制） |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API 里的 **service_role** key（⚠️ 这个 key 权限极大，只能放 Secrets，绝不能发给别人或写进代码） |

5. 添加完成后，去仓库 **Actions** 页面，应该能看到 **Deploy to GitHub Pages** 正在运行（黄点）。等 1-2 分钟变成绿色 ✓。
6. 访问地址：`https://你的GitHub用户名.github.io/yimu-crm/` —— 看到登录页就成功了！

> 以后每次更新代码，`git push` 后会自动重新部署，无需其他操作。

---

## 第五步：注册第一个账号（约 2 分钟）

1. 打开你的网站地址，点击 **注册（需邀请）**。
2. **第一个注册的账号自动成为「老板」**（管理员），请用你自己的邮箱。
3. 注册成功后自动登录，进入工作台。

---

## 第六步：邀请同事（约 2 分钟）

1. 用老板账号登录，右上角头像 → **成员与角色**。
2. 点 **邀请成员**，填同事邮箱、选角色（主管/业务员）。
3. 同事打开网站点 **注册**，用被邀请的邮箱注册即可自动加入。

**角色权限说明**：
| 角色 | 能做什么 |
|---|---|
| 老板 / 管理员 | 一切 + 管理成员、改规则 |
| 主管 | 看全部客户、分配客户、改规则 |
| 业务员 | 看自己的客户 + 公海，录入跟进 |

---

## 第七步：绑定邮箱，开启自动同步（约 5 分钟，可稍后）

1. 右上角头像 → **邮箱绑定** → **绑定邮箱**。
2. 选择邮箱服务商（自动填服务器），填邮箱地址和**授权码**。
3. 授权码获取方法（以 QQ 邮箱为例）：QQ 邮箱 → 设置 → 账号与安全 → IMAP/SMTP 服务 → 开启 → 生成授权码。
4. 绑定后 15 分钟内，系统自动开始同步往来邮件。

**定时同步已默认配置**：仓库里的 GitHub Actions 每 15 分钟自动运行一次（无需任何操作）。

---

## 日常使用速查

| 我想... | 怎么做 |
|---|---|
| 录入新客户 | 客户管理 → 新建客户（系统自动查重防撞单） |
| 记录一次跟进 | 客户详情 → 记录跟进（可设下次跟进时间） |
| 看今天要联系谁 | 跟进中心 → 今日待跟进 |
| 从公海捞客户 | 公海客户 → 领取 |
| 看数据统计 | 工作台（图表自动更新） |
| 客户邮件自动归档 | 绑定邮箱后全自动 |

---

## 常见问题

**Q: 网站打不开，显示 Supabase 相关错误？**
A: 免费 Supabase 项目 7 天完全没人访问会被暂停。仓库已配置每 3 天自动探活；如果还是被暂停，去 Supabase 项目页面点 **Restore project** 即可恢复，数据不丢。

**Q: 想备份数据？**
A: 仓库已配置每周日自动备份（Actions → Weekly DB Backup，保留 90 天）。也可随时手动运行：Actions → Weekly DB Backup → Run workflow。

**Q: 邮件不同步？**
A: 检查 ①邮箱绑定页是否显示"异常"（有红色错误说明授权码或服务器不对）②Actions → IMAP Sync 是否在正常运行（公开仓库 60 天无代码提交会被禁用，点一下 Enable 恢复）。

**Q: 以后想加商机/报价/订单功能？**
A: 数据库已预留组织架构，二期直接扩展即可，数据不受影响。

---

## 系统维护备忘（给未来的自己）

- 代码更新：改代码 → `git push` → 自动部署
- 数据库结构变更：新 SQL 在 Supabase → SQL Editor 里粘贴执行
- 邮箱授权码过期：邮箱绑定页解绑后重新绑定
- 想换界面品牌色：`src/theme.ts` 里改 `colorPrimary` 等值
