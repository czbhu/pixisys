import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Products = () => {
    return (
        <Card>
            <Title level={3}>Termékek kezelése</Title>
            <p>Itt lesznek a termékek kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Products;
