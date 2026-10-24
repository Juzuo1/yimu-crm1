import { useState } from 'react';
import { Card, Form, Input, Button, Tabs, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const { message } = App.useApp();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      if (tab === 'login') {
        await signIn(values.email, values.password);
      } else {
        await signUp(values.email, values.password);
        message.success('注册成功！如邮箱在邀请名单中将自动加入团队');
      }
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0A2540 0%, #12355F 60%, #FF6B35 160%)',
      }}
    >
      <Card style={{ width: 420, boxShadow: '0 8px 32px rgba(10,37,64,0.25)' }} bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Title level={3} style={{ color: '#0A2540', marginBottom: 4 }}>
            YIMU 外贸客户管理系统
          </Title>
          <Text type="secondary">客户资产 · 一站管理</Text>
        </div>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          centered
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册（需邀请）' },
          ]}
        />
        <Form layout="vertical" onFinish={onFinish} size="large" requiredMark={false}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="name@company.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} style={{ marginTop: 8 }}>
            {tab === 'login' ? '登 录' : '注 册'}
          </Button>
        </Form>
        {tab === 'register' && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            提示：只有被团队管理员邀请的邮箱才能注册成功。首个注册的账号将自动成为老板。
          </Text>
        )}
      </Card>
    </div>
  );
}
