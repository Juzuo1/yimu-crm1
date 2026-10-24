// 全站中文枚举映射与常量

export const ROLE_LABELS: Record<string, string> = {
  owner: '老板',
  admin: '管理员',
  manager: '主管',
  sales: '业务员',
};

export const GRADE_LABELS: Record<string, string> = {
  S: 'S 级（重点大客户）',
  A: 'A 级（优质客户）',
  B: 'B 级（潜力客户）',
  C: 'C 级（一般客户）',
  D: 'D 级（低意向）',
};

export const GRADE_COLORS: Record<string, string> = {
  S: '#f5222d',
  A: '#fa8c16',
  B: '#1677ff',
  C: '#8c8c8c',
  D: '#bfbfbf',
};

export const STATUS_LABELS: Record<string, string> = {
  active: '活跃',
  dormant: '沉睡',
  lost: '流失',
};

export const STATUS_COLORS: Record<string, string> = {
  active: '#52c41a',
  dormant: '#faad14',
  lost: '#ff4d4f',
};

export const SOURCE_LABELS: Record<string, string> = {
  alibaba: '阿里国际站',
  exhibition: '展会',
  website: '官网/独立站',
  self_develop: '自主开发',
  referral: '转介绍',
  customs_data: '海关数据',
  other: '其他',
};

export const COMPANY_TYPE_LABELS: Record<string, string> = {
  manufacturer: '工厂',
  trading: '贸易公司',
  distributor: '分销商',
  retailer: '零售商',
  end_user: '终端用户',
  other: '其他',
};

export const COMPANY_SCALE_LABELS: Record<string, string> = {
  lt10: '10 人以下',
  s10_50: '10-50 人',
  s51_200: '51-200 人',
  s201_500: '201-500 人',
  gt500: '500 人以上',
};

export const DECISION_ROLE_LABELS: Record<string, string> = {
  decision_maker: '决策人',
  influencer: '影响者',
  technical: '技术负责人',
  purchasing: '采购执行',
  gatekeeper: '把关人',
  user: '使用人',
  other: '其他',
};

export const FOLLOWUP_TYPE_LABELS: Record<string, string> = {
  email: '邮件',
  phone: '电话',
  whatsapp: 'WhatsApp',
  wechat: '微信',
  meeting: '会议',
  visit: '拜访',
  note: '备注',
  system: '系统',
};

export const POOL_ACTION_LABELS: Record<string, string> = {
  recycle: '自动回收',
  claim: '公海领取',
  assign: '主管分配',
  release: '主动退回',
};

export const NOTIFY_TYPE_LABELS: Record<string, string> = {
  followup_due: '跟进提醒',
  unreplied: '未回复提醒',
  pool_recycled: '回收通知',
  pool_claimed: '分配通知',
  shared: '共享通知',
  system: '系统消息',
};

export const TAG_COLORS = [
  'blue', 'orange', 'red', 'green', 'purple', 'cyan', 'magenta', 'gold',
];

// 常用外贸国家/地区
export const COUNTRIES = [
  '美国', '加拿大', '英国', '德国', '法国', '意大利', '西班牙', '荷兰', '比利时',
  '波兰', '瑞典', '挪威', '丹麦', '芬兰', '瑞士', '奥地利', '澳大利亚', '新西兰',
  '日本', '韩国', '新加坡', '马来西亚', '泰国', '越南', '印度尼西亚', '菲律宾',
  '印度', '阿联酋', '沙特阿拉伯', '南非', '尼日利亚', '肯尼亚', '埃及', '巴西',
  '墨西哥', '阿根廷', '智利', '俄罗斯', '土耳其', '以色列', '其他',
];

// 常见邮箱服务商 IMAP 预设
export const EMAIL_PRESETS = [
  { label: 'QQ 邮箱', host: 'imap.qq.com', port: 993, tip: '需在 QQ 邮箱设置中开启 IMAP 并使用授权码' },
  { label: '163 邮箱', host: 'imap.163.com', port: 993, tip: '需在设置中开启 IMAP 并使用授权码' },
  { label: '腾讯企业邮箱', host: 'imap.exmail.qq.com', port: 993, tip: '使用客户端专用密码或登录密码' },
  { label: '阿里企业邮箱', host: 'imap.mxhichina.com', port: 993, tip: '使用登录密码' },
  { label: 'Gmail', host: 'imap.gmail.com', port: 993, tip: '需开启两步验证并使用应用专用密码' },
  { label: 'Outlook/Hotmail', host: 'outlook.office365.com', port: 993, tip: '使用登录密码或应用密码' },
];

export const PAGE_SIZE = 20;
