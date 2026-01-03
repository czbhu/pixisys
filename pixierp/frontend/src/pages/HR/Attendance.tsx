import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Attendance = () => {
    return (
        <Card>
            <Title level={3}>Jelenlét kezelése</Title>
            <p>Itt lesznek a jelenlét kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Attendance;
