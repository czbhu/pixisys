import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Orders = () => {
    return (
        <Card>
            <Title level={3}>Rendelések kezelése</Title>
            <p>Itt lesznek a rendelések kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Orders;
