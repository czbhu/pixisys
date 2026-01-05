import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Demands from './Demands';
import Orders from './Orders';
import OrderDetail from './OrderDetail';
import OrderForm from './OrderForm';
import Projects from './Projects';
import Forecasts from './Forecasts';
import RFQs from './RFQs';
import RFQDetail from './RFQDetail';
import MyInvitations from './MyInvitations';
import QuoteDetail from './QuoteDetail';
import CustomerOrders from './CustomerOrders';
import CustomerOrderDetail from './CustomerOrderDetail';
import Invoicing from './Invoicing';

const SalesModule = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/sales/rfqs" replace />} />
      <Route path="/rfqs" element={<RFQs />} />
      <Route path="/rfqs/:id" element={<RFQDetail />} />
      <Route path="/quotes/:id" element={<QuoteDetail />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/orders/:id" element={<OrderDetail />} />
      <Route path="/orders/:id/edit" element={<OrderForm />} />
      <Route path="/customer-orders" element={<CustomerOrders />} />
      <Route path="/customer-orders/:id" element={<CustomerOrderDetail />} />
      <Route path="/invoicing" element={<Invoicing />} />
      <Route path="/invitations" element={<MyInvitations />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/forecasts" element={<Forecasts />} />
    </Routes>
  );
};

export default SalesModule;
