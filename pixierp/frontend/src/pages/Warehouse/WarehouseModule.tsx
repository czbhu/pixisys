import React from 'react';
import { Routes, Route } from 'react-router-dom';
import {
    AppstoreOutlined,
    GroupOutlined,
    DatabaseOutlined,
    ImportOutlined,
    FileTextOutlined,
    DeleteOutlined,
    HomeOutlined,
    SolutionOutlined,
    BarChartOutlined
} from '@ant-design/icons';
import Materials from './Materials';
import MaterialGroups from './MaterialGroups';
import Inventory from './Inventory';
import Receipts from './Receipts';
import Warehouses from './Warehouses';
import Suppliers from './Suppliers';
import Reports from './Reports';
import SupplierInvoices from './SupplierInvoices';
import Scraps from './Scraps';
import ModuleDashboard from '../../components/ModuleDashboard';

const WarehouseModule: React.FC = () => {
    const dashboardItems = [
        { key: '/warehouse/materials', label: 'Alapanyagok/Termékek', icon: <AppstoreOutlined /> },
        { key: '/warehouse/material-groups', label: 'Anyagcsoportok', icon: <GroupOutlined /> },
        { key: '/warehouse/inventory', label: 'Készlet', icon: <DatabaseOutlined /> },
        { key: '/warehouse/receipts', label: 'Bevételezések', icon: <ImportOutlined /> },
        { key: '/warehouse/supplier-invoices', label: 'Beszállítói számlák', icon: <FileTextOutlined /> },
        { key: '/warehouse/scraps', label: 'Selejtezések', icon: <DeleteOutlined /> },
        { key: '/warehouse/warehouses', label: 'Raktárak', icon: <HomeOutlined /> },
        { key: '/warehouse/suppliers', label: 'Beszállítók', icon: <SolutionOutlined /> },
        { key: '/warehouse/reports', label: 'Jelentések', icon: <BarChartOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="Raktár" items={dashboardItems} />} />
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
