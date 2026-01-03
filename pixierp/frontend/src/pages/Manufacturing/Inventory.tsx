import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Inventory = () => {
    return (
        <Card>
            <Title level={3}>Készlet kezelése</Title>
            <p>Itt lesznek a készlet kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Inventory;
