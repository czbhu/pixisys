import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Quality = () => {
    return (
        <Card>
            <Title level={3}>Minőségbiztosítás</Title>
            <p>Itt lesznek a minőségbiztosítás kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Quality;
