import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Card,
    Result,
    Button,
} from 'antd';
import {
    ArrowRightOutlined,
    FileTextOutlined,
} from '@ant-design/icons';

const Receipts: React.FC = () => {
    const navigate = useNavigate();

    const handleGoToInvoices = () => {
        navigate('/warehouse/supplier-invoices');
    };

    return (
        <Card>
            <Result
                icon={<FileTextOutlined />}
                title="A bevételezési rendszer megújult!"
                subTitle="Az új számla alapú bevételezési rendszer a 'Beszállítói számlák' menüpontban érhető el, ahol NAV integrációval automatikusan importálhatja a számlákat."
                extra={[
                    <Button
                        type="primary"
                        size="large"
                        icon={<ArrowRightOutlined />}
                        onClick={handleGoToInvoices}
                        key="goto"
                    >
                        Ugrás a Beszállítói számlákhoz
                    </Button>,
                ]}
            />
        </Card>
    );
};

export default Receipts;
