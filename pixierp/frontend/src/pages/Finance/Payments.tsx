import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Payments = () => {
    return (
        <Card>
            <Title level={3}>Fizetések kezelése</Title>
            <p>Itt lesznek a fizetések kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Payments;
