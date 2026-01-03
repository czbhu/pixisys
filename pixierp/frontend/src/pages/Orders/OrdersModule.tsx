import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Orders from './Orders';
import Shipments from './Shipments';
import Returns from './Returns';
import Suppliers from './Suppliers';

const OrdersModule = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/orders/orders" replace />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/shipments" element={<Shipments />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/suppliers" element={<Suppliers />} />
        </Routes>
    );
};

export default OrdersModule;
