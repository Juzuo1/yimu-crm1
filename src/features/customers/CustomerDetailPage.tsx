import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tabs, Space, Button, Rate, Empty, App,
  Table, Modal, Select, Popconfirm, Progress,
} from 'antd';
import {
  EditOutlined, PlusOutlined, ShareAltOutlined, UserSwitchOutlined,
  RollbackOutlined, DownloadOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import { supabase } from '@/lib/supabase';
import type {
  Customer, TimelineItem, EmailMessage, PoolRecord, CustomerShare, Profile,
} from '@/lib/database.types';
import {
  STATUS_LABELS, SOURCE_LABELS,
  COMPANY_TYPE_LABELS, COMPANY_SCALE_LABELS, FOLLOWUP_TYPE_LABELS, POOL_ACTION_LABELS,
} from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';
import ContactsCard from './ContactsCard';
import FollowUpFormModal from '@/features/followups/FollowUpFormModal';
import dayjs from 'dayjs';

const GRADE_CHIP: Record<string, string> = {
  S: 'chip chip-danger',
  A: 'chip chip-warn',
  B: 'chip chip-brand',
  C: 'chip',
  D: 'chip',
};
const STATUS_CHIP: Record<string, string> = {
  active: 'chip chip-ok',
  dormant: 'chip chip-warn',
  lost: 'chip chip-danger',
};

function initials(name: string) {
  const clean = name.replace(/[^\p{L}\p{N}]/gu, '');
  return clean.slice(0, 2).toUpperCase() || '--';
}

function Kpi({ label, value, danger }: { label: string; value: React.ReactNode; danger?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#9aa7b8' }}>{label}</div>
      <div style={{ fontSize: 14, color: danger ? '#b32424' : '#0A2540', marginTop: 3, fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { profile } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [poolRecords, setPoolRecords] = useState<PoolRecord[]>([]);
  const [shares, setShares] = useState<CustomerShare[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<string>();
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');
  const [assignTarget, setAssignTarget] = useState<string>();

  const isManager = profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'manager';
  const canWrite = isManager || customer?.owner_id === profile?.id;

  const loadAll = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
    if (error || !data) {
      message.error('客户不存在或无权访问');
      navigate('/customers');
      return;
    }
    setCustomer(data as Customer);

    const [{ data: tl }, { data: em }, { data: pr }, { data: sh }, { data: mem }] = await Promise.all([
      supabase.from('customer_timeline').select('*').eq('customer_id', id).order('occurred_at', { ascending: false }).limit(100),
      supabase.from('email_messages').select('*').eq('customer_id', id).order('received_at', { ascending: false }).limit(100),
      supabase.from('pool_records').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('customer_shares').select('*, shared:profiles!customer_shares_shared_with_fkey(name)').eq('customer_id', id),
      supabase.from('profiles').select('*'),
    ]);
    setTimeline((tl as TimelineItem[]) ?? []);
    setEmails((em as EmailMessage[]) ?? []);
    setPoolRecords((pr as PoolRecord[]) ?? []);
    setShares((sh as (CustomerShare & { shared: { name: string } })[]) ?? []);
    setMembers((mem as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [id]);

  const handleShare = async () => {
    if (!shareTarget) return;
    const { error } = await supabase.from('customer_shares').insert({
      org_id: customer!.org_id,
      customer_id: customer!.id,
      shared_by: profile!.id,
      shared_with: shareTarget,
      permission: sharePermission,
    });
    if (error) message.error(error.message);
    else {
      message.success('已共享');
      setShareOpen(false);
      loadAll();
    }
  };

  const handleUnshare = async (shareId: string) => {
    await supabase.from('customer_shares').delete().eq('id', shareId);
    message.success('已取消共享');
    loadAll();
  };

  const handleAssign = async () => {
    if (!assignTarget) return;
    const { error } = await supabase.rpc('assign_customer', {
      p_customer_id: customer!.id,
      p_user_id: assignTarget,
    });
    if (error) message.error(error.message);
    else {
      message.success('已分配');
      setAssignOpen(false);
      loadAll();
    }
  };

  const handleClaim = async () => {
    const { error } = await supabase.rpc('claim_customer', { p_customer_id: customer!.id });
    if (error) message.error(error.message);
    else {
      message.success('领取成功');
      loadAll();
    }
  };

  const handleRelease = async () => {
    const { error } = await supabase.rpc('release_customer', { p_customer_id: customer!.id });
    if (error) message.error(error.message);
    else {
      message.success('已退回公海');
      loadAll();
    }
  };

  if (loading || !customer) {
    return <div className="page-container"><Card loading style={{ borderRadius: 12 }} /></div>;
  }

  const ownerName = members.find((m) => m.id === customer.owner_id)?.name ?? '—';
  const followupCount = timeline.filter((t) => t.kind === 'followup').length;
  const overdue = customer.next_follow_up_at
    ? dayjs(customer.next_follow_up_at).isBefore(dayjs())
    : false;

  return (
    <div className="page-container">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/customers')}
        style={{ color: '#9aa7b8', marginBottom: 10, paddingLeft: 0 }}
      >
        返回客户列表
      </Button>

      <div className="ui-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 0 }}>
            <div className="avatar-brand" style={{ width: 48, height: 48, borderRadius: 12, fontSize: 16 }}>
              {initials(customer.company_name)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#0A2540', letterSpacing: '-0.3px' }}>
                {customer.company_name}
              </div>
              <div style={{ fontSize: 13, color: '#7d8a9c', marginTop: 2 }}>
                {[customer.country, customer.industry,
                  COMPANY_SCALE_LABELS[customer.company_scale]].filter(Boolean).join(' · ') || customer.company_name_en || '—'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span className={GRADE_CHIP[customer.grade] ?? 'chip'}>{customer.grade} 级</span>
                <span className={STATUS_CHIP[customer.status] ?? 'chip'}>{STATUS_LABELS[customer.status]}</span>
                <span className="chip">{SOURCE_LABELS[customer.source]}</span>
                {customer.in_pool
                  ? <span className="chip chip-brand">公海</span>
                  : <span className="chip chip-ok">私海</span>}
              </div>
            </div>
          </div>

          <Space wrap>
            <Button
              icon={<PlusOutlined />}
              type="primary"
              onClick={() => setFollowUpOpen(true)}
              disabled={!canWrite}
            >
              记录跟进
            </Button>
            <Button icon={<EditOutlined />} onClick={() => navigate(`/customers/${customer.id}/edit`)} disabled={!canWrite}>
              编辑
            </Button>
            {customer.in_pool && (
              <Button icon={<DownloadOutlined />} onClick={handleClaim}>领取</Button>
            )}
            {!customer.in_pool && (customer.owner_id === profile?.id || isManager) && (
              <Popconfirm title="退回后将释放归属，确定退回公海？" onConfirm={handleRelease}>
                <Button icon={<RollbackOutlined />}>退回公海</Button>
              </Popconfirm>
            )}
            {isManager && !customer.in_pool && (
              <Button icon={<UserSwitchOutlined />} onClick={() => setAssignOpen(true)}>转交</Button>
            )}
            <Button
              icon={<ShareAltOutlined />}
              onClick={() => setShareOpen(true)}
              disabled={!isManager && customer.owner_id !== profile?.id}
            >
              共享
            </Button>
          </Space>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: 16,
            marginTop: 16,
            paddingTop: 14,
            borderTop: '1px solid #f0f3f7',
          }}
        >
          <Kpi label="负责人" value={customer.in_pool ? '公海' : ownerName} />
          <Kpi label="往来邮件" value={`${emails.length} 封`} />
          <Kpi label="跟进次数" value={`${followupCount} 次`} />
          <Kpi
            label="最近联系"
            value={customer.last_follow_up_at ? dayjs(customer.last_follow_up_at).format('MM-DD') : '—'}
          />
          <Kpi
            label="下次跟进"
            danger={overdue}
            value={customer.next_follow_up_at
              ? `${dayjs(customer.next_follow_up_at).format('MM-DD')}${overdue ? '（逾期）' : ''}`
              : '未设置'}
          />
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'timeline',
            label: `动态时间线（${timeline.length}）`,
            children: (
              <div className="ui-card">
                {timeline.length ? (
                  timeline.map((t, i) => {
                    const color = t.kind === 'email' ? '#378ADD' : t.kind === 'followup' ? '#FF6B35' : '#888780';
                    const label =
                      t.kind === 'email' ? '邮件' :
                      t.kind === 'followup' ? FOLLOWUP_TYPE_LABELS[t.title] ?? t.title :
                      POOL_ACTION_LABELS[t.title] ?? t.title;
                    return (
                      <div className="tl-item" key={t.id ?? i}>
                        <div className="tl-dot" style={{ background: color }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: '#9aa7b8' }}>
                              {dayjs(t.occurred_at).format('YYYY-MM-DD HH:mm')}
                            </span>
                            <span className="chip" style={{ color, background: `${color}14` }}>{label}</span>
                          </div>
                          {t.kind === 'email' && (
                            <>
                              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: '#0A2540' }}>
                                {t.title}
                              </div>
                              {t.summary && (
                                <div style={{ fontSize: 12, color: '#7d8a9c', marginTop: 2 }}>{t.summary}</div>
                              )}
                            </>
                          )}
                          {t.kind === 'followup' && (
                            <div style={{ marginTop: 4, fontSize: 13, whiteSpace: 'pre-wrap', color: '#33445c' }}>
                              {t.summary}
                            </div>
                          )}
                          {t.kind === 'pool' && (
                            <div style={{ marginTop: 4, fontSize: 12, color: '#7d8a9c' }}>{t.summary}</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <Empty description="还没有动态，记录第一条跟进或等待邮件同步" />
                )}
              </div>
            ),
          },
          {
            key: 'contacts',
            label: '联系人',
            children: (
              <div className="ui-card">
                <ContactsCard customerId={customer.id} canWrite={!!canWrite} />
              </div>
            ),
          },
          {
            key: 'emails',
            label: `往来邮件（${emails.length}）`,
            children: (
              <div className="ui-card-compact">
                {emails.length ? (
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 20 }}
                    dataSource={emails}
                    columns={[
                      {
                        title: '方向', dataIndex: 'direction', width: 74,
                        render: (v: string) =>
                          v === 'in'
                            ? <span className="chip">收到</span>
                            : <span className="chip chip-warn">发出</span>,
                      },
                      {
                        title: '时间', dataIndex: 'received_at', width: 150,
                        render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
                      },
                      { title: '发件人', dataIndex: 'from_address', width: 200, ellipsis: true },
                      { title: '主题', dataIndex: 'subject', render: (v: string) => v || '(无主题)' },
                      { title: '摘要', dataIndex: 'snippet', ellipsis: true },
                    ]}
                    expandable={{
                      expandedRowRender: (r) => (
                        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{r.body_text || '(无正文)'}</div>
                      ),
                    }}
                  />
                ) : (
                  <Empty description="暂无邮件，绑定邮箱后往来邮件将自动同步到这里" />
                )}
              </div>
            ),
          },
          {
            key: 'detail',
            label: '档案与评分',
            children: (
              <div className="ui-card">
                <Descriptions column={2} size="small" bordered>
                  <Descriptions.Item label="官网">{customer.website || '-'}</Descriptions.Item>
                  <Descriptions.Item label="国家/地区">{customer.country || '-'}</Descriptions.Item>
                  <Descriptions.Item label="公司类型">{COMPANY_TYPE_LABELS[customer.company_type]}</Descriptions.Item>
                  <Descriptions.Item label="公司规模">{COMPANY_SCALE_LABELS[customer.company_scale]}</Descriptions.Item>
                  <Descriptions.Item label="行业">{customer.industry || '-'}</Descriptions.Item>
                  <Descriptions.Item label="来源渠道">{SOURCE_LABELS[customer.source]}</Descriptions.Item>
                  <Descriptions.Item label="主营产品" span={2}>{customer.main_products || '-'}</Descriptions.Item>
                  <Descriptions.Item label="地址" span={2}>{customer.address || '-'}</Descriptions.Item>
                  <Descriptions.Item label="最近跟进">
                    {customer.last_follow_up_at ? dayjs(customer.last_follow_up_at).format('YYYY-MM-DD HH:mm') : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="下次跟进">
                    {customer.next_follow_up_at ? (
                      <span style={{ color: dayjs(customer.next_follow_up_at).isBefore(dayjs()) ? '#b32424' : undefined }}>
                        {dayjs(customer.next_follow_up_at).format('YYYY-MM-DD HH:mm')}
                      </span>
                    ) : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="备注" span={2}>{customer.notes || '-'}</Descriptions.Item>
                </Descriptions>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20, marginTop: 24 }}>
                  <div>
                    <div style={{ marginBottom: 6, color: '#7d8a9c', fontSize: 13 }}>星级</div>
                    <Rate disabled value={customer.star_level} />
                  </div>
                  <div>
                    <div style={{ marginBottom: 6, color: '#7d8a9c', fontSize: 13 }}>数据完整度</div>
                    <Progress percent={customer.completeness_score ?? 0} strokeColor="#0A2540" />
                  </div>
                  <div>
                    <div style={{ marginBottom: 6, color: '#7d8a9c', fontSize: 13 }}>活跃度</div>
                    <Progress percent={customer.activity_score ?? 0} strokeColor="#FF6B35" />
                  </div>
                </div>
              </div>
            ),
          },
          {
            key: 'shares',
            label: `共享与归属（${shares.length}）`,
            children: (
              <div className="ui-card">
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={shares}
                  columns={[
                    { title: '共享给', dataIndex: 'shared.name' },
                    {
                      title: '权限', dataIndex: 'permission',
                      render: (v: string) => <span className="chip">{v === 'edit' ? '可编辑' : '仅查看'}</span>,
                    },
                    {
                      title: '操作', key: 'action',
                      render: (_: unknown, r: CustomerShare) => (
                        <Popconfirm title="取消共享？" onConfirm={() => handleUnshare(r.id)}>
                          <Button type="link" size="small" danger>取消共享</Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
                <div style={{ marginTop: 24 }}>
                  <div className="section-title" style={{ marginBottom: 10 }}>归属变动记录</div>
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={poolRecords}
                    columns={[
                      {
                        title: '动作', dataIndex: 'action',
                        render: (v: string) => <span className="chip">{POOL_ACTION_LABELS[v] ?? v}</span>,
                      },
                      { title: '原因', dataIndex: 'reason', render: (v: string) => v || '-' },
                      {
                        title: '时间', dataIndex: 'created_at',
                        render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
                      },
                    ]}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />

      <FollowUpFormModal
        open={followUpOpen}
        customerId={customer.id}
        customerName={customer.company_name}
        onSuccess={() => { setFollowUpOpen(false); loadAll(); }}
        onCancel={() => setFollowUpOpen(false)}
      />

      <Modal
        open={shareOpen}
        title="共享客户给同事"
        okText="共享"
        cancelText="取消"
        onOk={handleShare}
        onCancel={() => setShareOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            showSearch
            placeholder="选择同事"
            style={{ width: '100%' }}
            onChange={setShareTarget}
            options={members.filter((m) => m.id !== profile?.id).map((m) => ({ value: m.id, label: `${m.name}（${m.email}）` }))}
          />
          <Select
            style={{ width: '100%' }}
            value={sharePermission}
            onChange={setSharePermission}
            options={[
              { value: 'view', label: '仅查看' },
              { value: 'edit', label: '可编辑（可录入跟进）' },
            ]}
          />
        </Space>
      </Modal>

      <Modal
        open={assignOpen}
        title="分配客户给业务员"
        okText="分配"
        cancelText="取消"
        onOk={handleAssign}
        onCancel={() => setAssignOpen(false)}
      >
        <Select
          showSearch
          placeholder="选择业务员"
          style={{ width: '100%' }}
          onChange={setAssignTarget}
          options={members.map((m) => ({ value: m.id, label: `${m.name}（${m.email}）` }))}
        />
      </Modal>
    </div>
  );
}
