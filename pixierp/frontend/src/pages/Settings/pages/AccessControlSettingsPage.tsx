import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Checkbox, Space, message, Tag, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, ApiOutlined, DisconnectOutlined } from '@ant-design/icons';
import { hrService } from '../../../services/hrService';
import { accessControlWS, DeviceStatus, WebSocketMessage } from '../../../services/accessControlWebSocket';

interface AccessControlConfig {
  id: number;
  name: string;
  device_id: string;
  device_ip: string;
  device_port: number;
  location?: string;
  description?: string;
  is_active: boolean;
  is_online?: boolean;
  last_seen?: string;
  online_status?: 'online' | 'offline' | 'checking';
}

const AccessControlSettingsPage: React.FC = () => {
  const [configs, setConfigs] = useState<AccessControlConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AccessControlConfig | null>(null);
  const [form] = Form.useForm();
  const [testingId, setTestingId] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    fetchConfigs();
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      accessControlWS.disconnect();
    };
  }, []);

  const connectWebSocket = async () => {
    try {
      await accessControlWS.connect();
      setWsConnected(true);
      message.success('Real-time monitoring aktív');
      
      // Subscribe to device status updates
      accessControlWS.on('device_status', handleDeviceStatus);
      accessControlWS.on('connection_test_result', handleConnectionTestResult);
      accessControlWS.on('error', handleWebSocketError);
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      message.warning('Real-time monitoring nem elérhető');
      setWsConnected(false);
    }
  };

  const handleDeviceStatus = (message: WebSocketMessage) => {
    const status = message as DeviceStatus & { type: string };
    
    setConfigs(prev => prev.map(config => {
      if (config.id === status.device_db_id) {
        return {
          ...config,
          online_status: status.online ? 'online' as const : 'offline' as const
        };
      }
      return config;
    }));
  };

  const handleConnectionTestResult = (message: WebSocketMessage) => {
    const { device_id, result } = message;
    
    if (result.success) {
      message.success(`Kapcsolat sikeres: ${device_id}`);
      Modal.success({
        title: 'Kapcsolat sikeres',
        content: (
          <div>
            <p><strong>Eszköz típus:</strong> {result.device_info.terminal_type}</p>
            <p><strong>Terméknév:</strong> {result.device_info.product_name}</p>
            <p><strong>Gép ID:</strong> {result.device_info.machine_id}</p>
            <p><strong>Nyelv:</strong> {result.device_info.language}</p>
          </div>
        )
      });
    } else {
      message.error(`Kapcsolat sikertelen: ${result.error}`);
    }
    
    setTestingId(null);
  };

  const handleWebSocketError = (message: WebSocketMessage) => {
    console.error('WebSocket error:', message.message);
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const data = await hrService.getAccessControlConfigs();
      // A service már response.data-t ad vissza, ami paginated válasz (count, results, stb.)
      const configsWithStatus = (data.results || []).map((config: AccessControlConfig) => ({
        ...config,
        online_status: config.is_online ? 'online' as const : 'offline' as const
      }));
      setConfigs(configsWithStatus);
    } catch (error) {
      message.error('Hiba a beléptető eszközök betöltése során');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const checkAllDevicesStatus = async (configList: AccessControlConfig[]) => {
    // Párhuzamosan ellenőrizzük az összes eszközt
    const statusChecks = configList.map(async (config) => {
      try {
        const response = await hrService.testConnection({
          device_ip: config.device_ip,
          device_port: config.device_port,
          device_id: config.device_id
        });
        return {
          id: config.id,
          status: response.data.success ? 'online' as const : 'offline' as const
        };
      } catch (error) {
        return {
          id: config.id,
          status: 'offline' as const
        };
      }
    });

    const results = await Promise.all(statusChecks);
    
    setConfigs(prev => prev.map(config => {
      const result = results.find(r => r.id === config.id);
      return {
        ...config,
        online_status: result?.status || 'offline'
      };
    }));
  };

  const handleAdd = () => {
    setEditingConfig(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (config: AccessControlConfig) => {
    setEditingConfig(config);
    form.setFieldsValue(config);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: 'Biztosan törli ezt az eszközt?',
      content: 'Ez a művelet nem vonható vissza.',
      okText: 'Törlés',
      okType: 'danger',
      cancelText: 'Mégse',
      onOk: async () => {
        try {
          await hrService.deleteAccessControlConfig(id);
          message.success('Eszköz törölve');
          fetchConfigs();
        } catch (error) {
          message.error('Hiba az eszköz törlése során');
          console.error(error);
        }
      }
    });
  };

  const handleTest = async (config: AccessControlConfig) => {
    setTestingId(config.id);
    
    // Use WebSocket if connected, otherwise fallback to HTTP
    if (wsConnected && accessControlWS.isConnected()) {
      accessControlWS.testConnection(
        config.device_id,
        config.device_ip,
        config.device_port
      );
    } else {
      // Fallback to HTTP test
      try {
        const response = await hrService.testConnection({
          device_ip: config.device_ip,
          device_port: config.device_port,
          device_id: config.device_id
        });
        
        if (response.data.success) {
          // Frissítjük a státuszt online-ra
          setConfigs(prev => prev.map(c => 
            c.id === config.id ? { ...c, online_status: 'online' as const } : c
          ));
          
          const deviceInfo = response.data.device_info;
          Modal.success({
            title: 'Kapcsolat sikeres',
            content: (
              <div>
                <p><strong>Eszköz típus:</strong> {deviceInfo.terminal_type}</p>
                <p><strong>Terméknév:</strong> {deviceInfo.product_name}</p>
                <p><strong>Gép ID:</strong> {deviceInfo.machine_id}</p>
                <p><strong>Nyelv:</strong> {deviceInfo.language}</p>
              </div>
            )
          });
        } else {
          setConfigs(prev => prev.map(c => 
            c.id === config.id ? { ...c, online_status: 'offline' as const } : c
          ));
          message.error(response.data.error || 'Kapcsolódási hiba');
        }
      } catch (error: any) {
        setConfigs(prev => prev.map(c => 
          c.id === config.id ? { ...c, online_status: 'offline' as const } : c
        ));
        message.error(error.response?.data?.error || 'Kapcsolódási hiba');
        console.error(error);
      } finally {
        setTestingId(null);
      }
    }
  };

  const handleRefreshStatus = () => {
    if (wsConnected && accessControlWS.isConnected()) {
      accessControlWS.getAllStatus();
      message.info('Státusz frissítése...');
    } else {
      setConfigs(prev => prev.map(c => ({ ...c, online_status: 'checking' as const })));
      checkAllDevicesStatus(configs);
      message.info('Státusz frissítése folyamatban...');
    }
  };

  const handleDiscoverDevices = async () => {
    setDiscovering(true);
    try {
      const response = await hrService.discoverDevices();
      const { connected_devices, total, message: msg } = response;
      
      if (total === 0) {
        Modal.info({
          title: 'Nincs csatlakozott eszköz',
          content: (
            <div>
              <p>Jelenleg nincs online eszköz az adatbázisban.</p>
              <p><strong>Ellenőrizze:</strong></p>
              <ul>
                <li>Az eszköz csatlakozik-e a <code>ws://192.168.5.25:8001</code> címhez</li>
                <li>A DeviceBroker service fut-e</li>
                <li>Az eszköz regisztrálta-e magát</li>
                <li>A hálózati kapcsolat működik-e</li>
              </ul>
            </div>
          )
        });
      } else {
        // Frissítjük a listát
        fetchConfigs();
        
        Modal.success({
          title: msg || `${total} eszköz online`,
          content: (
            <div>
              {connected_devices.map((device: any) => (
                <div key={device.device_id} style={{ marginBottom: 12, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                  <p><strong>Név:</strong> {device.name}</p>
                  <p><strong>Device ID:</strong> {device.device_id}</p>
                  {device.ip && <p><strong>IP cím:</strong> {device.ip}:{device.port}</p>}
                  {device.location && <p><strong>Helyszín:</strong> {device.location}</p>}
                  {device.connected_at && (
                    <p><strong>Utoljára látva:</strong> {new Date(device.connected_at).toLocaleString('hu-HU')}</p>
                  )}
                </div>
              ))}
            </div>
          ),
          width: 600
        });
      }
    } catch (error: any) {
      message.error('Hiba az eszközök keresése során');
      console.error(error);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingConfig) {
        await hrService.updateAccessControlConfig(editingConfig.id, values);
        message.success('Eszköz frissítve');
      } else {
        await hrService.createAccessControlConfig(values);
        message.success('Eszköz hozzáadva');
      }
      
      setModalVisible(false);
      fetchConfigs();
    } catch (error: any) {
      // Backend validációs hibák kezelése
      if (error?.response?.data) {
        const backendErrors = error.response.data;
        
        // Device ID uniqueness hiba
        if (backendErrors.device_id) {
          form.setFields([{
            name: 'device_id',
            errors: ['Ez az eszköz azonosító már használatban van']
          }]);
          message.error('Ez az eszköz azonosító már létezik');
        } 
        // Egyéb mezőhibák
        else {
          const fieldErrors = Object.entries(backendErrors).map(([field, errors]: [string, any]) => ({
            name: field,
            errors: Array.isArray(errors) ? errors : [errors]
          }));
          
          if (fieldErrors.length > 0) {
            form.setFields(fieldErrors);
            message.error('Kérjük javítsa a hibákat');
          } else {
            message.error('Hiba az eszköz mentése során');
          }
        }
      } else {
        message.error('Hiba az eszköz mentése során');
      }
      console.error(error);
    }
  };

  const columns = [
    {
      title: 'Név',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: 'Device ID',
      dataIndex: 'device_id',
      key: 'device_id',
      width: 120,
    },
    {
      title: 'IP:Port',
      key: 'connection',
      width: 150,
      render: (_: any, record: AccessControlConfig) => 
        `${record.device_ip}:${record.device_port}`,
    },
    {
      title: 'Helyszín',
      dataIndex: 'location',
      key: 'location',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: 'Leírás',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    {
      title: 'Státusz',
      key: 'status',
      width: 150,
      render: (_: any, record: AccessControlConfig) => {
        const isOnline = record.is_online || record.online_status === 'online';
        const lastSeen = record.last_seen ? new Date(record.last_seen) : null;
        const now = new Date();
        const minutesAgo = lastSeen ? Math.floor((now.getTime() - lastSeen.getTime()) / 60000) : null;
        
        if (record.online_status === 'checking') {
          return <Tag icon={<SyncOutlined spin />} color="processing">Ellenőrzés...</Tag>;
        }
        
        if (isOnline && minutesAgo !== null && minutesAgo < 2) {
          return (
            <Tooltip title={`Utoljára látva: ${minutesAgo < 1 ? 'most' : minutesAgo + ' perce'}`}>
              <Tag icon={<CheckCircleOutlined />} color="success">
                Online
              </Tag>
            </Tooltip>
          );
        }
        
        if (lastSeen && minutesAgo !== null) {
          const timeAgo = minutesAgo < 60 
            ? `${minutesAgo} perce` 
            : minutesAgo < 1440 
              ? `${Math.floor(minutesAgo / 60)} órája`
              : `${Math.floor(minutesAgo / 1440)} napja`;
              
          return (
            <Tooltip title={`Utoljára látva: ${timeAgo}`}>
              <Tag icon={<CloseCircleOutlined />} color="warning">
                Offline
              </Tag>
            </Tooltip>
          );
        }
        
        return (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Offline
          </Tag>
        );
      },
    },
    {
      title: 'Aktív',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      align: 'center' as const,
      render: (value: boolean) => value ? 
        <CheckCircleOutlined style={{ color: '#52c41a' }} /> : 
        <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 200,
      render: (_: any, record: AccessControlConfig) => (
        <Space>
          <Tooltip title="Szerkesztés">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Kapcsolat tesztelése">
            <Button
              type="link"
              loading={testingId === record.id}
              onClick={() => handleTest(record)}
            >
              Teszt
            </Button>
          </Tooltip>
          <Tooltip title="Törlés">
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Beléptető eszközök kezelése</h2>
          {wsConnected ? (
            <Tag icon={<ApiOutlined />} color="success">Real-time monitoring aktív</Tag>
          ) : (
            <Tag icon={<DisconnectOutlined />} color="warning">Offline monitoring</Tag>
          )}
        </div>
        <Space>
          <Button 
            icon={<SyncOutlined />} 
            onClick={handleRefreshStatus}
          >
            Státusz frissítése
          </Button>
          <Button 
            icon={<ApiOutlined />} 
            loading={discovering}
            onClick={handleDiscoverDevices}
          >
            Eszközök keresése
          </Button>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={handleAdd}
          >
            Új eszköz hozzáadása
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={configs}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title={editingConfig ? 'Eszköz szerkesztése' : 'Új eszköz hozzáadása'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="Mentés"
        cancelText="Mégse"
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Eszköz neve"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. Nyomda bejárat" />
          </Form.Item>

          <Form.Item
            name="device_id"
            label="Device ID"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. 1001" />
          </Form.Item>

          <Form.Item
            name="device_ip"
            label="Device IP cím"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="pl. 192.168.1.101" />
          </Form.Item>

          <Form.Item
            name="device_port"
            label="Device Port"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input type="number" placeholder="pl. 4370" />
          </Form.Item>

          <Form.Item
            name="location"
            label="Helyszín"
          >
            <Input placeholder="pl. Nyomdai épület" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Leírás"
          >
            <Input.TextArea rows={3} placeholder="Eszköz részletes leírása..." />
          </Form.Item>

          <Form.Item name="is_active" valuePropName="checked">
            <Checkbox>Aktív</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AccessControlSettingsPage;
