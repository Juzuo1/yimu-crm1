import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Switch, App,
  Descriptions, Alert, Popconfirm, Typography,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SyncOutlined } from '@ant-design/icons';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { EMAIL_PRESETS } from '@/lib/constants';
import type { EmailAccount } from '@/lib/database.types';
import dayjs from 'dayjs';

const { Text, Link } = Typography;

// 生成 Vault 密钥名（不明文存授权码）
function genSecretName() {
  return `imap_${crypto.randomUUID().replace(/-/g, '')}`;
}

export default function EmailAccountsPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [preset, setPreset] = useState<string>();

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('email_accounts').select('*').order('created_at');
      return (data as EmailAccount[]) ?? [];
    },
  });

  const handlePresetChange = (label: string) => {
    setPreset(label);
    const p = EMAIL_PRESETS.find((x) => x.label === label);
    if (p) {
      form.setFieldsValue({ imap_host: p.host, imap_port: p.port, use_ssl: true });
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const { data: authUser } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('org_id').eq('id', authUser.user!.id).single();

      const secretName = genSecretName();
      const { error: insertError } = await supabase.from('email_accounts').insert({
        org_id: profile!.org_id,
        user_id: authUser.user!.id,
        label: (values.label as string) || '我的邮箱',
        email: values.email as string,
        imap_host: values.imap_host as string,
        imap_port: values.imap_port as number,
        use_ssl: values.use_ssl !== false,
        username: (values.username as string) || (values.email as string),
        vault_secret_name: secretName,
      });
      if (insertError) throw insertError;

      // 授权码加密存入 Vault（不明文落库）
      const { error: secretError } = await supabase.rpc('store_email_credential', {
        p_secret_name: secretName,
        p_secret: values.password as string,
      });
      if (secretError) throw secretError;

      message.success('邮箱绑定成功，邮件将在 15 分钟内自动同步');
      setModalOpen(false);
      form.resetFields();
      setPreset(undefined);
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from('email_accounts').delete().eq('id', id);
    message.success('已解绑');
    queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
  };

  const presetTip = EMAIL_PRESETS.find((p) => p.label === preset)?.tip;

  return (
    <PageContainer title="邮箱绑定">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="绑定后会发生什么"
        description="系统每 15 分钟自动拉取该邮箱收件箱和已发送的邮件，按发件人邮箱/域名自动关联到对应客户，出现在客户的「动态时间线」和「往来邮件」中。无法识别的邮件会进入「邮件中心」等你手动分派。授权码加密存储，任何人不明可见。"
      />

      <Card
        size="small"
        title={`已绑定邮箱（${accounts.length}）`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            绑定邮箱
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={isLoading}
          pagination={false}
          dataSource={accounts}
          columns={[
            { title: '名称', dataIndex: 'label' },
            { title: '邮箱地址', dataIndex: 'email' },
            { title: 'IMAP 服务器', render: (_, r) => `${r.imap_host}:${r.imap_port}` },
            {
              title: '状态', dataIndex: 'status',
              render: (v: string, r) => (
                <Space direction="vertical" size={2}>
                  {v === 'active' ? <Tag color="green">正常</Tag> : <Tag color="red">异常</Tag>}
                  {r.sync_error && <span style={{ fontSize: 12, color: '#ff4d4f' }}>{r.sync_error}</span>}
                </Space>
              ),
            },
            {
              title: '最近同步', dataIndex: 'last_sync_at',
              render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '尚未同步'),
            },
            {
              title: '操作', key: 'action',
              render: (_: unknown, r: EmailAccount) => (
                <Popconfirm title="解绑后将停止同步该邮箱，已同步的邮件保留。确定解绑？" onConfirm={() => handleDelete(r.id)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>解绑</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={modalOpen}
        title="绑定邮箱"
        okText="绑定"
        cancelText="取消"
        confirmLoading={saving}
        onOk={() => form.submit()}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item label="邮箱服务商">
            <Select
              allowClear
              placeholder="选择后自动填入服务器（可选）"
              onChange={handlePresetChange}
              options={EMAIL_PRESETS.map((p) => ({ value: p.label, label: p.label }))}
            />
          </Form.Item>
          {presetTip && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={presetTip} />}
          <Form.Item name="label" label="备注名称">
            <Input placeholder="如：我的 QQ 邮箱 / 公司企业邮箱" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱地址"
            rules={[{ required: true, message: '请输入邮箱地址' }, { type: 'email', message: '邮箱格式不正确' }]}
          >
            <Input placeholder="name@company.com" />
          </Form.Item>
          <Form.Item name="username" label="登录用户名">
            <Input placeholder="一般与邮箱相同，留空则用邮箱地址" />
          </Form.Item>
          <Form.Item
            name="password"
            label="授权码 / 密码"
            rules={[{ required: true, message: '请输入授权码或密码' }]}
            extra="QQ/163/Gmail 需使用「授权码/应用专用密码」，不要直接用登录密码"
          >
            <Input.Password placeholder="授权码（加密存储）" />
          </Form.Item>
          <Form.Item name="imap_host" label="IMAP 服务器" rules={[{ required: true, message: '请输入 IMAP 服务器' }]}>
            <Input placeholder="imap.qq.com" />
          </Form.Item>
          <Form.Item name="imap_port" label="端口" initialValue={993} rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="use_ssl" label="使用 SSL" valuePropName="checked" initialValue>
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
}
