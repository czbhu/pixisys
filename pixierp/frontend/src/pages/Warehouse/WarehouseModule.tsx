import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Materials from './Materials';
import MaterialGroups from './MaterialGroups';
import Inventory from './Inventory';
import Receipts from './Receipts';
import Warehouses from './Warehouses';
import Suppliers from './Suppliers';
import Reports from './Reports';
import SupplierInvoices from './SupplierInvoices';
import Scraps from './Scraps';

const WarehouseModule: React.FC = () => {
    return (
        <Routes>
            <Route path="/materials" element={<Materials />} />
            <Route path="/material-groups" element={<MaterialGroups />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/warehouses" element={<Warehouses />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/supplier-invoices" element={<SupplierInvoices />} />
            <Route path="/scraps" element={<Scraps />} />
            <Route path="/reports" element={<Reports />} />
        </Routes>
    );
};

export default WarehouseModule;
