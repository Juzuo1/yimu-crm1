import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card, Table, Button, Space, Tag, Input, Select, App, Descriptions, Statistic, Row, Col, Alert,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Customer, OrgSettings, Profile } from '@/lib/database.types';
import {
  GRADE_COLORS, SOURCE_LABELS, STATUS_LABELS, PAGE_SIZE,
} from '@/lib/constants';
import dayjs from 'dayjs';

export default function PoolPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [grade, setGrade] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const { data: settings } = useQuery({
    queryKey: ['org-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('org_settings').select('*').single();
      return data as OrgSettings;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['pool-customers', keyword, grade, page],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .eq('in_pool', true)
        .order('pool_entered_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (keyword) query = query.or(`company_name.ilike.%${keyword}%,company_name_en.ilike.%${keyword}%,website_domain.ilike.%${keyword}%`);
      if (grade) query = query.eq('grade', grade);
      const { data, count, error } = await query;
      if (error) throw error;
      return { rows: data as Customer[], total: count ?? 0 };
    },
  });

  // 我的私海数量（对照上限）
  const { data: myPrivateCount = 0 } = useQuery({
    queryKey: ['my-private-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', profile!.id)
        .eq('in_pool', false);
      return count ?? 0;
    },
  });

  const handleClaim = async (customerId: string) => {
    const { error } = await supabase.rpc('claim_customer', { p_customer_id: customerId });
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('领取成功，客户已进入你的私海');
    queryClient.invalidateQueries({ queryKey: ['pool-customers'] });
    queryClient.invalidateQueries({ queryKey: ['my-private-count'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const columns = [
    {
      title: '公司名称',
      dataIndex: 'company_name',
      render: (v: string, r: Customer) => (
        <a onClick={() => navigate(`/customers/${r.id}`)}>
          <span className="grade-dot" style={{ background: GRADE_COLORS[r.grade] }} />
          {v}
        </a>
      ),
    },
    { title: '国家', dataIndex: 'country', width: 100, render: (v: string) => v || '-' },
    {
      title: '等级', dataIndex: 'grade', width: 70,
      render: (v: string) => <Tag color={GRADE_COLORS[v]}>{v}</Tag>,
    },
    {
      title: '来源', dataIndex: 'source', width: 100,
      render: (v: string) => SOURCE_LABELS[v],
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => STATUS_LABELS[v],
    },
    {
      title: '掉入公海时间', dataIndex: 'pool_entered_at', width: 150,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
    },
    {
      title: '操作', key: 'action', width: 110,
      render: (_: unknown, r: Customer) => (
        <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleClaim(r.id)}>
          领取
        </Button>
      ),
    },
  ];

  const nearLimit = settings ? myPrivateCount >= settings.max_private_customers * 0.8 : false;

  return (
    <PageContainer title="公海客户">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="公海规则"
        description={
          <Descriptions column={2} size="small">
            <Descriptions.Item label="自动回收">
              超过 {settings?.recycle_days ?? 30} 天未跟进记录的私海客户，系统每日凌晨自动回收到公海
            </Descriptions.Item>
            <Descriptions.Item label="领取保护期">
              领取后 {settings?.protection_days ?? 7} 天内不会被回收
            </Descriptions.Item>
            <Descriptions.Item label="私海上限">
              每人最多持有 {settings?.max_private_customers ?? 100} 个私海客户
            </Descriptions.Item>
            <Descriptions.Item label="未回复提醒">
              发出邮件超过 {settings?.unreplied_remind_days ?? 3} 天未回复，系统每日提醒
            </Descriptions.Item>
          </Descriptions>
        }
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="公海客户总数" value={data?.total ?? 0} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="我的私海客户"
              value={myPrivateCount}
              suffix={`/ ${settings?.max_private_customers ?? 100}`}
              valueStyle={{ color: nearLimit ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索公司名 / 域名"
            style={{ width: 260 }}
            onSearch={(v) => { setKeyword(v); setPage(1); }}
          />
          <Select
            allowClear
            placeholder="等级"
            style={{ width: 140 }}
            onChange={(v) => { setGrade(v); setPage(1); }}
            options={[
              { value: 'S', label: 'S 级' }, { value: 'A', label: 'A 级' },
              { value: 'B', label: 'B 级' }, { value: 'C', label: 'C 级' }, { value: 'D', label: 'D 级' },
            ]}
          />
        </Space>
      </Card>

      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.rows ?? []}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 个公海客户`,
          showSizeChanger: false,
        }}
      />
    </PageContainer>
  );
}
