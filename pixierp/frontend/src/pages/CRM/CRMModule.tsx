import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    ShopOutlined,
    TeamOutlined,
    PhoneOutlined,
    BellOutlined
} from '@ant-design/icons';
import Companies from './Companies';
import Contacts from './Contacts';
import Activities from './Activities';
import Campaigns from './Campaigns';
import ModuleDashboard from '../../components/ModuleDashboard';

const CRMModule = () => {
    const dashboardItems = [
         { key: '/crm/companies', label: 'Cégek', icon: <ShopOutlined /> },
         { key: '/crm/contacts', label: 'Kapcsolatok', icon: <TeamOutlined /> },
         { key: '/crm/activities', label: 'Tevékenységek', icon: <PhoneOutlined /> },
         { key: '/crm/campaigns', label: 'Kampányok', icon: <BellOutlined /> },
    ];

    return (
        <Routes>
            <Route path="/" element={<ModuleDashboard title="CRM" items={dashboardItems} />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/campaigns" element={<Campaigns />} />
        </Routes>
    );
};

export default CRMModule;
