import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Products from './Products';
import ProductClasses from './ProductClasses';
import Projects from './Projects';

const ManufacturingModule: React.FC = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/manufacturing/products" replace />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product-classes" element={<ProductClasses />} />
            <Route path="/projects" element={<Projects />} />
        </Routes>
    );
};

export default ManufacturingModule;