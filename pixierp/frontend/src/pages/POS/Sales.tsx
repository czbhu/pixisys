import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Sales = () => {
    return (
        <Card>
            <Title level={3}>Eladások kezelése</Title>
            <p>Itt lesznek az eladások kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Sales;
