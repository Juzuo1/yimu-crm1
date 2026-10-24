import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card, Table, Button, Space, Select, Empty, Tabs, Tag, App, Modal,
} from 'antd';
import { Link } from 'react-router-dom';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import type { Customer, EmailMessage } from '@/lib/database.types';
import { GRADE_COLORS } from '@/lib/constants';
import dayjs from 'dayjs';

export default function EmailCenterPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignEmail, setAssignEmail] = useState<EmailMessage | null>(null);
  const [assignTarget, setAssignTarget] = useState<string>();

  const { data: unmatched = [], isLoading: l1 } = useQuery({
    queryKey: ['unmatched-emails'],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_messages')
        .select('*')
        .is('customer_id', null)
        .order('received_at', { ascending: false })
        .limit(100);
      return (data as EmailMessage[]) ?? [];
    },
  });

  const { data: recent = [], isLoading: l2 } = useQuery({
    queryKey: ['recent-emails'],
    queryFn: async () => {
      const { data } = await supabase
        .from('email_messages')
        .select('*, customer:customers!email_messages_customer_id_fkey(company_name)')
        .not('customer_id', 'is', null)
        .order('received_at', { ascending: false })
        .limit(100);
      return (data as (EmailMessage & { customer: { company_name: string } })[]) ?? [];
    },
  });

  const { data: candidates = [] } = useQuery({
    queryKey: ['email-assign-candidates'],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, company_name')
        .order('company_name')
        .limit(500);
      return (data as Pick<Customer, 'id' | 'company_name'>[]) ?? [];
    },
    enabled: assignOpen,
  });

  const handleAssign = async () => {
    if (!assignEmail || !assignTarget) return;
    const { error } = await supabase
      .from('email_messages')
      .update({ customer_id: assignTarget, matched_by: 'manual' })
      .eq('id', assignEmail.id);
    if (error) {
      message.error(error.message);
      return;
    }
    // 同步客户最近联系时间
    await supabase
      .from('customers')
      .update({ last_contact_at: assignEmail.received_at })
      .eq('id', assignTarget);
    message.success('已分派给客户');
    setAssignOpen(false);
    setAssignEmail(null);
    setAssignTarget(undefined);
    queryClient.invalidateQueries({ queryKey: ['unmatched-emails'] });
    queryClient.invalidateQueries({ queryKey: ['recent-emails'] });
  };

  const emailColumns = [
    {
      title: '方向', dataIndex: 'direction', width: 70,
      render: (v: string) => v === 'in' ? <Tag color="blue">收到</Tag> : <Tag color="orange">发出</Tag>,
    },
    {
      title: '时间', dataIndex: 'received_at', width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    { title: '发件人', dataIndex: 'from_address', width: 200, ellipsis: true },
    { title: '主题', dataIndex: 'subject', render: (v: string) => v || '(无主题)' },
    { title: '摘要', dataIndex: 'snippet', ellipsis: true },
  ];

  return (
    <PageContainer title="邮件中心">
      <Card>
        <Tabs
          items={[
            {
              key: 'unmatched',
              label: (
                <span>
                  待分派
                  {unmatched.length > 0 && <Tag color="orange" style={{ marginLeft: 6 }}>{unmatched.length}</Tag>}
                </span>
              ),
              children: (
                <Table
                  rowKey="id"
                  loading={l1}
                  pagination={false}
                  dataSource={unmatched}
                  locale={{ emptyText: <Empty description="没有待分派邮件" /> }}
                  columns={[
                    ...emailColumns,
                    {
                      title: '操作', key: 'action', width: 120,
                      render: (_: unknown, r: EmailMessage) => (
                        <Button type="link" size="small" onClick={() => { setAssignEmail(r); setAssignOpen(true); }}>
                          分派给客户
                        </Button>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'recent',
              label: '最近同步',
              children: (
                <Table
                  rowKey="id"
                  loading={l2}
                  pagination={{ pageSize: 20 }}
                  dataSource={recent}
                  columns={[
                    ...emailColumns,
                    {
                      title: '关联客户', dataIndex: 'customer', width: 220,
                      render: (v: { company_name: string } | null, r: EmailMessage) =>
                        v ? (
                          <Link to={`/customers/${r.customer_id}`}>
                            <span className="grade-dot" style={{ background: GRADE_COLORS.C }} />
                            {v.company_name}
                          </Link>
                        ) : (
                          <Tag>未分派</Tag>
                        ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={assignOpen}
        title="分派邮件给客户"
        okText="分派"
        cancelText="取消"
        onOk={handleAssign}
        onCancel={() => setAssignOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div style={{ color: '#8c8c8c' }}>
            发件人：{assignEmail?.from_address}
            <br />
            主题：{assignEmail?.subject || '(无主题)'}
          </div>
          <Select
            showSearch
            placeholder="搜索并选择客户"
            style={{ width: '100%' }}
            value={assignTarget}
            onChange={setAssignTarget}
            options={candidates.map((c) => ({ value: c.id, label: c.company_name }))}
          />
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            提示：如果是新客户，建议先到「客户管理」建档（建档后填写联系人邮箱，以后同域名邮件会自动关联）。
          </div>
        </Space>
      </Modal>
    </PageContainer>
  );
}
