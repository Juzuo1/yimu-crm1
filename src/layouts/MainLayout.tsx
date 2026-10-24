import { useEffect, useState, useMemo } from 'react';
import { Layout, Menu, Badge, Dropdown, Avatar, Space, Typography } from 'antd';
import {
  DashboardOutlined, TeamOutlined, DatabaseOutlined, ScheduleOutlined,
  MailOutlined, SettingOutlined, UserOutlined, LogoutOutlined, BellOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { NOTIFY_TYPE_LABELS } from '@/lib/constants';
import dayjs from 'dayjs';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const MENU_ITEMS = [
  { key: '/', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/customers', icon: <TeamOutlined />, label: '客户管理' },
  { key: '/pool', icon: <DatabaseOutlined />, label: '公海客户' },
  { key: '/followups', icon: <ScheduleOutlined />, label: '跟进中心' },
  { key: '/emails', icon: <MailOutlined />, label: '邮件中心' },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unread-notifications'],
    queryFn: async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });

  const selectedKey = useMemo(() => {
    if (location.pathname.startsWith('/customers')) return '/customers';
    return location.pathname;
  }, [location.pathname]);

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人中心' },
      ...(profile?.role === 'owner' || profile?.role === 'admin'
        ? [
            { type: 'group' as const, label: '团队管理' },
            { key: 'team', icon: <TeamOutlined />, label: '成员与角色' },
            { key: 'rules', icon: <SettingOutlined />, label: '公海规则' },
            { key: 'email-accounts', icon: <MailOutlined />, label: '邮箱绑定' },
          ]
        : []),
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
    ],
    onClick: async ({ key }: { key: string }) => {
      if (key === 'profile') navigate('/settings/profile');
      else if (key === 'team') navigate('/settings/team');
      else if (key === 'rules') navigate('/settings/rules');
      else if (key === 'email-accounts') navigate('/settings/email-accounts');
      else if (key === 'logout') await signOut();
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={{ position: 'sticky', top: 0, height: '100vh' }}
      >
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: collapsed ? 16 : 18,
            letterSpacing: 0.5,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {collapsed ? 'YIMU' : 'YIMU 客户管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 24px',
            borderBottom: '1px solid #e8ecf2',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={20}>
            <Badge count={unreadCount} size="small">
              <BellOutlined
                style={{ fontSize: 18, cursor: 'pointer' }}
                onClick={() => navigate('/followups')}
              />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" style={{ backgroundColor: '#FF6B35' }} icon={<UserOutlined />} />
                <Text strong>{profile?.name ?? '用户'}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ background: '#F5F7FA' }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
