import React from 'react';
import { Card, Typography } from 'antd';

const { Title } = Typography;

const Forecasts = () => {
    return (
        <Card>
            <Title level={3}>Előrejelzések</Title>
            <p>Itt lesznek az előrejelzések kezelésére szolgáló funkciók.</p>
        </Card>
    );
};

export default Forecasts;
