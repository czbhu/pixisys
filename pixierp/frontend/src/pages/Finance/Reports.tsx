import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Reports = () => {
    return (
        <Card>
            <Title level={3}>Jelentések</Title>
            <p>Itt lesznek a jelentések kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Reports;
