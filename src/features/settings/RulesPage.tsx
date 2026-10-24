import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Form, InputNumber, Button, App, Descriptions, Alert } from 'antd';
import PageContainer from '@/components/PageContainer';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { OrgSettings } from '@/lib/database.types';

export default function RulesPage() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('org_settings').select('*').single();
      return data as OrgSettings;
    },
  });

  const handleSubmit = async (values: Partial<OrgSettings>) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('org_settings')
        .update({
          recycle_days: values.recycle_days,
          max_private_customers: values.max_private_customers,
          protection_days: values.protection_days,
          unreplied_remind_days: values.unreplied_remind_days,
        })
        .eq('org_id', profile!.org_id);
      if (error) throw error;
      message.success('规则已保存，次日生效');
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer title="公海规则">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="规则由系统每日凌晨自动执行，修改后次日 02:00 生效。"
      />
      <Card loading={isLoading} style={{ maxWidth: 560 }}>
        {settings && (
          <Form
            form={form}
            layout="vertical"
            initialValues={settings}
            onFinish={handleSubmit}
          >
            <Form.Item
              name="recycle_days"
              label="自动回收天数"
              extra="私海客户超过该天数没有跟进记录，将自动回收到公海"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter="天" />
            </Form.Item>
            <Form.Item
              name="protection_days"
              label="领取保护期"
              extra="从公海领取客户后的保护天数，保护期内不会被自动回收"
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={90} style={{ width: '100%' }} addonAfter="天" />
            </Form.Item>
            <Form.Item
              name="max_private_customers"
              label="每人私海上限"
              extra="超过上限后不能再从公海领取客户"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={10000} style={{ width: '100%' }} addonAfter="个" />
            </Form.Item>
            <Form.Item
              name="unreplied_remind_days"
              label="未回复提醒天数"
              extra="发出邮件超过该天数客户未回复，系统每日 09:00 提醒跟进人"
              rules={[{ required: true }]}
            >
              <InputNumber min={1} max={90} style={{ width: '100%' }} addonAfter="天" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存规则
            </Button>
          </Form>
        )}
      </Card>

      {settings && (
        <Card size="small" style={{ maxWidth: 560, marginTop: 16 }} title="当前生效规则">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="自动回收">
              {settings.recycle_days} 天未跟进 → 回收公海
            </Descriptions.Item>
            <Descriptions.Item label="领取保护期">
              {settings.protection_days} 天
            </Descriptions.Item>
            <Descriptions.Item label="私海上限">
              每人 {settings.max_private_customers} 个
            </Descriptions.Item>
            <Descriptions.Item label="未回复提醒">
              {settings.unreplied_remind_days} 天
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </PageContainer>
  );
}
