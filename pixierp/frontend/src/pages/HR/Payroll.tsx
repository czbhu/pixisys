import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Payroll = () => {
    return (
        <Card>
            <Title level={3}>Bérszámfejtés kezelése</Title>
            <p>Itt lesznek a bérszámfejtés kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Payroll;
