import { ReactNode } from 'react';
import { Typography } from 'antd';

const { Title, Text } = Typography;

export default function PageContainer({
  title,
  subtitle,
  extra,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 18,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Title
            level={4}
            style={{ color: '#0A2540', margin: 0, fontWeight: 600, letterSpacing: '-0.3px' }}
          >
            {title}
          </Title>
          {subtitle && (
            <Text style={{ fontSize: 13, color: '#9aa7b8' }}>{subtitle}</Text>
          )}
        </div>
        {extra && <div>{extra}</div>}
      </div>
      {children}
    </div>
  );
}
