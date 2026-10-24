import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Table, Input, Select, Space, Button, Tag, App, Card, Row, Col,
} from 'antd';
import { PlusOutlined, ExportOutlined } from '@ant-design/icons';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import type { Customer, Profile } from '@/lib/database.types';
import {
  GRADE_COLORS, GRADE_LABELS, STATUS_LABELS, STATUS_COLORS, SOURCE_LABELS, PAGE_SIZE,
} from '@/lib/constants';
import dayjs from 'dayjs';

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
        title: '公司名称',
        dataIndex: 'company_name',
        width: 240,
        fixed: 'left' as const,
        render: (v: string, r: Customer) => (
          <Space direction="vertical" size={0}>
            <a onClick={() => navigate(`/customers/${r.id}`)}>
              <span className="grade-dot" style={{ background: GRADE_COLORS[r.grade] }} />
              {v}
            </a>
            {r.company_name_en && (
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>{r.company_name_en}</span>
            )}
          </Space>
        ),
      },
      { title: '国家/地区', dataIndex: 'country', width: 100, render: (v: string) => v || '-' },
      {
        title: '等级', dataIndex: 'grade', width: 70,
        render: (v: string) => <Tag color={GRADE_COLORS[v]}>{v}</Tag>,
      },
      {
        title: '状态', dataIndex: 'status', width: 80,
        render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v]}</Tag>,
      },
      {
        title: '来源', dataIndex: 'source', width: 100,
        render: (v: string) => SOURCE_LABELS[v],
      },
      {
        title: '归属', dataIndex: 'owner', width: 100,
        render: (v: { name: string } | null, r: Customer) =>
          r.in_pool ? <Tag>公海</Tag> : v?.name ?? '-',
      },
      {
        title: '最近跟进', dataIndex: 'last_follow_up_at', width: 110,
        render: (v: string) => (v ? dayjs(v).format('MM-DD HH:mm') : '-'),
      },
      {
        title: '下次跟进', dataIndex: 'next_follow_up_at', width: 110,
        render: (v: string) =>
          v ? (
            <span style={{ color: dayjs(v).isBefore(dayjs()) ? '#ff4d4f' : undefined }}>
              {dayjs(v).format('MM-DD HH:mm')}
            </span>
          ) : '-',
      },
      {
        title: '操作', key: 'action', width: 100, fixed: 'right' as const,
        render: (_: unknown, r: Customer) => (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => navigate(`/customers/${r.id}`)}>详情</Button>
            <Button type="link" size="small" onClick={() => navigate(`/customers/${r.id}/edit`)}>编辑</Button>
          </Space>
        ),
      },
    ],
    [navigate]
  );

  return (
    <PageContainer
      title="客户管理"
      extra={
        <Space>
          <Button icon={<ExportOutlined />} onClick={exportCsv}>导出 CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/customers/new')}>
            新建客户
          </Button>
        </Space>
      }
    >
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Input.Search
              allowClear
              placeholder="搜索公司名 / 英文名 / 域名"
              onSearch={(v) => { setKeyword(v); setPage(1); }}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select allowClear placeholder="等级" style={{ width: '100%' }} onChange={(v) => { setGrade(v); setPage(1); }}
              options={Object.entries(GRADE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select allowClear placeholder="状态" style={{ width: '100%' }} onChange={(v) => { setStatus(v); setPage(1); }}
              options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select allowClear placeholder="来源" style={{ width: '100%' }} onChange={(v) => { setSource(v); setPage(1); }}
              options={Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select allowClear placeholder="归属人" style={{ width: '100%' }} onChange={(v) => { setOwner(v); setPage(1); }}
              options={[
                { value: '__me__', label: '我的客户' },
                { value: '__pool__', label: '公海客户' },
                ...members.map((m) => ({ value: m.id, label: m.name })),
              ]} />
          </Col>
        </Row>
      </Card>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.rows ?? []}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 个客户`,
          showSizeChanger: false,
        }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
      />
    </PageContainer>
  );
}
