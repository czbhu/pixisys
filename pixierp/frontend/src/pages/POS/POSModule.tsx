import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    ShopOutlined,
    BarcodeOutlined,
    UserOutlined,
    BarChartOutlined,
    ApiOutlined
} from '@ant-design/icons';
import Sales from './Sales';
import Products from './Products';
import Customers from './Customers';
import Reports from './Reports';
import FAM from './FAM';
import ModuleDashboard from '../../components/ModuleDashboard';

const POSModule = () => {
    const dashboardItems = [
        { key: '/pos/sales', label: 'Értékesítés', icon: <ShopOutlined /> },
        { key: '/pos/products', label: 'Termékek', icon: <BarcodeOutlined /> },
        { key: '/pos/customers', label: 'Ügyfelek', icon: <UserOutlined /> },
        { key: '/pos/reports', label: 'Jelentések', icon: <BarChartOutlined /> },
        { key: '/pos/fam', label: 'FAM', icon: <ApiOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="POS" items={dashboardItems} />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/products" element={<Products />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/fam" element={<FAM />} />
        </Routes>
    );
};

export default POSModule;
