import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import PageContainer from '@/components/PageContainer';
import CustomerForm from './CustomerForm';
import DedupModal, { DuplicateRow } from './DedupModal';
import { supabase } from '@/lib/supabase';

export default function CustomerNewPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [duplicates, setDuplicates] = useState<DuplicateRow[] | null>(null);
  const [pendingValues, setPendingValues] = useState<Record<string, unknown> | null>(null);

  const createCustomer = async (values: Record<string, unknown>) => {
    const { data: authUser } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles').select('org_id').eq('id', authUser.user!.id).single();
    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...values,
        org_id: profile!.org_id,
        created_by: authUser.user!.id,
        owner_id: (values.owner_id as string) ?? authUser.user!.id,
      })
      .select()
      .single();
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('客户创建成功');
    navigate(`/customers/${data.id}`);
  };

  // 提交前查重：名称/域名相似 → 弹窗确认，防撞单第一道闸
  const beforeSubmit = async (values: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase.rpc('find_duplicates', {
        p_name: values.company_name as string,
        p_website: (values.website as string) || null,
      });
      if (error) throw error;
      if (data && data.length > 0) {
        setDuplicates(data as DuplicateRow[]);
        setPendingValues(values);
        return false;
      }
    } catch {
      // 查重失败不阻塞创建
    }
    return true;
  };

  return (
    <PageContainer title="新建客户">
      <CustomerForm beforeSubmit={beforeSubmit} onCancel={() => navigate('/customers')} onSuccess={(c) => navigate(`/customers/${c.id}`)} />
      <DedupModal
        open={!!duplicates}
        duplicates={duplicates ?? []}
        onCancel={() => { setDuplicates(null); setPendingValues(null); }}
        onConfirm={async () => {
          if (pendingValues) await createCustomer(pendingValues);
          setDuplicates(null);
          setPendingValues(null);
        }}
      />
    </PageContainer>
  );
}
