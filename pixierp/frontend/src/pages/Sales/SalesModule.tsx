import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
    FileTextOutlined,
    ShoppingCartOutlined,
    CarOutlined,
    FileDoneOutlined,
    MailOutlined,
    ProjectOutlined,
    LineChartOutlined
} from '@ant-design/icons';
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
import OrderItemSubItems from './OrderItemSubItems';
import Invoicing from './Invoicing';
import DeliveryNotes from './DeliveryNotes';
import ModuleDashboard from '../../components/ModuleDashboard';

const SalesModule = () => {
    const dashboardItems = [
        { key: '/sales/rfqs', label: 'Árajánlatok', icon: <FileTextOutlined /> },
        { key: '/sales/customer-orders', label: 'Megrendelések', icon: <ShoppingCartOutlined /> },
        { key: '/sales/delivery-notes', label: 'Szállítás', icon: <CarOutlined /> },
        { key: '/sales/invoicing', label: 'Számlázás', icon: <FileDoneOutlined /> },
        { key: '/sales/invitations', label: 'Meghívásaim', icon: <MailOutlined /> },
        { key: '/sales/projects', label: 'Projektek', icon: <ProjectOutlined /> },
        { key: '/sales/forecasts', label: 'Előrejelzések', icon: <LineChartOutlined /> },
    ];

  return (
    <Routes>
      <Route path="/" element={<ModuleDashboard title="Értékesítés" items={dashboardItems} />} />
      <Route path="/rfqs" element={<RFQs />} />
      <Route path="/rfqs/:id" element={<RFQDetail />} />
      <Route path="/quotes/:id" element={<QuoteDetail />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/orders/:id" element={<OrderDetail />} />
      <Route path="/orders/:id/edit" element={<OrderForm />} />
      <Route path="/customer-orders" element={<CustomerOrders />} />
      <Route path="/customer-orders/:id" element={<CustomerOrderDetail />} />
      <Route path="/customer-orders/:orderId/items/:itemId/subitems" element={<OrderItemSubItems />} />
      <Route path="/delivery-notes" element={<DeliveryNotes />} />
      <Route path="/invoicing" element={<Invoicing />} />
      <Route path="/invitations" element={<MyInvitations />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/forecasts" element={<Forecasts />} />
    </Routes>
  );
};

export default SalesModule;
