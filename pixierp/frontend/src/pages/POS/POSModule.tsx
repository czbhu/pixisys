import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sales from './Sales';
import Products from './Products';
import Customers from './Customers';
import Reports from './Reports';

const POSModule = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/pos/sales" replace />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/products" element={<Products />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/reports" element={<Reports />} />
        </Routes>
    );
};

export default POSModule;
