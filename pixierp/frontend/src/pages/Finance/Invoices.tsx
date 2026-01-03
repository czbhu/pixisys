import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Invoices = () => {
    return (
        <Card>
            <Title level={3}>Számlák kezelése</Title>
            <p>Itt lesznek a számlák kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Invoices;
