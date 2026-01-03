import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Shipments = () => {
    return (
        <Card>
            <Title level={3}>Szállítások kezelése</Title>
            <p>Itt lesznek a szállítások kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Shipments;
