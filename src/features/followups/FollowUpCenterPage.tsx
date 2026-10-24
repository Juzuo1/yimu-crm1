import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card, Table, Tabs, Button, Space, Tag, Empty, App,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Customer } from '@/lib/database.types';
import { GRADE_COLORS, FOLLOWUP_TYPE_LABELS } from '@/lib/constants';
import FollowUpFormModal from './FollowUpFormModal';
import dayjs from 'dayjs';

type TabKey = 'today' | 'overdue' | 'upcoming' | 'shared';

export default function FollowUpCenterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { profile } = useAuth();
  const [tab, setTab] = useState<TabKey>('today');
  const [followUpCustomer, setFollowUpCustomer] = useState<Customer | null>(null);

  const { data: todayList = [], isLoading: l1 } = useQuery({
    queryKey: ['followups-today'],
    queryFn: async () => {
      const start = dayjs().startOf('day').toISOString();
      const end = dayjs().endOf('day').toISOString();
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('owner_id', profile!.id)
        .gte('next_follow_up_at', start)
        .lte('next_follow_up_at', end)
        .order('next_follow_up_at');
      return (data as Customer[]) ?? [];
    },
  });

  const { data: overdueList = [], isLoading: l2 } = useQuery({
    queryKey: ['followups-overdue'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('owner_id', profile!.id)
        .lt('next_follow_up_at', dayjs().startOf('day').toISOString())
        .order('next_follow_up_at');
      return (data as Customer[]) ?? [];
    },
  });

  const { data: upcomingList = [], isLoading: l3 } = useQuery({
    queryKey: ['followups-upcoming'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('owner_id', profile!.id)
        .gt('next_follow_up_at', dayjs().endOf('day').toISOString())
        .order('next_follow_up_at');
      return (data as Customer[]) ?? [];
    },
  });

  const { data: sharedList = [], isLoading: l4 } = useQuery({
    queryKey: ['followups-shared'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customer_shares')
        .select('customer:customers!customer_shares_customer_id_fkey(*)')
        .eq('shared_with', profile!.id);
      return ((data ?? []) as unknown as { customer: Customer }[]).map((r) => r.customer);
    },
  });

  const renderTable = (list: Customer[], loading: boolean) => (
    <Table
      rowKey="id"
      loading={loading}
      pagination={false}
      dataSource={list}
      locale={{ emptyText: <Empty description="太棒了，这里空空如也" /> }}
      columns={[
        {
          title: '公司名称', dataIndex: 'company_name',
          render: (v: string, r) => (
            <a onClick={() => navigate(`/customers/${r.id}`)}>
              <span className="grade-dot" style={{ background: GRADE_COLORS[r.grade] }} />
              {v}
            </a>
          ),
        },
        { title: '国家', dataIndex: 'country', render: (v: string) => v || '-' },
        {
          title: '下次跟进时间', dataIndex: 'next_follow_up_at',
          render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
        },
        {
          title: '操作', key: 'action', width: 160,
          render: (_: unknown, r) => (
            <Space>
              <Button type="link" size="small" onClick={() => navigate(`/customers/${r.id}`)}>详情</Button>
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setFollowUpCustomer(r)}
              >
                记跟进
              </Button>
            </Space>
          ),
        },
      ]}
    />
  );

  return (
    <PageContainer title="跟进中心">
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          items={[
            {
              key: 'today',
              label: (
                <span>
                  今日待跟进
                  {todayList.length > 0 && (
                    <Tag color="orange" style={{ marginLeft: 6 }}>{todayList.length}</Tag>
                  )}
                </span>
              ),
              children: renderTable(todayList, l1),
            },
            {
              key: 'overdue',
              label: (
                <span>
                  已逾期
                  {overdueList.length > 0 && (
                    <Tag color="red" style={{ marginLeft: 6 }}>{overdueList.length}</Tag>
                  )}
                </span>
              ),
              children: (
                <div>
                  {overdueList.length > 0 && (
                    <div style={{ marginBottom: 12, color: '#ff4d4f', fontSize: 13 }}>
                      这些客户已错过计划跟进时间，请尽快联系，避免被回收进公海。
                    </div>
                  )}
                  {renderTable(overdueList, l2)}
                </div>
              ),
            },
            { key: 'upcoming', label: '未来计划', children: renderTable(upcomingList, l3) },
            { key: 'shared', label: `同事共享给我（${sharedList.length}）`, children: renderTable(sharedList, l4) },
          ]}
        />
      </Card>

      {followUpCustomer && (
        <FollowUpFormModal
          open
          customerId={followUpCustomer.id}
          customerName={followUpCustomer.company_name}
          onSuccess={() => setFollowUpCustomer(null)}
          onCancel={() => setFollowUpCustomer(null)}
        />
      )}
    </PageContainer>
  );
}
