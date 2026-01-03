import React, { useState } from 'react';
import { Card, Button, Upload, message, Space, Typography, Alert } from 'antd';
import { DownloadOutlined, UploadOutlined, DatabaseOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import axios from 'axios';

const { Title, Paragraph } = Typography;

const Backup: React.FC = () => {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await axios.get('/api/v1/backup/export/', {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = response.headers['content-disposition']
        ?.split('filename=')[1]
        ?.replace(/"/g, '') || `backup_${new Date().toISOString()}.json`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      message.success('Adatbázis sikeresen exportálva');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Hiba az exportálás során');
    } finally {
      setExporting(false);
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    action: '/api/v1/backup/import/',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('access_token')}`,
    },
    maxCount: 1,
    accept: '.json',
    beforeUpload: (file) => {
      const isJson = file.type === 'application/json' || file.name.endsWith('.json');
      if (!isJson) {
        message.error('Csak JSON fájlokat lehet feltölteni!');
      }
      return isJson;
    },
    onChange(info) {
      if (info.file.status === 'uploading') {
        setImporting(true);
      }
      if (info.file.status === 'done') {
        setImporting(false);
        message.success('Adatbázis sikeresen importálva');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else if (info.file.status === 'error') {
        setImporting(false);
        message.error(info.file.response?.error || 'Hiba az importálás során');
      }
    },
  };

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <DatabaseOutlined /> Adatbázis Backup
      </Title>
      
      <Alert
        message="Figyelmeztetés"
        description="Az importálás felülírja az összes jelenlegi adatot! Mindig készíts biztonsági mentést az importálás előtt."
        type="warning"
        showIcon
        style={{ marginBottom: '24px' }}
      />

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="Export" bordered={false}>
          <Paragraph>
            Az adatbázis teljes exportálása JSON formátumban. Ez tartalmazza az összes modult (HR, Sales, Finance, stb.).
          </Paragraph>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
            size="large"
          >
            Adatbázis letöltése
          </Button>
        </Card>

        <Card title="Import" bordered={false}>
          <Paragraph>
            Korábban exportált adatbázis visszatöltése. <strong>FIGYELEM:</strong> Ez felülírja az összes jelenlegi adatot!
          </Paragraph>
          <Upload {...uploadProps}>
            <Button
              icon={<UploadOutlined />}
              loading={importing}
              size="large"
              danger
            >
              Adatbázis feltöltése
            </Button>
          </Upload>
          <Paragraph type="secondary" style={{ marginTop: '12px' }}>
            Csak .json fájlokat fogad el
          </Paragraph>
        </Card>
      </Space>
    </div>
  );
};

export default Backup;
