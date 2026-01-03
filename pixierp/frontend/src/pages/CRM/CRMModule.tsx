import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Companies from './Companies';
import Contacts from './Contacts';
import Activities from './Activities';
import Campaigns from './Campaigns';

const CRMModule = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/crm/companies" replace />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/campaigns" element={<Campaigns />} />
        </Routes>
    );
};

export default CRMModule;
