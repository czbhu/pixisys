import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Budgets = () => {
    return (
        <Card>
            <Title level={3}>Költségvetések kezelése</Title>
            <p>Itt lesznek a költségvetések kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Budgets;
