import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Customers = () => {
    return (
        <Card>
            <Title level={3}>Ügyfelek kezelése</Title>
            <p>Itt lesznek az ügyfelek kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Customers;
