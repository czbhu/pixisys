import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Activities: React.FC = () => {
    return (
        <Card>
            <Title level={3}>Tevékenységek</Title>
            <p>Ez a modul hamarosan elérhető lesz.</p>
        </Card>
    );
};

export default Activities;