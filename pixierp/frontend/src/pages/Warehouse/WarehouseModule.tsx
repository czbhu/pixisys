import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Materials from './Materials';
import Inventory from './Inventory';
import Receipts from './Receipts';
import Warehouses from './Warehouses';
import Suppliers from './Suppliers';
import Reports from './Reports';

const WarehouseModule: React.FC = () => {
    return (
        <Routes>
            <Route path="/materials" element={<Materials />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/warehouses" element={<Warehouses />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/reports" element={<Reports />} />
        </Routes>
    );
};

export default WarehouseModule;
