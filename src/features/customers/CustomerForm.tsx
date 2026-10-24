import { useEffect, useState } from 'react';
import {
  Form, Input, Select, InputNumber, Row, Col, Card, Button, Space, App,
} from 'antd';
import { Customer, Profile } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import {
  COUNTRIES, COMPANY_TYPE_LABELS, COMPANY_SCALE_LABELS, SOURCE_LABELS, GRADE_LABELS,
} from '@/lib/constants';

interface Props {
  initialValues?: Partial<Customer>;
  // 提交前钩子：返回 false 则阻止表单提交（如查重未确认）
  beforeSubmit?: (values: Record<string, unknown>) => Promise<boolean>;
  onSuccess: (customer: Customer) => void;
  onCancel: () => void;
}

export default function CustomerForm({ initialValues, beforeSubmit, onSuccess, onCancel }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Profile[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const isEdit = !!initialValues?.id;

  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data }) => setMembers((data as Profile[]) ?? []));
    supabase.from('tags').select('id, name').then(({ data }) => setTags(data ?? []));
    supabase.from('groups').select('id, name').then(({ data }) => setGroups(data ?? []));
    if (isEdit) {
      supabase.from('customer_tags').select('tag_id').eq('customer_id', initialValues!.id)
        .then(({ data }) => setSelectedTags((data ?? []).map((r) => r.tag_id)));
      supabase.from('customer_groups').select('group_id').eq('customer_id', initialValues!.id)
        .then(({ data }) => setSelectedGroups((data ?? []).map((r) => r.group_id)));
    }
  }, [isEdit]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (beforeSubmit) {
      const proceed = await beforeSubmit(values);
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...values };
      delete payload.tag_ids;
      delete payload.group_ids;
      // owner_id 归属变更编辑时只能走 RPC，直接移除
      if (isEdit) delete payload.owner_id;
      if (!payload.website) delete payload.website;
      if (!payload.owner_id) delete payload.owner_id;

      let customerId = initialValues?.id;
      if (isEdit) {
        const { error } = await supabase.from('customers').update(payload).eq('id', customerId);
        if (error) throw error;
      } else {
        const { data: authUser } = await supabase.auth.getUser();
        const { data: profile } = await supabase
          .from('profiles').select('org_id').eq('id', authUser.user!.id).single();
        const { data, error } = await supabase
          .from('customers')
          .insert({ ...payload, org_id: profile!.org_id, created_by: authUser.user!.id })
          .select()
          .single();
        if (error) throw error;
        customerId = data.id;
      }

      // 标签与分组
      await supabase.from('customer_tags').delete().eq('customer_id', customerId);
      await supabase.from('customer_groups').delete().eq('customer_id', customerId);
      if (selectedTags.length) {
        await supabase.from('customer_tags').insert(
          selectedTags.map((tag_id) => ({ customer_id: customerId!, tag_id }))
        );
      }
      if (selectedGroups.length) {
        await supabase.from('customer_groups').insert(
          selectedGroups.map((group_id) => ({ customer_id: customerId!, group_id }))
        );
      }

      message.success(isEdit ? '客户已更新' : '客户创建成功');
      const { data: fresh } = await supabase.from('customers').select('*').eq('id', customerId).single();
      onSuccess(fresh as Customer);
    } catch (err) {
      message.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        company_type: 'other', company_scale: 'lt10', grade: 'C',
        star_level: 3, source: 'other', status: 'active', ...initialValues,
      }}
      onFinish={handleSubmit}
      disabled={saving}
    >
      <Card title="企业信息" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="company_name" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}>
              <Input placeholder="常用名或中文名，如：ABC Trading GmbH" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="company_name_en" label="英文名称">
              <Input placeholder="Company English Name" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="website" label="官网">
              <Input placeholder="https://www.example.com" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="country" label="国家/地区">
              <Select showSearch options={COUNTRIES.map((c) => ({ value: c, label: c }))} placeholder="选择国家" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="region" label="省/州/城市">
              <Input placeholder="如：California" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="company_type" label="公司类型">
              <Select options={Object.entries(COMPANY_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="company_scale" label="公司规模">
              <Select options={Object.entries(COMPANY_SCALE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="industry" label="所属行业">
              <Input placeholder="如：Home Energy / Building Materials" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="main_products" label="主营产品">
              <Input placeholder="客户主要采购的产品，如：Home Battery Storage, Inverters" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="address" label="详细地址">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Card title="管理信息" size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item name="grade" label="客户等级">
              <Select options={Object.entries(GRADE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="star_level" label="星级">
              <InputNumber min={1} max={5} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="source" label="来源渠道">
              <Select options={Object.entries(SOURCE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="status" label="客户状态">
              <Select
                options={[
                  { value: 'active', label: '活跃' },
                  { value: 'dormant', label: '沉睡' },
                  { value: 'lost', label: '流失' },
                ]}
              />
            </Form.Item>
          </Col>
          {!isEdit && (
            <Col span={6}>
              <Form.Item name="owner_id" label="归属业务员">
                <Select
                  allowClear
                  placeholder="默认归我"
                  options={members.map((m) => ({ value: m.id, label: `${m.name}（${m.role}）` }))}
                />
              </Form.Item>
            </Col>
          )}
          <Col span={isEdit ? 12 : 12}>
            <Form.Item name="closeness_score" label="紧密度评分（1-5，手动）">
              <InputNumber min={1} max={5} style={{ width: '100%' }} placeholder="联系频率与关系深度" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="match_score" label="匹配度评分（1-5，手动）">
              <InputNumber min={1} max={5} style={{ width: '100%' }} placeholder="与公司产品的匹配程度" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="标签">
              <Select
                mode="multiple"
                allowClear
                placeholder="选择标签"
                value={selectedTags}
                onChange={setSelectedTags}
                options={tags.map((t) => ({ value: t.id, label: t.name }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="分组">
              <Select
                mode="multiple"
                allowClear
                placeholder="选择分组"
                value={selectedGroups}
                onChange={setSelectedGroups}
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={3} placeholder="客户特殊要求、决策习惯、谈判要点等" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      <Space style={{ marginBottom: 24 }}>
        <Button type="primary" htmlType="submit" loading={saving}>
          {isEdit ? '保存修改' : '创建客户'}
        </Button>
        <Button onClick={onCancel}>取消</Button>
      </Space>
    </Form>
  );
}
