import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    AppstoreAddOutlined,
    DeploymentUnitOutlined
} from '@ant-design/icons';
import Sales from './Sales';
import Registration from './Registration';
import Terminals from './Terminals';
import ModuleDashboard from '../../components/ModuleDashboard';

const POSModule = () => {
    const dashboardItems = [
        { key: '/pos/registration', label: 'POS regisztráció', icon: <AppstoreAddOutlined /> },
        { key: '/pos/terminals', label: 'POSek', icon: <DeploymentUnitOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="POS" items={dashboardItems} />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/registration" element={<Registration />} />
            <Route path="/terminals" element={<Terminals />} />
        </Routes>
    );
};

export default POSModule;
