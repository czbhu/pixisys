import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'antd';
import PrintCatalogContent from './PrintCatalogContent';

const PrintCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const openProduct = (productId: number) => {
    try {
      const s = localStorage.getItem('pixierp_editor_state');
      const stored = s ? JSON.parse(s) : {};
      stored.preload_product_id = productId;
      localStorage.setItem('pixierp_editor_state', JSON.stringify(stored));
    } catch {}
    navigate('/print-shop');
  };
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PrintCatalogContent
        onSelectProduct={openProduct}
        headerExtra={<Button onClick={() => navigate('/print-shop')}>Megnyitott megrendelés</Button>}
      />
    </div>
  );
};

export default PrintCatalogPage;
