import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MyOrders from './MyOrders';
import MyInvitations from './MyInvitations';

const PersonalModule: React.FC = () => {
    return (
        <Routes>
            <Route path="orders" element={<MyOrders />} />
            <Route path="invitations" element={<MyInvitations />} />
            <Route path="*" element={<Navigate to="orders" replace />} />
        </Routes>
    );
};
export default PersonalModule;
