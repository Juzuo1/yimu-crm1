import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, App, Popconfirm, Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Profile, UserRole } from '@/lib/database.types';
import { ROLE_LABELS } from '@/lib/constants';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { profile: me } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form] = Form.useForm();
  const [inviting, setInviting] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('created_at');
      return (data as Profile[]) ?? [];
    },
  });

  const { data: invites = [] } = useQuery({
    queryKey: ['pending-invites'],
    queryFn: async () => {
      const { data } = await supabase.from('pending_invites').select('*').order('created_at', { ascending: false });
      return (data ?? []) as { id: string; email: string; role: UserRole; created_at: string }[];
    },
  });

  const handleInvite = async (values: { email: string; role: UserRole }) => {
    setInviting(true);
    try {
      const { error } = await supabase.from('pending_invites').insert({
        org_id: me!.org_id,
        email: values.email,
        role: values.role,
        created_by: me!.id,
      });
      if (error) throw error;
      message.success(`已邀请 ${values.email}，对方注册后自动加入团队`);
      setInviteOpen(false);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (id: string, role: UserRole) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) message.error(error.message);
    else {
      message.success('角色已更新');
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    }
  };

  const handleStatusChange = async (id: string, status: 'active' | 'disabled') => {
    const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
    if (error) message.error(error.message);
    else {
      message.success(status === 'active' ? '已启用' : '已停用');
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    }
  };

  const cancelInvite = async (id: string) => {
    await supabase.from('pending_invites').delete().eq('id', id);
    message.success('已取消邀请');
    queryClient.invalidateQueries({ queryKey: ['pending-invites'] });
  };

  const columns = [
    { title: '姓名', dataIndex: 'name' },
    { title: '邮箱', dataIndex: 'email' },
    {
      title: '角色', dataIndex: 'role',
      render: (v: UserRole, r: Profile) =>
        r.id === me?.id ? (
          <Tag color="blue">{ROLE_LABELS[v]}（我）</Tag>
        ) : (
          <Select
            value={v}
            style={{ width: 110 }}
            onChange={(role) => handleRoleChange(r.id, role)}
            options={(Object.keys(ROLE_LABELS) as UserRole[]).map((k) => ({ value: k, label: ROLE_LABELS[k] }))}
          />
        ),
    },
    {
      title: '状态', dataIndex: 'status',
      render: (v: string, r: Profile) =>
        r.id === me?.id ? (
          <Tag color="green">正常</Tag>
        ) : v === 'active' ? (
          <Popconfirm title="停用后该成员将无法登录，确定？" onConfirm={() => handleStatusChange(r.id, 'disabled')}>
            <Tag color="green" style={{ cursor: 'pointer' }}>正常</Tag>
          </Popconfirm>
        ) : (
          <Popconfirm title="启用该成员？" onConfirm={() => handleStatusChange(r.id, 'active')}>
            <Tag color="red" style={{ cursor: 'pointer' }}>已停用</Tag>
          </Popconfirm>
        ),
    },
    {
      title: '加入时间', dataIndex: 'created_at',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
    },
  ];

  return (
    <PageContainer
      title="成员与角色"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
          邀请成员
        </Button>
      }
    >
      <Card size="small" style={{ marginBottom: 16 }}>
        <Table rowKey="id" loading={isLoading} pagination={false} dataSource={members} columns={columns} />
      </Card>

      {invites.length > 0 && (
        <Card size="small" title={`待接受邀请（${invites.length}）`}>
          <Table
            rowKey="id"
            pagination={false}
            dataSource={invites}
            columns={[
              { title: '邮箱', dataIndex: 'email' },
              { title: '角色', dataIndex: 'role', render: (v: UserRole) => ROLE_LABELS[v] },
              {
                title: '邀请时间', dataIndex: 'created_at',
                render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
              },
              {
                title: '操作', key: 'action',
                render: (_: unknown, r: { id: string }) => (
                  <Popconfirm title="取消邀请？" onConfirm={() => cancelInvite(r.id)}>
                    <Button type="link" size="small" danger>取消</Button>
                  </Popconfirm>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Modal
        open={inviteOpen}
        title="邀请成员"
        okText="发送邀请"
        cancelText="取消"
        confirmLoading={inviting}
        onOk={() => form.submit()}
        onCancel={() => setInviteOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label="成员邮箱"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
          >
            <Input placeholder="colleague@company.com" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="sales">
            <Select
              options={(Object.keys(ROLE_LABELS) as UserRole[]).map((k) => ({ value: k, label: ROLE_LABELS[k] }))}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            角色说明：老板/管理员可管理成员和规则；主管可查看全部客户、分配客户；业务员只能看自己的客户和公海。
          </Text>
        </Form>
      </Modal>
    </PageContainer>
  );
}
