import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Switch, message, Space, Popconfirm, Tabs, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BankOutlined, CheckCircleOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { settingsService } from '../../services/settingsService';

const { TabPane } = Tabs;

interface Currency {
  id: number;
  code: string;
  name: string;
  symbol: string;
}

interface BankAccount {
  id: number;
  company: number;
  currency: number;
  currency_code: string;
  currency_symbol: string;
  account_number: string;
  bank_name: string;
  swift: string;
  iban: string;
  is_primary: boolean;
}

interface Company {
  id: number;
  name: string;
  tax_number: string;
  eu_tax_number: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  is_default: boolean;
  is_active: boolean;
  bank_accounts: BankAccount[];
}

const CompanySettings: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingBankAccount, setEditingBankAccount] = useState<BankAccount | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const [bankForm] = Form.useForm();
  const [hasPixinvoiceConfig, setHasPixinvoiceConfig] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadCompanies();
    loadCurrencies();
    loadPixInvoiceConfig();
  }, []);

  const loadPixInvoiceConfig = async () => {
    try {
      const configs = await settingsService.getPixinvoiceConfigs();
      setHasPixinvoiceConfig((configs || []).length > 0);
    } catch (e) {
      setHasPixinvoiceConfig(false);
    }
  };

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const response = await api.get('/companies/');
      // Handle paginated response
      const data = response.data.results || response.data;
      const normalized = Array.isArray(data)
        ? data.map((c: any) => ({ ...c, is_active: c.is_active !== false }))
        : [];
      setCompanies(normalized);
    } catch (error) {
      message.error('Hiba a cégek betöltése közben');
      console.error(error);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrencies = async () => {
    try {
      const response = await api.get('/manufacturing/currencies/');
      setCurrencies(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Hiba a devizák betöltése közben:', error);
      setCurrencies([]);
    }
  };

  const handleAdd = () => {
    setEditingCompany(null);
    form.resetFields();
    form.setFieldsValue({ is_active: true, is_default: false });
    setModalVisible(true);
  };

  const handleEdit = (record: Company) => {
    setEditingCompany(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/companies/${id}/`);
      message.success('Cég törölve');
      loadCompanies();
    } catch (error) {
      message.error('Hiba a törlés közben');
      console.error(error);
    }
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.post(`/companies/${id}/set_default/`);
      message.success('Alapértelmezett cég beállítva');
      loadCompanies();
    } catch (error) {
      message.error('Hiba az alapértelmezett cég beállítása közben');
      console.error(error);
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingCompany) {
        await api.put(`/companies/${editingCompany.id}/`, values);
        message.success('Cég módosítva');
      } else {
        await api.post('/companies/', values);
        message.success('Cég létrehozva');
      }
      setModalVisible(false);
      loadCompanies();
    } catch (error: any) {
      if (error.response?.data?.tax_number) {
        message.error('Ez az adószám már létezik');
      } else {
        message.error('Hiba a mentés közben');
      }
      console.error(error);
    }
  };

  const handleAddBankAccount = (companyId: number) => {
    setSelectedCompanyId(companyId);
    setEditingBankAccount(null);
    bankForm.resetFields();
    setBankModalVisible(true);
  };

  const handleImportFromPixinvoice = async () => {
    Modal.confirm({
      title: 'PixInvoice cégek átvétele',
      content: 'Átveszi a PixInvoice-ban lévő cégeket és bankszámlákat. Folytatod?',
      okText: 'Igen',
      cancelText: 'Mégse',
      onOk: async () => {
        try {
          setImporting(true);
          const res = await api.post('/finance/pixinvoice/companies/import/');
          const c = res?.data?.companies || {};
          const b = res?.data?.bank_accounts || {};
          message.success(`Import kész. Cégek: +${c.created || 0}/${c.updated || 0}, Bankszámlák: ${b.created_or_updated || 0}`);
          loadCompanies();
        } catch (e: any) {
          message.error(e?.response?.data?.error || e?.message || 'Import hiba');
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const handleEditBankAccount = (account: BankAccount) => {
    setSelectedCompanyId(account.company);
    setEditingBankAccount(account);
    bankForm.setFieldsValue(account);
    setBankModalVisible(true);
  };

  const handleDeleteBankAccount = async (id: number) => {
    try {
      await api.delete(`/bank-accounts/${id}/`);
      message.success('Bankszámla törölve');
      loadCompanies();
    } catch (error) {
      message.error('Hiba a törlés közben');
      console.error(error);
    }
  };

  const handleSetPrimaryBankAccount = async (id: number) => {
    try {
      await api.post(`/bank-accounts/${id}/set_primary/`);
      message.success('Elsődleges bankszámla beállítva');
      loadCompanies();
    } catch (error) {
      message.error('Hiba az elsődleges bankszámla beállítása közben');
      console.error(error);
    }
  };

  const handleBankAccountSubmit = async (values: any) => {
    try {
      const data = {
        ...values,
        company: selectedCompanyId,
      };
      
      if (editingBankAccount) {
        await api.put(`/bank-accounts/${editingBankAccount.id}/`, data);
        message.success('Bankszámla módosítva');
      } else {
        await api.post('/bank-accounts/', data);
        message.success('Bankszámla létrehozva');
      }
      setBankModalVisible(false);
      loadCompanies();
    } catch (error: any) {
      message.error('Hiba a mentés közben');
      console.error(error);
    }
  };

  const companyColumns = [
    {
      title: 'Cégnév',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Adószám',
      dataIndex: 'tax_number',
      key: 'tax_number',
    },
    {
      title: 'EU adószám',
      dataIndex: 'eu_tax_number',
      key: 'eu_tax_number',
    },
    {
      title: 'Aktív',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        isActive ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} /> : 'Nem'
      ),
    },
    {
      title: 'Cím',
      dataIndex: 'address',
      key: 'address',
      ellipsis: true,
    },
    {
      title: 'Telefon',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'E-mail',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Alapértelmezett',
      dataIndex: 'is_default',
      key: 'is_default',
      render: (isDefault: boolean, record: Company) => (
        <Space>
          {isDefault ? (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
          ) : (
            <Button size="small" onClick={() => handleSetDefault(record.id)}>
              Beállítás
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, record: Company) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)}>
            Szerkesztés
          </Button>
          <Button 
            icon={<BankOutlined />} 
            size="small" 
            onClick={() => handleAddBankAccount(record.id)}
          >
            Bankszámlák
          </Button>
          <Popconfirm
            title="Biztosan törölni szeretnéd?"
            onConfirm={() => handleDelete(record.id)}
            okText="Igen"
            cancelText="Nem"
          >
            <Button icon={<DeleteOutlined />} size="small" danger>
              Törlés
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card
        title="Alap adatok - Cégek"
        extra={
          <Space>
            {hasPixinvoiceConfig && (
              <Button loading={importing} onClick={handleImportFromPixinvoice}>
                PixInvoice átvétel
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              Új cég
            </Button>
          </Space>
        }
      >
        <Table
          columns={companyColumns}
          dataSource={companies}
          rowKey="id"
          loading={loading}
          expandable={{
            expandedRowRender: (record: Company) => (
              <Card 
                title="Bankszámlák" 
                size="small"
                extra={
                  <Button 
                    size="small" 
                    icon={<PlusOutlined />} 
                    onClick={() => handleAddBankAccount(record.id)}
                  >
                    Új bankszámla
                  </Button>
                }
              >
                {record.bank_accounts && record.bank_accounts.length > 0 ? (
                  <Table
                    size="small"
                    dataSource={record.bank_accounts}
                    rowKey="id"
                    pagination={false}
                    columns={[
                      {
                        title: 'Deviza',
                        dataIndex: 'currency_code',
                        key: 'currency_code',
                        render: (code: string, account: BankAccount) => 
                          `${code} (${account.currency_symbol})`,
                      },
                      {
                        title: 'Bankszámlaszám',
                        dataIndex: 'account_number',
                        key: 'account_number',
                      },
                      {
                        title: 'Bank neve',
                        dataIndex: 'bank_name',
                        key: 'bank_name',
                      },
                      {
                        title: 'SWIFT',
                        dataIndex: 'swift',
                        key: 'swift',
                      },
                      {
                        title: 'IBAN',
                        dataIndex: 'iban',
                        key: 'iban',
                      },
                      {
                        title: 'Elsődleges',
                        dataIndex: 'is_primary',
                        key: 'is_primary',
                        render: (isPrimary: boolean, account: BankAccount) => (
                          <Space>
                            {isPrimary ? (
                              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                            ) : (
                              <Button 
                                size="small" 
                                onClick={() => handleSetPrimaryBankAccount(account.id)}
                              >
                                Beállítás
                              </Button>
                            )}
                          </Space>
                        ),
                      },
                      {
                        title: 'Műveletek',
                        key: 'actions',
                        render: (_: any, account: BankAccount) => (
                          <Space>
                            <Button 
                              size="small" 
                              icon={<EditOutlined />}
                              onClick={() => handleEditBankAccount(account)}
                            >
                              Szerkesztés
                            </Button>
                            <Popconfirm
                              title="Biztosan törölni szeretnéd?"
                              onConfirm={() => handleDeleteBankAccount(account.id)}
                              okText="Igen"
                              cancelText="Nem"
                            >
                              <Button size="small" danger icon={<DeleteOutlined />}>
                                Törlés
                              </Button>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <p>Nincsenek bankszámlák.</p>
                )}
              </Card>
            ),
          }}
        />
      </Card>

      <Modal
        title={editingCompany ? 'Cég szerkesztése' : 'Új cég'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Cégnév"
            name="name"
            rules={[{ required: true, message: 'Kérlek add meg a cégnevet!' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Adószám"
            name="tax_number"
            rules={[{ required: true, message: 'Kérlek add meg az adószámot!' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="EU adószám"
            name="eu_tax_number"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Cím"
            name="address"
            rules={[{ required: true, message: 'Kérlek add meg a címet!' }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>

          <Form.Item
            label="Telefon"
            name="phone"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="E-mail"
            name="email"
            rules={[
              { required: true, message: 'Kérlek add meg az e-mail címet!' },
              { type: 'email', message: 'Érvénytelen e-mail cím!' }
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Weboldal"
            name="website"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Aktív"
            name="is_active"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            label="Alapértelmezett"
            name="is_default"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Mentés
              </Button>
              <Button onClick={() => setModalVisible(false)}>
                Mégse
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingBankAccount ? 'Bankszámla szerkesztése' : 'Új bankszámla'}
        open={bankModalVisible}
        onCancel={() => setBankModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={bankForm} layout="vertical" onFinish={handleBankAccountSubmit}>
          <Form.Item
            label="Deviza"
            name="currency"
            rules={[{ required: true, message: 'Kérlek válaszd ki a devizát!' }]}
          >
            <Select>
              {currencies.map(currency => (
                <Select.Option key={currency.id} value={currency.id}>
                  {currency.code} - {currency.name} ({currency.symbol})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Bankszámlaszám"
            name="account_number"
            rules={[{ required: true, message: 'Kérlek add meg a bankszámlaszámot!' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Bank neve"
            name="bank_name"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="SWIFT/BIC kód"
            name="swift"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="IBAN"
            name="iban"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Elsődleges"
            name="is_primary"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Mentés
              </Button>
              <Button onClick={() => setBankModalVisible(false)}>
                Mégse
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CompanySettings;
