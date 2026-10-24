import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '@/hooks/useAuth';
import MainLayout from '@/layouts/MainLayout';
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import CustomerListPage from '@/features/customers/CustomerListPage';
import CustomerNewPage from '@/features/customers/CustomerNewPage';
import CustomerDetailPage from '@/features/customers/CustomerDetailPage';
import CustomerEditPage from '@/features/customers/CustomerEditPage';
import PoolPage from '@/features/pool/PoolPage';
import FollowUpCenterPage from '@/features/followups/FollowUpCenterPage';
import EmailCenterPage from '@/features/emails/EmailCenterPage';
import EmailAccountsPage from '@/features/settings/EmailAccountsPage';
import TeamPage from '@/features/settings/TeamPage';
import RulesPage from '@/features/settings/RulesPage';
import ProfilePage from '@/features/settings/ProfilePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中...">
          <div style={{ padding: 50 }} />
        </Spin>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <MainLayout>{children}</MainLayout>;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/customers" element={<RequireAuth><CustomerListPage /></RequireAuth>} />
      <Route path="/customers/new" element={<RequireAuth><CustomerNewPage /></RequireAuth>} />
      <Route path="/customers/:id" element={<RequireAuth><CustomerDetailPage /></RequireAuth>} />
      <Route path="/customers/:id/edit" element={<RequireAuth><CustomerEditPage /></RequireAuth>} />
      <Route path="/pool" element={<RequireAuth><PoolPage /></RequireAuth>} />
      <Route path="/followups" element={<RequireAuth><FollowUpCenterPage /></RequireAuth>} />
      <Route path="/emails" element={<RequireAuth><EmailCenterPage /></RequireAuth>} />
      <Route path="/settings/email-accounts" element={<RequireAuth><EmailAccountsPage /></RequireAuth>} />
      <Route path="/settings/team" element={<RequireAuth><TeamPage /></RequireAuth>} />
      <Route path="/settings/rules" element={<RequireAuth><RulesPage /></RequireAuth>} />
      <Route path="/settings/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
