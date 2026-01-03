import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Suppliers = () => {
    return (
        <Card>
            <Title level={3}>Beszállítók kezelése</Title>
            <p>Itt lesznek a beszállítók kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Suppliers;
