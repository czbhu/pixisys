import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Leaves = () => {
    return (
        <Card>
            <Title level={3}>Szabadságok kezelése</Title>
            <p>Itt lesznek a szabadságok kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Leaves;
