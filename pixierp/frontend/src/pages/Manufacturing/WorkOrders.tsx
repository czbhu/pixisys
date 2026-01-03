import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const WorkOrders = () => {
    return (
        <Card>
            <Title level={3}>Munkarendelések kezelése</Title>
            <p>Itt lesznek a munkarendelések kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default WorkOrders;
