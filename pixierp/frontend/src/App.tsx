import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout, ConfigProvider, Drawer, notification } from 'antd';
import huHU from 'antd/locale/hu_HU';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import Login from './pages/Auth/Login';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import Dashboard from './pages/Dashboard';
import HRModule from './pages/HR/HRModule';
import SalesModule from './pages/Sales/SalesModule';
import ManufacturingModule from './pages/Manufacturing/ManufacturingModule';
import FinanceModule from './pages/Finance/FinanceModule';
import CRMModule from './pages/CRM/CRMModule';
import OrdersModule from './pages/Orders/OrdersModule';
import WarehouseModule from './pages/Warehouse/WarehouseModule';
import POSModule from './pages/POS/POSModule';
import SettingsModule from './pages/Settings/SettingsModule';
import PersonalModule from './pages/Personal/PersonalModule';
import Tickets from './pages/Tickets/Tickets';
import PublicQuoteOrder from './pages/Public/PublicQuoteOrder';
import PublicDelivery from './pages/Public/PublicDelivery';
import PublicDeliveryNote from './pages/Public/PublicDeliveryNote';
import PublicTicket from './pages/Public/PublicTicket';
import PublicSite from './pages/Public/PublicSite';
import ClientPortal from './pages/Public/ClientPortal';
import KioskPage from './pages/Public/KioskPage';
import SiteManagement from './pages/SiteManagement/SiteManagement';
import SiteManagementPreview from './pages/SiteManagement/SiteManagementPreview';
import POSSales from './pages/POS/Sales';
import PrintEditorPage from './pages/PrintEditor/PrintEditorPage';
import PrintPreviewPage from './pages/PrintEditor/PrintPreviewPage';
import PrintStoragePage from './pages/PrintEditor/PrintStoragePage';
import PrintShopPage from './pages/PrintEditor/PrintShopPage';
import PrintTemplatesPage from './pages/PrintEditor/PrintTemplatesPage';
import StoragePage from './pages/Storage/StoragePage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { TimeTrackerProvider } from './contexts/TimeTrackerContext';
import { ActionHistoryProvider } from './contexts/ActionHistoryContext';
import { CartProvider } from './contexts/CartContext';
import { PickingProvider } from './contexts/PickingContext';
import CartDrawer from './components/Cart/CartDrawer';
import { manufacturingService } from './services/manufacturingService';
import { notificationWS } from './services/notificationWebSocket';
import './App.css';

import { notificationService } from './services/notificationService';

// Add this interface
interface NotificationCounts {
    [key: string]: number;
}

const { Content } = Layout;

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const isSitePreviewPage = /^\/site-management\/[^/]+$/.test(location.pathname);
  const isPublicPrintPreview = location.pathname.startsWith('/public/print-preview/');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [inviteCount, setInviteCount] = useState<number>(0);
  // Add state for generic notification counts map
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({});
  
  const refreshCounts = () => {
    notificationService.getUnreadCounts().then(data => {
        setNotificationCounts(data);
        // Also update invite count specifically if needed, or rely on this new system
        // But for backward compatibility with pure Invite logic:
        import('./services/salesService').then(mod => {
            mod.salesService.getMyInvitationsCount('pending').then(cnt => setInviteCount(cnt));
        });
    }).catch(console.error);
  };

  // Initialize Notification WebSocket
  useEffect(() => {
    if (user) {
      // Initial fetch
      refreshCounts();

      notificationWS.connect();
      
      const unsubscribe = notificationWS.onNotification((msg) => {
        // Handle attendance refresh specifically
        if (msg.link === '/personal/attendance' || msg.title === 'Jelenlét frissítés') {
            window.dispatchEvent(new Event('attendance-updated'));
        }

        notification.open({
          message: msg.title,
          description: msg.message,
          type: msg.level,
          onClick: () => {
            if (msg.link) {
              window.location.href = msg.link;
            }
          },
        });
        // Refresh all counts on any notification
        refreshCounts();
      });
      
      return () => {
        unsubscribe();
      }
    }
  }, [user]);

  // Mark notifications as read when visiting a page
  useEffect(() => {
    if (user) {
        notificationService.markAsReadByLink(location.pathname)
            .then(() => refreshCounts())
            .catch(console.error);
    }
  }, [location.pathname, user]);



  useEffect(() => {
    if (!user) return;
    
    let cancelled = false;
    const load = async () => {
      try {
        const mod = await import('./services/salesService');
        const cnt = await mod.salesService.getMyInvitationsCount('pending');
        if (!cancelled) setInviteCount(cnt);
      } catch (e) {
        // ignore
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuVisible(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Update favicon badge when notification counts change
  useEffect(() => {
    const totalBadge = Object.values(notificationCounts).reduce((s, v) => s + (Number(v) || 0), 0);
    const link: HTMLLinkElement = (document.querySelector("link[rel='icon']") as HTMLLinkElement) || document.createElement('link');
    if (!link.parentNode) {
      (link as HTMLLinkElement).rel = 'icon';
      document.head.appendChild(link);
    }
    if (totalBadge === 0) {
      link.href = '/favicon.ico';
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 32, 32);
      const count = totalBadge > 99 ? '99+' : String(totalBadge);
      const radius = count.length > 2 ? 9 : 7;
      ctx.beginPath();
      ctx.arc(26, 6, radius, 0, 2 * Math.PI);
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
      ctx.font = `bold ${count.length > 2 ? 7 : 9}px Arial`;
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(count, 26, 6);
      link.href = canvas.toDataURL('image/png');
    };
    img.src = '/favicon.ico';
  }, [notificationCounts]);

  // Automatikus napi árfolyam frissítés
  useEffect(() => {
    if (!user) return;

    const updateExchangeRates = async () => {
      const lastUpdate = localStorage.getItem('lastExchangeRateUpdate');
      const today = new Date().toDateString();

      if (lastUpdate !== today) {
        try {
          console.log('Automatikus árfolyam frissítés...');
          await manufacturingService.updateExchangeRates();
          localStorage.setItem('lastExchangeRateUpdate', today);
          console.log('Árfolyamok frissítve');
        } catch (error) {
          console.error('Árfolyam frissítés sikertelen:', error);
        }
      }
    };

    updateExchangeRates();
  }, [user]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (isPublicPrintPreview) {
    return <PrintPreviewPage />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
        <Route path="/public/quote/:token/order" element={<PublicQuoteOrder />} />
        <Route path="/public/delivery/:token" element={<PublicDelivery />} />
        <Route path="/public/delivery-note/:token" element={<PublicDeliveryNote />} />
        <Route path="/public/ticket/:token" element={<PublicTicket />} />
        <Route path="/public/print-preview/:token" element={<PrintPreviewPage />} />
        <Route path="/site" element={<PublicSite />} />
        <Route path="/portal" element={<ClientPortal />} />
        <Route path="/kiosk" element={<KioskPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (isSitePreviewPage) {
    return <SiteManagementPreview />;
  }

  // POS Sales fullscreen mode - no sidebar, no header
  const isPOSSales = location.pathname.startsWith('/pos/sales');
  
  if (isPOSSales) {
    return <POSSales />;
  }

  // Print Editor fullscreen mode - no sidebar
  const isPrintEditor = location.pathname.startsWith('/print-editor');
  if (isPrintEditor) {
    return <PrintEditorPage />;
  }

  // Print Shop fullscreen mode - no sidebar
  const isPrintShop = location.pathname.startsWith('/print-shop');
  if (isPrintShop) {
    return <PrintShopPage />;
  }

  // Print Preview fullscreen mode - no sidebar
  const isPrintPreview = location.pathname.startsWith('/print-preview');
  if (isPrintPreview) {
    return <PrintPreviewPage />;
  }

  // Print Storage fullscreen mode - no sidebar
  const isPrintStorage = location.pathname.startsWith('/print-storage');
  if (isPrintStorage) {
    return <PrintStoragePage />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          onClose={() => setMobileMenuVisible(false)}
          open={mobileMenuVisible}
          styles={{ body: { padding: 0 } }}
          width={250}
        >
          <Sidebar 
            collapsed={false}
            onCollapse={() => setMobileMenuVisible(false)}
            onNavigate={() => setMobileMenuVisible(false)}
            inviteCount={inviteCount}
            notificationCounts={notificationCounts}
          />
        </Drawer>
      ) : (
        <Sidebar 
            collapsed={sidebarCollapsed} 
            onCollapse={setSidebarCollapsed}
            inviteCount={inviteCount}
            notificationCounts={notificationCounts}
        />
      )}
      <Layout style={{ 
        marginLeft: isMobile ? 0 : (sidebarCollapsed ? 80 : 200),
        transition: 'margin-left 0.2s',
        marginBottom: 0
      }}>
        <Header 
          onMenuClick={() => setMobileMenuVisible(true)}
          isMobile={isMobile}
          inviteCount={inviteCount}
        />
        <CartDrawer />
        <Content style={{ 
          margin: isMobile ? '2px' : '2px', 
          padding: 0, 
          background: '#f0f2f5', 
          minHeight: 280
        }}>
          <Routes>
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/public/quote/:token/order" element={<PublicQuoteOrder />} />
            <Route path="/public/delivery/:token" element={<PublicDelivery />} />
            <Route path="/public/delivery-note/:token" element={<PublicDeliveryNote />} />
            <Route path="/public/ticket/:token" element={<PublicTicket />} />
            <Route path="/site" element={<PublicSite />} />
            <Route path="/portal" element={<ClientPortal />} />
            <Route path="/kiosk" element={<KioskPage />} />
            <Route path="/hr/*" element={<HRModule />} />
            <Route path="/sales/*" element={<SalesModule />} />
            <Route path="/manufacturing/*" element={<ManufacturingModule />} />
            <Route path="/finance/*" element={<FinanceModule />} />
            <Route path="/crm/*" element={<CRMModule />} />
            <Route path="/orders/*" element={<OrdersModule />} />
            <Route path="/warehouse/*" element={<WarehouseModule />} />
            <Route path="/pos/*" element={<POSModule />} />
            <Route path="/settings/*" element={<SettingsModule />} />
            <Route path="/personal/*" element={<PersonalModule />} />
            <Route path="/tickets" element={<Navigate to="/tickets/list" replace />} />
            <Route path="/tickets/list" element={<Tickets mode="list" />} />
            <Route path="/tickets/settings" element={<Tickets mode="settings" />} />
            <Route path="/site-management" element={<SiteManagement />} />
            <Route path="/site-management/:slug" element={<SiteManagementPreview />} />
            <Route path="/print-editor/*" element={<PrintEditorPage />} />
            <Route path="/print-shop/*" element={<PrintShopPage />} />
            <Route path="/manufacturing/print-templates" element={<PrintTemplatesPage />} />
            <Route path="/storage" element={<StoragePage />} />
          </Routes>
        </Content>

      </Layout>
    </Layout>
  );
}

function App() {
  return (
    <ConfigProvider locale={huHU}>
      <SettingsProvider>
        <AuthProvider>
          <ActionHistoryProvider>
            <TimeTrackerProvider>
              <CartProvider>
                <PickingProvider>
                  <AppContent />
                </PickingProvider>
              </CartProvider>
            </TimeTrackerProvider>
          </ActionHistoryProvider>
        </AuthProvider>
      </SettingsProvider>
    </ConfigProvider>
  );
}

export default App;