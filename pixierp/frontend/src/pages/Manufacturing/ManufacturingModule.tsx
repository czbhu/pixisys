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
    AppstoreOutlined,
    FileOutlined,
    OrderedListOutlined,
} from '@ant-design/icons';
import Products from './Products';
import ProductDetail from './ProductDetail';
import ProductEditor from './ProductEditor';
import OrderedProducts from './OrderedProducts';
import ProductionQueue from './ProductionQueue';
import ProductClasses from './ProductClasses';
import Projects from './Projects';
import Services from './Services';
import ServiceGroups from './ServiceGroups';
import CalculatorTemplates from './CalculatorTemplates';
import Calculator from './Calculator';
import UVCalculator from './UVCalculator';
import ModuleDashboard from '../../components/ModuleDashboard';

const ManufacturingModule: React.FC = () => {
    const dashboardItems = [
        { key: '/manufacturing/products', label: 'Egyedi gyártás', icon: <SkinOutlined /> },
        { key: '/manufacturing/product-editor', label: 'Termék szerkesztő', icon: <AppstoreOutlined /> },
        { key: '/manufacturing/ordered-products', label: 'Megrendelt Gyártások', icon: <ShoppingOutlined /> },
        { key: '/manufacturing/queue', label: 'Gyártási Sor', icon: <OrderedListOutlined /> },
        { key: '/manufacturing/product-classes', label: 'Termékkategóriák', icon: <TagsOutlined /> },
        { key: '/manufacturing/services', label: 'Szolgáltatások', icon: <ScissorOutlined /> },
        { key: '/manufacturing/service-groups', label: 'Szolgáltatás csoportok', icon: <GroupOutlined /> },
        { key: '/manufacturing/calculators', label: 'Kalkulátorok', icon: <CalculatorOutlined /> },
        { key: '/manufacturing/uv-calculator', label: 'UV Nyomtató Kalkulátor', icon: <ToolOutlined /> },
        { key: '/manufacturing/print-templates', label: 'Sablonok', icon: <FileOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="Gyártás" items={dashboardItems} />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<ProductDetail />} />
            <Route path="/product-editor" element={<ProductEditor />} />
            <Route path="/ordered-products" element={<OrderedProducts />} />
            <Route path="/queue" element={<ProductionQueue />} />
            <Route path="/product-classes" element={<ProductClasses />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/services" element={<Services />} />
            <Route path="/service-groups" element={<ServiceGroups />} />
            <Route path="/calculators" element={<CalculatorTemplates />} />
            <Route path="/calculator/:templateId" element={<Calculator />} />
            <Route path="/uv-calculator" element={<UVCalculator />} />
        </Routes>
    );
};

export default ManufacturingModule;
