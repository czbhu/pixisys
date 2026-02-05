import React from 'react';
import { Card, Row, Col, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

export interface DashboardItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  description?: string;
  color?: string;
  onClick?: () => void;
}

interface ModuleDashboardProps {
  title: string;
  items: DashboardItem[];
}

const ModuleDashboard: React.FC<ModuleDashboardProps> = ({ title, items }) => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2} style={{ marginBottom: '32px' }}>{title}</Title>
      <Row gutter={[24, 24]}>
        {items.map((item) => (
          <Col xs={24} sm={12} md={8} lg={6} key={item.key}>
            <Card
              hoverable
              style={{ height: '100%', textAlign: 'center', borderRadius: '8px' }}
              onClick={() => {
                if (item.onClick) {
                  item.onClick();
                } else {
                  navigate(item.key);
                }
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '16px', color: item.color || '#1890ff' }}>
                {item.icon}
              </div>
              <Title level={4} style={{ marginBottom: '8px' }}>{item.label}</Title>
              {item.description && (
                <Text type="secondary">{item.description}</Text>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default ModuleDashboard;
