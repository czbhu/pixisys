import React, { useEffect, useState } from 'react';
import { Table, Button, Collapse, Statistic, Row, Col, Modal, Form, Input, InputNumber, Select, Checkbox, message, Space, Popconfirm, Card, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CalculatorOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';
import { crmService } from '../../services/crmService';

const { Panel } = Collapse;
const { Text } = Typography;

interface RFQCostsTableProps {
  rfqId: number;
  totalRevenue: number;
  currency: string;
}

export const RFQCostsTable: React.FC<RFQCostsTableProps> = ({ rfqId, totalRevenue, currency }) => {
  const [costs, setCosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [form] = Form.useForm();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [activeKey, setActiveKey] = useState<string | string[]>('1');

  useEffect(() => {
    loadCosts();
    loadSuppliers();
  }, [rfqId]);

  const loadCosts = async () => {
    setLoading(true);
    try {
      const data = await salesService.getQuoteRequestCosts(rfqId);
      setCosts(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const res = await crmService.getCompanies();
      setSuppliers((res as any).results ?? res);
    } catch (e) {}
  };

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    form.setFieldsValue({
      ...item,
      supplier_id: item.supplier
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await salesService.deleteQuoteRequestCost(id);
      message.success('Költség törölve');
      loadCosts();
    } catch (e) {
      message.error('Hiba törléskor');
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        quote_request: rfqId,
        supplier: values.supplier_id
      };
      
      if (editingItem) {
        await salesService.updateQuoteRequestCost(editingItem.id, payload);
        message.success('Frissítve');
      } else {
        await salesService.createQuoteRequestCost(payload);
        message.success('Létrehozva');
      }
      setModalOpen(false);
      loadCosts();
    } catch (e) {
      console.error(e);
    }
  };

  const totalCosts = costs.reduce((sum, item) => sum + (Number(item.net_total) || 0), 0);
  const profit = totalRevenue - totalCosts;

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: 'Cikkszám', dataIndex: 'code' },
    { title: 'Megnevezés', dataIndex: 'name' },
    { title: 'Mennyiség', dataIndex: 'quantity', width: 100 },
    { title: 'Egység', dataIndex: 'unit', width: 80 },
    { title: 'Nettó ár', dataIndex: 'net_unit_price', width: 120, render: (v: number) => `${v?.toLocaleString()} ${currency}` },
    { title: 'Nettó összesen', dataIndex: 'net_total', width: 120, render: (v: number) => `${v?.toLocaleString()} ${currency}` },
    { title: 'Beszállító', dataIndex: 'supplier_name' },
    { title: 'Raktári', dataIndex: 'is_stock', render: (v: boolean) => (v ? 'Igen' : 'Nem') },
    {
      title: 'Műveletek',
      key: 'actions',
      width: 100,
      render: (_: any, r: any) => {
        if (r.is_implicit) {
          return <Text type="secondary" style={{ fontSize: '12px' }}>Auto</Text>;
        }
        return (
          <Space>
            <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(r)} />
            <Popconfirm title="Törlés?" onConfirm={() => handleDelete(r.id)}>
              <Button icon={<DeleteOutlined />} size="small" danger />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Card size="small" style={{ marginTop: 16 }}>
       <Collapse ghost>
         <Panel header={<Space><CalculatorOutlined /> <Text strong>Költség Kalkuláció</Text></Space>} key="1">
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ marginBottom: 16 }}>
              Új költség tétel
            </Button>
            <Table
              dataSource={costs}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="small"
              loading={loading}
              summary={(pageData) => {
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={6}><Text strong>Összesen</Text></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} colSpan={4}>
                            <Text strong>{totalCosts.toLocaleString()} {currency}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
              }}
            />
            
            <div style={{ marginTop: 24, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="Költségek összesen" value={totalCosts} precision={0} suffix={currency} />
                </Col>
                <Col span={8}>
                   <Statistic title="Bevétel összesen" value={totalRevenue} precision={0} suffix={currency} valueStyle={{ color: '#3f8600' }} />
                </Col>
                <Col span={8}>
                   <Statistic 
                     title="Haszon" 
                     value={profit} 
                     precision={0} 
                     suffix={currency} 
                     valueStyle={{ color: profit >= 0 ? '#3f8600' : '#cf1322' }} 
                   />
                </Col>
              </Row>
            </div>
         </Panel>
       </Collapse>

       <Modal
         title={editingItem ? 'Költség szerkesztése' : 'Új költség'}
         open={modalOpen}
         onCancel={() => setModalOpen(false)}
         onOk={handleOk}
       >
         <Form form={form} layout="vertical">
             <Form.Item name="code" label="Cikkszám">
               <Input />
             </Form.Item>
             <Form.Item name="name" label="Megnevezés" rules={[{ required: true }]}>
               <Input />
             </Form.Item>
             <Space>
               <Form.Item name="quantity" label="Mennyiség" initialValue={1} rules={[{ required: true }]}>
                 <InputNumber min={0} />
               </Form.Item>
               <Form.Item name="unit" label="Egység" initialValue="db">
                 <Input />
               </Form.Item>
             </Space>
             <Form.Item name="net_unit_price" label="Nettó egységár" initialValue={0} rules={[{ required: true }]}>
               <InputNumber min={0} style={{ width: '100%' }} />
             </Form.Item>
             <Form.Item name="supplier_id" label="Beszállító">
               <Select 
                 showSearch 
                 optionFilterProp="children"
                 filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                 options={suppliers.map(s => ({ label: s.name, value: s.id }))} 
               />
             </Form.Item>
             <Form.Item name="is_stock" valuePropName="checked">
               <Checkbox>Raktári tétel</Checkbox>
             </Form.Item>
         </Form>
       </Modal>
    </Card>
  );
};
