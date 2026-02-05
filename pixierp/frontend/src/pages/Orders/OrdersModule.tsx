import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    ShoppingOutlined,
    RocketOutlined,
    UndoOutlined,
    SolutionOutlined
} from '@ant-design/icons';
import Orders from './Orders';
import Shipments from './Shipments';
import Returns from './Returns';
import Suppliers from './Suppliers';
import ModuleDashboard from '../../components/ModuleDashboard';

const OrdersModule = () => {
    const dashboardItems = [
        { key: '/orders/orders', label: 'Megrendelések', icon: <ShoppingOutlined /> },
        { key: '/orders/shipments', label: 'Szállítások', icon: <RocketOutlined /> },
        { key: '/orders/returns', label: 'Visszaküldések', icon: <UndoOutlined /> },
        { key: '/orders/suppliers', label: 'Beszállítók', icon: <SolutionOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="Rendelések" items={dashboardItems} />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/suppliers" element={<Suppliers />} />
        </Routes>
    );
};

export default OrdersModule;
