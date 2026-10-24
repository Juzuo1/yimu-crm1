import { useState } from 'react';
import { Card, Form, Input, Button, App, Descriptions, Tag } from 'antd';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { ROLE_LABELS } from '@/lib/constants';

export default function ProfilePage() {
  const { message } = App.useApp();
  const { profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [infoForm] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const handleInfoSave = async (values: { name: string; phone: string }) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update(values).eq('id', profile!.id);
      if (error) throw error;
      await refreshProfile();
      message.success('资料已更新');
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handlePwdChange = async (values: { newPassword: string }) => {
    setPwdSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: values.newPassword });
      if (error) throw error;
      message.success('密码已修改');
      pwdForm.resetFields();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setPwdSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <PageContainer title="个人中心">
      <Card size="small" style={{ maxWidth: 520, marginBottom: 16 }}>
        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="邮箱">{profile.email}</Descriptions.Item>
          <Descriptions.Item label="角色">
            <Tag color="blue">{ROLE_LABELS[profile.role]}</Tag>
          </Descriptions.Item>
        </Descriptions>
        <Form
          form={infoForm}
          layout="vertical"
          initialValues={{ name: profile.name, phone: profile.phone }}
          onFinish={handleInfoSave}
        >
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存资料
          </Button>
        </Form>
      </Card>

      <Card size="small" title="修改密码" style={{ maxWidth: 520 }}>
        <Form form={pwdForm} layout="vertical" onFinish={handlePwdChange}>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={pwdSaving}>
            修改密码
          </Button>
        </Form>
      </Card>
    </PageContainer>
  );
}
