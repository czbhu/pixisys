import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Campaigns: React.FC = () => {
    return (
        <Card>
            <Title level={3}>Kampányok</Title>
            <p>Ez a modul hamarosan elérhető lesz.</p>
        </Card>
    );
};

export default Campaigns;