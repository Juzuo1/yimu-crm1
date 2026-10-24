import { useState, useMemo } from 'react';
import { Layout, Menu, Badge, Dropdown, Avatar, Space, Typography, Button } from 'antd';
import {
  DashboardOutlined, TeamOutlined, DatabaseOutlined, ScheduleOutlined,
  MailOutlined, SettingOutlined, UserOutlined, LogoutOutlined, BellOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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
    <Layout style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <Sider
        collapsible
        trigger={null}
        collapsed={collapsed}
        width={216}
        style={{
          background: '#ffffff',
          borderRight: '1px solid #eaeff5',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: collapsed ? '0 22px' : '0 18px',
            borderBottom: '1px solid #f0f3f7',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #0A2540 0%, #1b4a7a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            Y
          </div>
          {!collapsed && (
            <div style={{ lineHeight: 1.2, overflow: 'hidden' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0A2540', whiteSpace: 'nowrap' }}>
                YIMU CRM
              </div>
              <div style={{ fontSize: 11, color: '#9aa7b8', whiteSpace: 'nowrap' }}>
                外贸客户管理系统
              </div>
            </div>
          )}
        </div>

        <Menu
          className="brand-menu"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ borderInlineEnd: 'none', paddingTop: 10, background: 'transparent', fontSize: 14 }}
        />

        <div style={{ padding: '10px 16px' }}>
          <Button
            type="text"
            size="small"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ color: '#9aa7b8', fontSize: 12 }}
          >
            {!collapsed && '收起侧栏'}
          </Button>
        </div>
      </Sider>

      <Layout style={{ background: '#f5f7fa' }}>
        <Header
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            background: '#ffffff',
            borderBottom: '1px solid #eaeff5',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Text style={{ fontSize: 13, color: '#9aa7b8' }}>
            {MENU_ITEMS.find((m) => m.key === selectedKey)?.label ?? ''}
          </Text>
          <Space size={18}>
            <Badge count={unreadCount} size="small">
              <BellOutlined
                style={{ fontSize: 17, cursor: 'pointer', color: '#5a6b80' }}
                onClick={() => navigate('/followups')}
              />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space size={8} style={{ cursor: 'pointer' }}>
                <Avatar size={30} style={{ backgroundColor: '#0A2540', fontSize: 13 }}>
                  {profile?.name?.[0] ?? 'U'}
                </Avatar>
                <Text style={{ fontSize: 13 }}>{profile?.name ?? '用户'}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content>{children}</Content>
      </Layout>
    </Layout>
  );
}
