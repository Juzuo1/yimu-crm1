import { Modal, Table, Tag, Alert } from 'antd';
import type { CustomerGrade } from '@/lib/database.types';
import { GRADE_COLORS } from '@/lib/constants';

export interface DuplicateRow {
  customer_id: string;
  company_name: string;
  website: string | null;
  country: string | null;
  owner_name: string | null;
  reason: string;
  similarity: number;
}

// 防撞单查重弹窗
export default function DedupModal({
  open,
  duplicates,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  duplicates: DuplicateRow[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title="⚠️ 发现可能重复的客户"
      okText="仍要创建"
      cancelText="返回修改"
      onOk={onConfirm}
      onCancel={onCancel}
      width={680}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message="系统中已存在相似客户，为避免撞单和重复跟进，请先确认。"
      />
      <Table
        rowKey="customer_id"
        size="small"
        pagination={false}
        dataSource={duplicates}
        columns={[
          { title: '公司名称', dataIndex: 'company_name' },
          { title: '官网', dataIndex: 'website', render: (v: string) => v || '-' },
          { title: '国家', dataIndex: 'country', render: (v: string) => v || '-' },
          { title: '当前跟进人', dataIndex: 'owner_name', render: (v: string) => v || '公海' },
          {
            title: '重复原因',
            dataIndex: 'reason',
            render: (v: string) => <Tag color="orange">{v}</Tag>,
          },
        ]}
      />
    </Modal>
  );
}
