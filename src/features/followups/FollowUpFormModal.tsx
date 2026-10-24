import { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, App } from 'antd';
import { supabase } from '@/lib/supabase';
import { FOLLOWUP_TYPE_LABELS } from '@/lib/constants';
import type { Contact, FollowUpType } from '@/lib/database.types';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  customerId: string;
  customerName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

// 跟进录入弹窗（客户详情页 / 跟进中心共用）
export default function FollowUpFormModal({ open, customerId, customerName, onSuccess, onCancel }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (open && customerId) {
      supabase.from('contacts').select('*').eq('customer_id', customerId)
        .then(({ data }) => setContacts((data as Contact[]) ?? []));
    }
  }, [open, customerId]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const { data: authUser } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles').select('org_id').eq('id', authUser.user!.id).single();
      const { error } = await supabase.from('follow_ups').insert({
        org_id: profile!.org_id,
        customer_id: customerId,
        contact_id: (values.contact_id as string) || null,
        type: values.type as FollowUpType,
        content: values.content as string,
        contacted_at: values.contacted_at
          ? (values.contacted_at as dayjs.Dayjs).toISOString()
          : new Date().toISOString(),
        next_follow_up_at: values.next_follow_up_at
          ? (values.next_follow_up_at as dayjs.Dayjs).toISOString()
          : null,
        created_by: authUser.user!.id,
      });
      if (error) throw error;

      // 同步客户主表冗余字段（经 RLS 允许更新，触发器只拦归属字段）
      await supabase.from('customers').update({
        last_follow_up_at: new Date().toISOString(),
        next_follow_up_at: values.next_follow_up_at
          ? (values.next_follow_up_at as dayjs.Dayjs).toISOString()
          : null,
        last_contact_at: new Date().toISOString(),
      }).eq('id', customerId);

      message.success('跟进记录已保存');
      form.resetFields();
      onSuccess();
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`记录跟进 · ${customerName}`}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onCancel}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}
        initialValues={{ type: 'note', contacted_at: dayjs() }}>
        <Form.Item name="type" label="跟进方式" rules={[{ required: true }]}>
          <Select options={Object.entries(FOLLOWUP_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        </Form.Item>
        {contacts.length > 0 && (
          <Form.Item name="contact_id" label="关联联系人">
            <Select allowClear placeholder="选择联系人（可选）"
              options={contacts.map((c) => ({ value: c.id, label: `${c.name}${c.position ? ` · ${c.position}` : ''}` }))} />
          </Form.Item>
        )}
        <Form.Item name="content" label="跟进内容" rules={[{ required: true, message: '请填写跟进内容' }]}>
          <Input.TextArea rows={4} placeholder="本次沟通的要点、客户反馈、下一步计划..." />
        </Form.Item>
        <Form.Item name="contacted_at" label="跟进时间">
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="next_follow_up_at" label="下次跟进时间">
          <DatePicker showTime style={{ width: '100%' }} placeholder="设置后将进入「跟进中心」提醒" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
