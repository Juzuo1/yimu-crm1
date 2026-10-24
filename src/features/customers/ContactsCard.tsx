import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, Switch, App, Popconfirm, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { supabase } from '@/lib/supabase';
import type { Contact, DecisionRole } from '@/lib/database.types';
import { DECISION_ROLE_LABELS } from '@/lib/constants';

interface Props {
  customerId: string;
  canWrite: boolean;
}

export default function ContactsCard({ customerId, canWrite }: Props) {
  const { message } = App.useApp();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('contacts').select('*').eq('customer_id', customerId).order('is_primary', { ascending: false });
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (values: Record<string, unknown>) => {
    const { data: authUser } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('id', authUser.user!.id).single();
    const payload = {
      ...values,
      org_id: profile!.org_id,
      customer_id: customerId,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from('contacts').update(values).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('contacts').insert({ ...payload, created_by: authUser.user!.id }));
    }
    if (error) {
      message.error(error.message);
      return;
    }
    message.success(editing ? '联系人已更新' : '联系人已添加');
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) message.error(error.message);
    else {
      message.success('已删除');
      load();
    }
  };

  const handleSetPrimary = async (c: Contact) => {
    await supabase.from('contacts').update({ is_primary: false }).eq('customer_id', customerId);
    await supabase.from('contacts').update({ is_primary: true }).eq('id', c.id);
    load();
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={!canWrite}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setModalOpen(true);
          }}
        >
          添加联系人
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        size="small"
        dataSource={contacts}
        pagination={false}
        columns={[
          {
            title: '姓名', dataIndex: 'name',
            render: (v: string, r: Contact) => (
              <Space>
                {v}
                {r.is_primary && <Tag color="orange">主联系人</Tag>}
              </Space>
            ),
          },
          { title: '职位', dataIndex: 'position', render: (v: string) => v || '-' },
          {
            title: '决策角色', dataIndex: 'decision_role',
            render: (v: DecisionRole) => DECISION_ROLE_LABELS[v] ?? v,
          },
          { title: '邮箱', dataIndex: 'email', render: (v: string) => v || '-' },
          { title: '电话', dataIndex: 'phone', render: (v: string) => v || '-' },
          { title: 'WhatsApp', dataIndex: 'whatsapp', render: (v: string) => v || '-' },
          { title: '微信', dataIndex: 'wechat', render: (v: string) => v || '-' },
          {
            title: '操作', key: 'action', width: 130,
            render: (_: unknown, r: Contact) => (
              <Space size={4}>
                {!r.is_primary && canWrite && (
                  <Button type="link" size="small" onClick={() => handleSetPrimary(r)}>设为主</Button>
                )}
                <Button type="link" size="small" icon={<EditOutlined />} disabled={!canWrite}
                  onClick={() => {
                    setEditing(r);
                    form.setFieldsValue(r);
                    setModalOpen(true);
                  }} />
                <Popconfirm title="确定删除该联系人？" onConfirm={() => handleDelete(r.id)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={!canWrite} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={modalOpen}
        title={editing ? '编辑联系人' : '添加联系人'}
        okText="保存"
        cancelText="取消"
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="如：John Smith" />
          </Form.Item>
          <Form.Item name="name_en" label="英文名/拼音">
            <Input />
          </Form.Item>
          <Form.Item name="position" label="职位">
            <Input placeholder="如：Purchasing Manager" />
          </Form.Item>
          <Form.Item name="decision_role" label="决策角色" initialValue="other">
            <Select options={Object.entries(DECISION_ROLE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="john@example.com（邮件自动关联靠它）" />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="whatsapp" label="WhatsApp">
            <Input />
          </Form.Item>
          <Form.Item name="wechat" label="微信">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="沟通偏好、性格特点等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
