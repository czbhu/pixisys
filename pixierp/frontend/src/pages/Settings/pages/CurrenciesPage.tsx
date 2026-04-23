import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Modal, Form, Input, message, Switch, Space, Popconfirm, InputNumber, Select, AutoComplete } from 'antd';
import NumInput from '../../../components/NumInput';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { manufacturingService, Currency } from '../../../services/manufacturingService';

interface CurrencyExtended extends Currency {
  is_active?: boolean;
}

interface MNBCurrency {
  code: string;
  name: string;
  symbol: string;
  exchange_rate: number;
  rate_huf: number;
}

const CurrenciesPage: React.FC = () => {
  const [list, setList] = useState<CurrencyExtended[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<CurrencyExtended | null>(null);
  const [loading, setLoading] = useState(false);
  const [mnbCurrencies, setMnbCurrencies] = useState<MNBCurrency[]>([]);
  const [searchValue, setSearchValue] = useState('');
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const data = await manufacturingService.getCurrencies();
      // getCurrencies() már Promise<Currency[]> típust ad vissza
      setList(Array.isArray(data) ? data : []);
    } catch (error) {
      message.error('Nem sikerült betölteni a pénznemeket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadMNBCurrencies = async () => {
    try {
      const data = await manufacturingService.getMNBCurrencies();
      setMnbCurrencies(data);
    } catch (error) {
      console.error('Failed to load MNB currencies:', error);
    }
  };

  const handleUpdateRates = async () => {
    try {
      setUpdating(true);
      const result = await manufacturingService.updateExchangeRates();
      message.success(result.message || 'Árfolyamok frissítve');
      load();
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Nem sikerült frissíteni az árfolyamokat');
    } finally {
      setUpdating(false);
    }
  };

  const handleMNBCurrencySelect = (value: string, option: any) => {
    const selected = mnbCurrencies.find(c => c.code === value);
    if (selected) {
      form.setFieldsValue({
        code: selected.code,
        name: selected.name,
        symbol: selected.symbol,
        exchange_rate: selected.exchange_rate,
      });
      setSearchValue('');
    }
  };

  const columns = [
    { 
      title: 'Kód', 
      dataIndex: 'code',
      width: 100,
    },
    { 
      title: 'Név', 
      dataIndex: 'name',
      width: 200,
    },
    { 
      title: 'Szimbólum', 
      dataIndex: 'symbol',
      width: 100,
    },
    { 
      title: 'Árfolyam', 
      dataIndex: 'exchange_rate',
      width: 120,
      render: (val: string) => parseFloat(val).toFixed(4),
    },
    { 
      title: 'Alapértelmezett', 
      dataIndex: 'is_default',
      width: 150,
      render: (val: boolean) => val ? 'Igen' : 'Nem',
    },
    { 
      title: 'Aktív', 
      dataIndex: 'is_active',
      width: 100,
      render: (val: boolean) => val ? 'Igen' : 'Nem',
    },
    { 
      title: 'Műveletek',
      width: 150,
      render: (_: any, record: Currency) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => {
              setEditing(record);
              form.setFieldsValue(record);
              setOpen(true);
            }}
          >
            Szerkesztés
          </Button>
          <Popconfirm
            title="Biztosan törölni szeretnéd?"
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button 
              icon={<DeleteOutlined />} 
              size="small"
              danger
            >
              Törlés
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleDelete = async (id: number) => {
    try {
      await manufacturingService.deleteCurrency(id);
      message.success('Pénznem törölve');
      load();
    } catch (error) {
      message.error('Nem sikerült törölni a pénznemet');
    }
  };

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editing) {
        await manufacturingService.updateCurrency(editing.id, values);
        message.success('Pénznem frissítve');
      } else {
        await manufacturingService.createCurrency(values);
        message.success('Pénznem létrehozva');
      }
      
      setOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (error: any) {
      if (error?.response?.data) {
        const errors = error.response.data;
        Object.keys(errors).forEach(key => {
          message.error(`${key}: ${errors[key]}`);
        });
      } else {
        message.error('Mentés sikertelen');
      }
    }
  };

  const handleNew = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      is_default: false,
      exchange_rate: 1.0000,
    });
    setSearchValue('');
    loadMNBCurrencies(); // Load MNB currencies when opening new currency modal
    setOpen(true);
  };

  return (
    <Card 
      title="Pénznemek" 
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />}
            onClick={handleUpdateRates}
            loading={updating}
          >
            MNB árfolyam frissítés
          </Button>
          <Button 
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleNew}
          >
            Új pénznem
          </Button>
        </Space>
      }
    >
      <Table 
        size="small"
        rowKey="id" 
        dataSource={list} 
        columns={columns} 
        loading={loading}
        pagination={false}
      />
      
      <Modal 
        title={editing ? 'Pénznem szerkesztése' : 'Új pénznem'} 
        open={open} 
        onOk={onSave} 
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
        width={600}
        okText="Mentés"
        cancelText="Mégse"
      >
        <Form layout="vertical" form={form}>
          {!editing && (
            <Form.Item label="MNB Pénznem keresése">
              <AutoComplete
                value={searchValue}
                options={mnbCurrencies.map(c => ({
                  value: c.code,
                  label: `${c.code} - ${c.name} (${c.symbol}) - 1 ${c.code} = ${c.exchange_rate.toFixed(2)} HUF`,
                }))}
                onSelect={handleMNBCurrencySelect}
                onChange={setSearchValue}
                onSearch={(value) => {
                  setSearchValue(value);
                }}
                placeholder="Keress pénznem kódra vagy névre (pl. EUR, USD)"
                filterOption={(inputValue, option) =>
                  option?.value.toLowerCase().indexOf(inputValue.toLowerCase()) !== -1 ||
                  option?.label.toLowerCase().indexOf(inputValue.toLowerCase()) !== -1
                }
                style={{ width: '100%' }}
              />
            </Form.Item>
          )}
          
          <Form.Item 
            label="Kód (3 karakter)" 
            name="code" 
            rules={[
              { required: true, message: 'Kötelező mező' },
              { len: 3, message: 'Pontosan 3 karakter legyen' },
              { pattern: /^[A-Z]{3}$/, message: 'Csak nagybetűk (pl. HUF, EUR, USD)' }
            ]}
          >
            <Input placeholder="HUF" maxLength={3} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          
          <Form.Item 
            label="Név" 
            name="name" 
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="Magyar forint" />
          </Form.Item>
          
          <Form.Item 
            label="Szimbólum" 
            name="symbol" 
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <Input placeholder="Ft" />
          </Form.Item>
          
          <Form.Item 
            label="Árfolyam (HUF-hoz képest)" 
            name="exchange_rate"
            tooltip="1 HUF = ? pénznem. Például EUR esetén kb. 0.0025"
            rules={[{ required: true, message: 'Kötelező mező' }]}
          >
            <NumInput 
              min={0.0001} 
              max={999999} 
              step={0.0001}
              precision={4}
              style={{ width: '100%' }}
              placeholder="1.0000"
            />
          </Form.Item>
          
          <Form.Item 
            label="Alapértelmezett" 
            name="is_default"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          
          <Form.Item 
            label="Aktív" 
            name="is_active"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CurrenciesPage;
