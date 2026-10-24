import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Card } from 'antd';
import PageContainer from '@/components/PageContainer';
import CustomerForm from './CustomerForm';
import { supabase } from '@/lib/supabase';

export default function CustomerEditPage() {
  const { id } = useParams();
  return <CustomerFormLoader id={id!} />;
}

function CustomerFormLoader({ id }: { id: string }) {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          message.error('客户不存在或无权访问');
          navigate('/customers');
          return;
        }
        setValues(data as Record<string, unknown>);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <PageContainer title="编辑客户"><Card loading /></PageContainer>;
  return (
    <PageContainer title={`编辑客户：${values!.company_name}`}>
      <CustomerForm
        initialValues={values as never}
        onCancel={() => navigate(`/customers/${id}`)}
        onSuccess={() => navigate(`/customers/${id}`)}
      />
    </PageContainer>
  );
}
