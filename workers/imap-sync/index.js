// YIMU CRM IMAP 邮件同步 Worker
// 运行环境：Node 20（GitHub Actions 定时触发）
// 逻辑：读取所有激活的邮箱账号 → 连接 IMAP → 增量拉取新邮件 → 调 ingest_emails RPC 入库

import { ImapFlow } from 'imapflow';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const REST = `${SUPABASE_URL}/rest/v1`;
const RPC = `${SUPABASE_URL}/rest/v1/rpc`;

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// 首次同步只拉最近 30 天；常规每轮回看 7 天（重叠窗口 + message_id 去重，保证不漏不重）
const FIRST_SYNC_DAYS = 30;
const OVERLAP_DAYS = 7;
const SENT_FOLDER_NAMES = ['Sent', 'Sent Items', '已发送', 'INBOX.Sent', 'Sent Messages'];

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function fetchAccounts() {
  const res = await fetch(`${REST}/email_accounts?select=*&status=eq.active`, { headers: HEADERS });
  if (!res.ok) throw new Error(`获取邮箱账号失败: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getCredential(secretName) {
  const res = await fetch(`${RPC}/get_email_credential`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ p_secret_name: secretName }),
  });
  if (!res.ok) throw new Error(`读取授权码失败: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function reportSyncError(accountId, errorMsg) {
  await fetch(`${REST}/email_accounts?id=eq.${accountId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ status: 'error', sync_error: String(errorMsg).slice(0, 500) }),
  });
}

async function clearSyncError(accountId) {
  await fetch(`${REST}/email_accounts?id=eq.${accountId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ status: 'active', sync_error: null }),
  });
}

async function ingest(accountId, messages) {
  if (!messages.length) return 0;
  const res = await fetch(`${RPC}/ingest_emails`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ p_account_id: accountId, p_messages: messages }),
  });
  if (!res.ok) throw new Error(`入库失败: ${res.status} ${await res.text()}`);
  return Number(await res.text());
}

function extractBody(msg) {
  // bodyParts 是 Map：遍历取第一个 text/plain 部分
  if (!msg.bodyParts) return '';
  for (const [, buf] of msg.bodyParts) {
    if (buf && buf.length) return buf.toString('utf8').replace(/\r\n/g, '\n').trim();
  }
  return '';
}

function addrToStr(a) {
  return a && a.address ? a.address.toLowerCase() : '';
}

function envAddrs(list) {
  return (list ?? []).map(addrToStr).filter(Boolean);
}

async function findSentFolder(client) {
  const folders = await client.list();
  for (const f of folders) {
    if (f.flags?.has?.('\\Sent')) return f.path;
  }
  for (const f of folders) {
    if (SENT_FOLDER_NAMES.some((n) => f.path?.toLowerCase().includes(n.toLowerCase()))) return f.path;
  }
  return null;
}

async function syncFolder(client, folder, account, isSent) {
  const lock = await client.getMailboxLock(folder);
  try {
    // 日期窗口策略：首轮拉 FIRST_SYNC_DAYS 天，之后每轮回看 OVERLAP_DAYS 天，
    // 入库时按 message_id 去重（INGBOX/Sent 的 UID 相互独立，无法用单一游标推进）
    const days = account.last_sync_at ? OVERLAP_DAYS : FIRST_SYNC_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const uids = await client.search({ since }, { uid: true });
    if (!uids || !uids.length) {
      log(`  ${folder}: 没有新邮件`);
      return 0;
    }

    const messages = [];
    for await (const msg of client.fetch(uids, {
      uid: true, envelope: true, bodyParts: ['text'], flags: true, internalDate: true,
    })) {
      const env = msg.envelope ?? {};
      const fromAddr = envAddrs(env.from)[0] ?? '';
      // 方向：已发送文件夹 → 发出；收件箱中发件人是自己 → 发出
      const direction = isSent || fromAddr === account.email.toLowerCase() ? 'out' : 'in';
      const receivedAt = msg.internalDate ?? env.date ?? new Date();
      messages.push({
        message_id: env.messageId ?? `<${account.id}-${msg.uid}@local>`,
        uid: msg.uid,
        folder,
        direction,
        from_address: fromAddr,
        from_name: env.from?.[0]?.name ?? null,
        to_addresses: envAddrs(env.to),
        cc_addresses: envAddrs(env.cc),
        subject: env.subject ?? null,
        body_text: extractBody(msg),
        received_at: new Date(receivedAt).toISOString(),
      });
    }

    const inserted = await ingest(account.id, messages);
    log(`  ${folder}: 拉取 ${messages.length} 封，新入库 ${inserted} 封`);
    return inserted;
  } finally {
    lock.release();
  }
}

async function syncAccount(account) {
  log(`同步账号: ${account.email}`);
  const password = await getCredential(account.vault_secret_name);
  if (!password) {
    await reportSyncError(account.id, 'Vault 中未找到授权码，请重新绑定');
    return;
  }

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port || 993,
    secure: account.use_ssl !== false,
    auth: { user: account.username, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');
    await syncFolder(client, 'INBOX', account, false);

    const sentFolder = await findSentFolder(client);
    if (sentFolder) {
      await syncFolder(client, sentFolder, account, true);
    }

    await clearSyncError(account.id);
  } catch (err) {
    log(`  ✗ ${account.email} 同步失败: ${err.message}`);
    await reportSyncError(account.id, err.message);
  } finally {
    try { await client.logout(); } catch { /* 忽略 */ }
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const accounts = await fetchAccounts();
  log(`共 ${accounts.length} 个激活邮箱账号`);
  for (const account of accounts) {
    await syncAccount(account);
  }
  log('本轮同步完成');
}

main().catch((err) => {
  console.error('Worker 运行失败:', err);
  process.exit(1);
});
