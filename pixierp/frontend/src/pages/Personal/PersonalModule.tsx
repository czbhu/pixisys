import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MyOrders from './MyOrders';
import MyInvitations from './MyInvitations';
import MyAttendance from './MyAttendance';

const PersonalModule: React.FC = () => {
    return (
        <Routes>
            <Route path="orders" element={<MyOrders />} />
            <Route path="invitations" element={<MyInvitations />} />
            <Route path="attendance" element={<MyAttendance />} />
            <Route path="*" element={<Navigate to="orders" replace />} />
        </Routes>
    );
};
export default PersonalModule;
