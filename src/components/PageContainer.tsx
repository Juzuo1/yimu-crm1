import { ReactNode } from 'react';
import { Typography } from 'antd';

const { Title, Text } = Typography;

export default function PageContainer({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={4} style={{ color: '#0A2540', margin: 0 }}>
            {title}
          </Title>
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}
