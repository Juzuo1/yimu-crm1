import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Table, Input, Select, Space, Button, App, Row, Col } from 'antd';
import { PlusOutlined, ExportOutlined } from '@ant-design/icons';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import type { Customer, Profile } from '@/lib/database.types';
import {
  GRADE_LABELS, STATUS_LABELS, SOURCE_LABELS, PAGE_SIZE,
} from '@/lib/constants';
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

function followText(v: string | null | undefined) {
  if (!v) return <span style={{ color: '#c2cad6' }}>—</span>;
  const d = dayjs(v);
  const days = d.startOf('day').diff(dayjs().startOf('day'), 'day');
  if (days < 0) return <span style={{ color: '#b32424', fontWeight: 500 }}>逾期 {Math.abs(days)} 天</span>;
  if (days === 0) return <span style={{ color: '#0A2540', fontWeight: 500 }}>今天</span>;
  return <span style={{ color: '#5a6b80' }}>{days} 天后</span>;
}

export default function CustomerListPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [grade, setGrade] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [source, setSource] = useState<string | undefined>();
  const [owner, setOwner] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', keyword, grade, status, source, owner, page],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*, owner:profiles!customers_owner_id_fkey(name)', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (keyword) {
        query = query.or(`company_name.ilike.%${keyword}%,company_name_en.ilike.%${keyword}%,website_domain.ilike.%${keyword}%`);
      }
      if (grade) query = query.eq('grade', grade);
      if (status) query = query.eq('status', status);
      if (source) query = query.eq('source', source);
      if (owner === '__me__') query = query.eq('owner_id', (await supabase.auth.getUser()).data.user!.id);
      else if (owner === '__pool__') query = query.eq('in_pool', true);
      else if (owner) query = query.eq('owner_id', owner);

      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data as (Customer & { owner: { name: string } | null })[], total: count ?? 0 };
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['customer-stats'],
    queryFn: async () => {
      const monthStart = dayjs().startOf('month').toISOString();
      const [total, month, overdue, pool] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('customers').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        supabase.from('customers').select('*', { count: 'exact', head: true })
          .lt('next_follow_up_at', new Date().toISOString()),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('in_pool', true),
      ]);
      return {
        total: total.count ?? 0,
        month: month.count ?? 0,
        overdue: overdue.count ?? 0,
        pool: pool.count ?? 0,
      };
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name');
      return data as Profile[];
    },
  });

  const exportCsv = () => {
    const rows = data?.rows ?? [];
    if (!rows.length) {
      message.warning('当前没有数据可导出');
      return;
    }
    const headers = ['公司名称', '英文名称', '国家', '等级', '来源', '状态', '归属人', '官网', '最近跟进', '下次跟进'];
    const lines = rows.map((c) => [
      c.company_name, c.company_name_en ?? '', c.country ?? '', c.grade,
      SOURCE_LABELS[c.source], STATUS_LABELS[c.status], c.owner?.name ?? '公海',
      c.website ?? '', c.last_follow_up_at ? dayjs(c.last_follow_up_at).format('YYYY-MM-DD') : '',
      c.next_follow_up_at ? dayjs(c.next_follow_up_at).format('YYYY-MM-DD') : '',
    ]);
    const csv = '\uFEFF' + [headers, ...lines].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `客户列表_${dayjs().format('YYYYMMDD')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    message.success(`已导出 ${rows.length} 条客户`);
  };

  const columns = useMemo(
    () => [
      {
        title: '客户',
        dataIndex: 'company_name',
        width: 260,
        fixed: 'left' as const,
        render: (v: string, r: Customer) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="avatar-brand">{initials(v)}</div>
            <div style={{ minWidth: 0 }}>
              <a
                onClick={() => navigate(`/customers/${r.id}`)}
                style={{ fontSize: 14, fontWeight: 500, color: '#0A2540' }}
              >
                {v}
              </a>
              <div style={{ fontSize: 12, color: '#9aa7b8' }}>
                {r.website_domain || r.company_name_en || '—'}
              </div>
            </div>
          </div>
        ),
      },
      {
        title: '国家', dataIndex: 'country', width: 100,
        render: (v: string) => <span style={{ color: '#5a6b80' }}>{v || '—'}</span>,
      },
      {
        title: '等级', dataIndex: 'grade', width: 76,
        render: (v: string) => <span className={GRADE_CHIP[v] ?? 'chip'}>{v} 级</span>,
      },
      {
        title: '状态', dataIndex: 'status', width: 88,
        render: (v: string) => <span className={STATUS_CHIP[v] ?? 'chip'}>{STATUS_LABELS[v]}</span>,
      },
      {
        title: '来源', dataIndex: 'source', width: 110,
        render: (v: string) => <span style={{ color: '#5a6b80' }}>{SOURCE_LABELS[v]}</span>,
      },
      {
        title: '负责人', dataIndex: 'owner', width: 110,
        render: (v: { name: string } | null, r: Customer) =>
          r.in_pool
            ? <span className="chip chip-brand">公海</span>
            : <span style={{ color: '#5a6b80' }}>{v?.name ?? '—'}</span>,
      },
      {
        title: '最近联系', dataIndex: 'last_follow_up_at', width: 110,
        render: (v: string) =>
          v ? <span style={{ color: '#5a6b80' }}>{dayjs(v).format('MM-DD')}</span>
            : <span style={{ color: '#c2cad6' }}>—</span>,
      },
      {
        title: '下次跟进', dataIndex: 'next_follow_up_at', width: 110,
        render: (v: string) => followText(v),
      },
      {
        title: '操作', key: 'action', width: 90, fixed: 'right' as const,
        render: (_: unknown, r: Customer) => (
          <Space size={2}>
            <Button
              type="link"
              size="small"
              style={{ color: '#FF6B35', padding: '0 4px' }}
              onClick={() => navigate(`/customers/${r.id}`)}
            >
              跟进
            </Button>
            <Button
              type="link"
              size="small"
              style={{ color: '#9aa7b8', padding: '0 4px' }}
              onClick={() => navigate(`/customers/${r.id}/edit`)}
            >
              编辑
            </Button>
          </Space>
        ),
      },
    ],
    [navigate]
  );

  return (
    <PageContainer
      title="客户管理"
      subtitle={stats ? `共 ${stats.total} 家客户 · 本月新增 ${stats.month} 家` : undefined}
      extra={
        <Space>
          <Button icon={<ExportOutlined />} onClick={exportCsv}>导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/customers/new')}>
            新建客户
          </Button>
        </Space>
      }
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-label">客户总数</div>
            <div className="stat-value">{stats?.total ?? '—'}</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-label">本月新增</div>
            <div className="stat-value" style={{ color: '#1c7a3e' }}>{stats?.month ?? '—'}</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-label">跟进已逾期</div>
            <div className="stat-value" style={{ color: '#b32424' }}>{stats?.overdue ?? '—'}</div>
          </div>
        </Col>
        <Col xs={12} sm={6}>
          <div className="stat-card">
            <div className="stat-label">公海待领取</div>
            <div className="stat-value" style={{ color: '#FF6B35' }}>{stats?.pool ?? '—'}</div>
          </div>
        </Col>
      </Row>

      <div
        className="ui-card-compact"
        style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <Input.Search
          allowClear
          placeholder="搜索公司名 / 英文名 / 域名"
          style={{ width: 260 }}
          onSearch={(v) => { setKeyword(v); setPage(1); }}
        />
        <Select
          allowClear
          placeholder="等级"
          style={{ width: 116 }}
          onChange={(v) => { setGrade(v); setPage(1); }}
          options={Object.entries(GRADE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <Select
          allowClear
          placeholder="状态"
          style={{ width: 116 }}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <Select
          allowClear
          placeholder="来源"
          style={{ width: 132 }}
          onChange={(v) => { setSource(v); setPage(1); }}
          options={Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <Select
          allowClear
          placeholder="负责人"
          style={{ width: 140 }}
          onChange={(v) => { setOwner(v); setPage(1); }}
          options={[
            { value: '__me__', label: '我的客户' },
            { value: '__pool__', label: '公海客户' },
            ...members.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />
      </div>

      <div className="ui-card-compact" style={{ padding: 0, overflow: 'hidden' }}>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data?.rows ?? []}
          scroll={{ x: 1180 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 个客户`,
            showSizeChanger: false,
            style: { padding: '12px 16px', margin: 0 },
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
      </div>
    </PageContainer>
  );
}
