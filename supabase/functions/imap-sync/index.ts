// YIMU CRM IMAP 邮件同步 - Supabase Edge Function（Deno 运行时）
// 触发方式：pg_cron + pg_net 每 15 分钟 POST 一次，或手动 curl 调用
// 部署：npx supabase functions deploy imap-sync --project-ref <你的项目ref>

import { ImapFlow } from 'npm:imapflow@1.0.164';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REST = `${SUPABASE_URL}/rest/v1`;
const RPC = `${SUPABASE_URL}/rest/v1/rpc`;

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const FIRST_SYNC_DAYS = 30;
const OVERLAP_DAYS = 7;
const SENT_FOLDER_NAMES = ['Sent', 'Sent Items', '已发送', 'INBOX.Sent', 'Sent Messages'];

interface EmailAccount {
  id: string;
  email: string;
  username: string;
  imap_host: string;
  imap_port: number;
  use_ssl: boolean;
  vault_secret_name: string;
  last_sync_at: string | null;
}

function log(...args: unknown[]) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function envAddrs(list: { address?: string }[] | undefined): string[] {
  return (list ?? []).map((a) => (a.address ? a.address.toLowerCase() : '')).filter(Boolean);
}

function extractBody(msg: { bodyParts?: Map<string, Uint8Array> }): string {
  if (!msg.bodyParts) return '';
  for (const [, buf] of msg.bodyParts) {
    if (buf && buf.length) {
      return new TextDecoder().decode(buf).replace(/\r\n/g, '\n').trim();
    }
  }
  return '';
}

async function fetchAccounts(): Promise<EmailAccount[]> {
  const res = await fetch(`${REST}/email_accounts?select=*&status=eq.active`, { headers: HEADERS });
  if (!res.ok) throw new Error(`获取邮箱账号失败: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getCredential(secretName: string): Promise<string | null> {
  const res = await fetch(`${RPC}/get_email_credential`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ p_secret_name: secretName }),
  });
  if (!res.ok) throw new Error(`读取授权码失败: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function reportSyncError(accountId: string, errorMsg: string) {
  await fetch(`${REST}/email_accounts?id=eq.${accountId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ status: 'error', sync_error: String(errorMsg).slice(0, 500) }),
  });
}

async function clearSyncError(accountId: string) {
  await fetch(`${REST}/email_accounts?id=eq.${accountId}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify({ status: 'active', sync_error: null }),
  });
}

async function ingest(accountId: string, messages: unknown[]): Promise<number> {
  if (!messages.length) return 0;
  const res = await fetch(`${RPC}/ingest_emails`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ p_account_id: accountId, p_messages: messages }),
  });
  if (!res.ok) throw new Error(`入库失败: ${res.status} ${await res.text()}`);
  return Number(await res.text());
}

async function findSentFolder(client: ImapFlow): Promise<string | null> {
  const folders = await client.list();
  for (const f of folders) {
    if (f.flags?.has?.('\\Sent')) return f.path;
  }
  for (const f of folders) {
    if (SENT_FOLDER_NAMES.some((n) => f.path?.toLowerCase().includes(n.toLowerCase()))) return f.path;
  }
  return null;
}

async function syncFolder(client: ImapFlow, folder: string, account: EmailAccount, isSent: boolean) {
  const lock = await client.getMailboxLock(folder);
  try {
    const days = account.last_sync_at ? OVERLAP_DAYS : FIRST_SYNC_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const uids = await client.search({ since }, { uid: true });
    if (!uids || !uids.length) {
      log(`  ${folder}: 没有新邮件`);
      return;
    }

    const messages: unknown[] = [];
    for await (const msg of client.fetch(uids, {
      uid: true, envelope: true, bodyParts: ['text'], flags: true, internalDate: true,
    })) {
      const env = msg.envelope ?? {};
      const fromAddr = envAddrs(env.from)[0] ?? '';
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
  } finally {
    lock.release();
  }
}

async function syncAccount(account: EmailAccount) {
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
    log(`  ✗ ${account.email} 同步失败: ${(err as Error).message}`);
    await reportSyncError(account.id, (err as Error).message);
  } finally {
    try { await client.logout(); } catch { /* 忽略 */ }
  }
}

Deno.serve(async () => {
  try {
    const accounts = await fetchAccounts();
    log(`共 ${accounts.length} 个激活邮箱账号`);
    for (const account of accounts) {
      await syncAccount(account);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('同步失败:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
