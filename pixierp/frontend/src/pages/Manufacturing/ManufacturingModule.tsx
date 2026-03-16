import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    SkinOutlined,
    ShoppingOutlined,
    TagsOutlined,
    ScissorOutlined,
    CalculatorOutlined,
    ForkOutlined,
    DatabaseOutlined,
    ToolOutlined,
    CheckCircleOutlined,
    GroupOutlined,
    AppstoreOutlined
} from '@ant-design/icons';
import Products from './Products';
import ProductEditor from './ProductEditor';
import OrderedProducts from './OrderedProducts';
import ProductClasses from './ProductClasses';
import Projects from './Projects';
import Services from './Services';
import ServiceGroups from './ServiceGroups';
import CalculatorTemplates from './CalculatorTemplates';
import Calculator from './Calculator';
import ModuleDashboard from '../../components/ModuleDashboard';

const ManufacturingModule: React.FC = () => {
    const dashboardItems = [
        { key: '/manufacturing/products', label: 'Egyedi gyártás', icon: <SkinOutlined /> },
        { key: '/manufacturing/product-editor', label: 'Termék szerkesztő', icon: <AppstoreOutlined /> },
        { key: '/manufacturing/ordered-products', label: 'Megrendelt Gyártások', icon: <ShoppingOutlined /> },
        { key: '/manufacturing/product-classes', label: 'Termékkategóriák', icon: <TagsOutlined /> },
        { key: '/manufacturing/services', label: 'Szolgáltatások', icon: <ScissorOutlined /> },
        { key: '/manufacturing/service-groups', label: 'Szolgáltatás csoportok', icon: <GroupOutlined /> },
        { key: '/manufacturing/calculators', label: 'Kalkulátorok', icon: <CalculatorOutlined /> },
        { key: '/manufacturing/boms', label: 'BOM-ok', icon: <ForkOutlined /> },
        { key: '/manufacturing/inventory', label: 'Készlet', icon: <DatabaseOutlined /> },
        { key: '/manufacturing/work-orders', label: 'Munkarendelések', icon: <ToolOutlined /> },
        { key: '/manufacturing/quality', label: 'Minőségbiztosítás', icon: <CheckCircleOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="Gyártás" items={dashboardItems} />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product-editor" element={<ProductEditor />} />
            <Route path="/ordered-products" element={<OrderedProducts />} />
            <Route path="/product-classes" element={<ProductClasses />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/services" element={<Services />} />
            <Route path="/service-groups" element={<ServiceGroups />} />
            <Route path="/calculators" element={<CalculatorTemplates />} />
            <Route path="/calculator/:templateId" element={<Calculator />} />
            <Route path="/boms" element={<div>BOM-ok (Fejlesztés alatt)</div>} />
            <Route path="/inventory" element={<div>Készlet (Fejlesztés alatt)</div>} />
            <Route path="/work-orders" element={<div>Munkarendelések (Fejlesztés alatt)</div>} />
            <Route path="/quality" element={<div>Minőségbiztosítás (Fejlesztés alatt)</div>} />
        </Routes>
    );
};

export default ManufacturingModule;
