import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  Modal,
  Table,
  Button,
  Input,
  Form,
  message,
  Space,
  Typography,
  Row,
  Col,
  Tabs,
  Radio,
  Divider,
  Spin,
  Select,
  Switch,
  Tag
} from 'antd';
import { UserOutlined, SearchOutlined, PlusOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import api from '../../../services/api';
import { crmService } from '../../../services/crmService';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { TextArea } = Input;

const STREET_TYPES = [
  'utca', 'út', 'útja', 'tér', 'sétány', 'fasor', 'köz', 'park', 'körút', 'sor', 'lejáró', 'dűlő', 'lejtő', 'lépcső', 'rakpart', 'kert', 'halom', 'domb', 'híd', 'rkp', 'krt', 'u', 'u.', 'út.', 'útja'
];

const COUNTRY_CODE_MAP: Record<string, string> = {
  'HU': 'Magyarország',
  'DE': 'Németország',
  'AT': 'Ausztria',
  'RO': 'Románia',
  'SK': 'Szlovákia',
  'HR': 'Horvátország',
  'SI': 'Szlovénia',
  'PL': 'Lengyelország',
  'CZ': 'Csehország',
  'IT': 'Olaszország',
  'FR': 'Franciaország',
  'ES': 'Spanyolország',
  'NL': 'Hollandia',
  'BE': 'Belgium',
  'CH': 'Svájc',
  'GB': 'Egyesült Királyság',
  'IE': 'Írország',
  'SE': 'Svédország',
  'NO': 'Norvégia',
  'FI': 'Finnország',
  'DK': 'Dánia',
  'PT': 'Portugália',
  'GR': 'Görögország',
  'BG': 'Bulgária'
};

interface Customer {
  id: number;
  name: string;
  address: string;
  tax_number: string;
  full_tax_number?: string;
  vat_code?: string;
  county_code?: string;
  eu_tax_number?: string;
  postal_code?: string;
  city?: string;
  street_name?: string;
  street_type?: string;
  house_number?: string;
  building?: string;
  staircase?: string;
  floor?: string;
  door?: string;
  country?: string;
  email: string;
  phone?: string;
  vat_status?: string;
  short_name?: string;
  group_tax_number?: string;
}

interface Props {
  selectedCustomer: Customer | null;
  onChange: (customer: Customer | null) => void;
  onDiscountToggle: (show: boolean) => void;
  showDiscountPrices: boolean;
  isModal?: boolean;
}

const CustomerSelection: React.FC<Props> = ({
  selectedCustomer,
  onChange,
  onDiscountToggle,
  showDiscountPrices,
  isModal = false
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [newCustomerModalVisible, setNewCustomerModalVisible] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRow, setSelectedRow] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const [newForm] = Form.useForm();
  const [taxThinking, setTaxThinking] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('Magyarország');
  const [currentLetter, setCurrentLetter] = useState<string>('');
  const [lastSelectedCustomerId, setLastSelectedCustomerId] = useState<string | number | null>(() => {
    // Load from localStorage on initial render (store as string to handle both numeric and UUID IDs)
    const saved = localStorage.getItem('lastSelectedCustomerId');
    return saved || null;
  });
  const tableScrollRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<any>(null);
  
  const watchedCountry = Form.useWatch('country', newForm);
  const watchedVatStatus = Form.useWatch('vat_status', newForm);
  const isHungarianTaxpayer = watchedVatStatus === 'DOMESTIC';

  // Helper function to save last selected customer to both state and localStorage
  const saveLastSelectedCustomer = (customerId: number | string) => {
    setLastSelectedCustomerId(customerId);
    localStorage.setItem('lastSelectedCustomerId', String(customerId));
  };

  useEffect(() => {
    if (modalVisible || isModal) {
      fetchCustomers();
    }
  }, [modalVisible, isModal]);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (isModal && searchInputRef.current) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isModal]);

  useEffect(() => {
    filterCustomers();
  }, [searchText, customers]);

  // Load form data when editing customer
  useEffect(() => {
    if (editingCustomer) {
      console.log('useEffect: Loading editing customer data', editingCustomer);
      console.log('useEffect: tax_number to load:', editingCustomer.tax_number);
      
      // Use setTimeout to ensure form fields are rendered
      const timer = setTimeout(() => {
        // Convert object to field format
        const fields = Object.keys(editingCustomer).map(key => ({
          name: key,
          value: (editingCustomer as any)[key]
        }));
        
        console.log('useEffect: Setting fields:', fields.filter(f => f.name === 'tax_number'));
        newForm.setFields(fields);
        
        const formValues = newForm.getFieldsValue();
        console.log('useEffect: Form values after setFields:', formValues);
        console.log('useEffect: tax_number from form:', formValues.tax_number);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [editingCustomer, newForm]);

  // Apply scrollbar styling directly to DOM (CSS pseudo-elements don't work reliably)
  useEffect(() => {
    const applyScrollbarStyle = () => {
      const tableBody = document.querySelector('.customer-selection-modal .ant-table-body') as HTMLElement;
      if (tableBody) {
        // Force scrollbar to be visible and styled
        tableBody.style.overflowY = 'scroll';
        console.log('[Scrollbar] Applied overflow-y: scroll to CUSTOMER MODAL table body');
        
        // Inject global scrollbar CSS if not already present
        const styleId = 'customer-modal-scrollbar-style';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            .customer-selection-modal .ant-table-body::-webkit-scrollbar {
              width: 40px !important;
              height: 40px !important;
            }
            .customer-selection-modal .ant-table-body::-webkit-scrollbar-track {
              background: #f1f1f1 !important;
              border-radius: 10px !important;
            }
            .customer-selection-modal .ant-table-body::-webkit-scrollbar-thumb {
              background: #1890ff !important;
              border-radius: 10px !important;
              border: 5px solid #f1f1f1 !important;
            }
            .customer-selection-modal .ant-table-body::-webkit-scrollbar-thumb:hover {
              background: #40a9ff !important;
            }
          `;
          document.head.appendChild(style);
          console.log('[Scrollbar] Injected scrollbar CSS into <head>');
        }
      } else {
        console.log('[Scrollbar] Customer modal table body NOT FOUND yet');
      }
    };
    
    if (modalVisible || isModal) {
      // Apply after a short delay to ensure Table is rendered
      setTimeout(applyScrollbarStyle, 100);
    }
  }, [modalVisible, isModal]);

  // Track scroll for alphabetical index
  useEffect(() => {
    const handleScroll = () => {
      const tableBody = document.querySelector('.customer-selection-modal .ant-table-body');
      if (!tableBody || filteredCustomers.length === 0) return;
      
      // Find the first VISIBLE row using getBoundingClientRect for pixel-perfect accuracy
      const containerRect = tableBody.getBoundingClientRect();
      const rows = Array.from(tableBody.querySelectorAll('tbody tr')) as HTMLElement[];
      
      // Find first row that is visible in viewport (top edge is within container)
      let visibleRowIndex = -1;
      for (let i = 0; i < rows.length; i++) {
        const rowRect = rows[i].getBoundingClientRect();
        // Check if row's top is at or below container's top (visible)
        if (rowRect.top >= containerRect.top - 5) { // -5px tolerance
          visibleRowIndex = i;
          break;
        }
      }
      
      console.log('[AlphabetIndex] visibleRowIndex:', visibleRowIndex, 'totalRows:', rows.length);
      
      if (visibleRowIndex >= 0 && visibleRowIndex < filteredCustomers.length) {
        const visibleCustomer = filteredCustomers[visibleRowIndex];
        if (visibleCustomer?.name) {
          const firstLetter = visibleCustomer.name.charAt(0).toUpperCase();
          console.log('[AlphabetIndex] Setting letter:', firstLetter, 'for customer:', visibleCustomer.name);
          setCurrentLetter(firstLetter);
        }
      }
    };

    // Find the customer modal table body element (not other tables on the page!)
    const tableBody = document.querySelector('.customer-selection-modal .ant-table-body');
    if (tableBody) {
      tableBody.addEventListener('scroll', handleScroll);
      return () => tableBody.removeEventListener('scroll', handleScroll);
    }
  }, [filteredCustomers]);

  // Auto-scroll to last selected customer
  useEffect(() => {
    if ((modalVisible || isModal) && lastSelectedCustomerId && filteredCustomers.length > 0 && !loading) {
      // Minimal timeout to ensure table is rendered
      setTimeout(() => {
        // Compare IDs as strings to handle both numeric and UUID formats
        const index = filteredCustomers.findIndex(c => String(c.id) === String(lastSelectedCustomerId));
        console.log('[AutoScroll] lastSelectedCustomerId:', lastSelectedCustomerId, 'index:', index);
        
        if (index >= 0) {
          const tableBody = document.querySelector('.customer-selection-modal .ant-table-body') as HTMLElement;
          
          if (tableBody) {
            // Find the actual row element and scroll it into view
            const rows = Array.from(tableBody.querySelectorAll('tbody tr')) as HTMLElement[];
            const targetRow = rows[index];
            
            if (targetRow) {
              console.log('[AutoScroll] Scrolling to row:', index, 'using scrollIntoView');
              
              // Scroll the row into view at the top of the container
              targetRow.scrollIntoView({ block: 'start', behavior: 'auto' });
              
              setSelectedRow(filteredCustomers[index]);
            } else {
              console.log('[AutoScroll] Target row element not found!');
            }
          } else {
            console.log('[AutoScroll] Table body NOT FOUND!');
          }
        } else {
          console.log('[AutoScroll] Customer not found in filtered list (index -1)');
        }
      }, 100); // Reduced to 100ms for fast response
    }
  }, [modalVisible, isModal, lastSelectedCustomerId, filteredCustomers, loading]);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/crm/companies/', {
        params: { page_size: 1000, type: 'customer' }
      });
      const data = response.data.results || response.data;
      setCustomers(data);
    } catch (error) {
      console.error('Error fetching customers:', error);
      message.error('Nem sikerült betölteni az ügyfeleket');
    } finally {
      setLoading(false);
    }
  };

  const filterCustomers = () => {
    if (!searchText) {
      setFilteredCustomers(customers);
      return;
    }

    const search = searchText.toLowerCase();
    const filtered = customers.filter(customer =>
      customer.name?.toLowerCase().includes(search) ||
      customer.address?.toLowerCase().includes(search) ||
      customer.tax_number?.toLowerCase().includes(search) ||
      customer.email?.toLowerCase().includes(search)
    );
    setFilteredCustomers(filtered);
  };

  const handleSelect = () => {
    if (selectedRow) {
      onChange(selectedRow);
      saveLastSelectedCustomer(selectedRow.id);
      setModalVisible(false);
      message.success(`${selectedRow.name} kiválasztva`);
    } else {
      message.warning('Kérjük, válasszon ki egy ügyfelet!');
    }
  };

  const handleReceipt = () => {
    onChange(null);
    setModalVisible(false);
    onDiscountToggle(false);
    message.info('Nyugtás mód beállítva');
  };



  const handleEdit = async () => {
    if (selectedRow) {
      try {
        // Load full customer data including bank accounts
        const response = await api.get(`/crm/companies/${selectedRow.id}/`);
        const customerData = response.data;
        
        console.log('Raw customer data:', customerData);
        
        // Determine vat_status if not present
        if (!customerData.vat_status) {
          const hasTaxNumber = customerData.tax_number && customerData.tax_number.length >= 8;
          const hasEuTaxNumber = customerData.eu_tax_number && customerData.eu_tax_number.startsWith('HU');
          
          if (hasTaxNumber || hasEuTaxNumber) {
            customerData.vat_status = 'DOMESTIC';
          } else if (customerData.eu_tax_number) {
            customerData.vat_status = 'OTHER';
          } else {
            customerData.vat_status = 'PRIVATE_PERSON';
          }
        }
        
        // Build full Hungarian tax number if we have the parts
        if (customerData.tax_number && customerData.vat_code && customerData.county_code) {
          const fullTaxNumber = `${customerData.tax_number}-${customerData.vat_code}-${customerData.county_code}`;
          console.log('Building full tax number:', fullTaxNumber);
          customerData.tax_number = fullTaxNumber;
        }
        
        console.log('Final tax_number:', customerData.tax_number);
        console.log('vat_status:', customerData.vat_status);
        
        // If detailed address fields exist, clear the address field (it's just for notes)
        const hasDetailedAddress = customerData.street_name || customerData.street_number || customerData.house_number;
        if (hasDetailedAddress && customerData.vat_status !== 'OTHER') {
          customerData.address = '';
        }
        
        // Map street fields for consistency
        if (customerData.public_place_category && !customerData.street_type) {
          customerData.street_type = customerData.public_place_category;
        }
        if (customerData.street_number && !customerData.house_number) {
          customerData.house_number = customerData.street_number;
        }
        
        // Set editing customer - this will trigger the useEffect to load form data
        setEditingCustomer(customerData);
        saveLastSelectedCustomer(customerData.id);
        setNewCustomerModalVisible(true);
      } catch (error) {
        console.error('Error loading customer:', error);
        message.error('Nem sikerült betölteni az ügyfél adatokat');
      }
    } else {
      message.warning('Kérjük, válasszon ki egy ügyfelet!');
    }
  };

  const handleVerifyTaxNumber = async (value?: string) => {
    // Use value from search event or get from form
    const currentTax = typeof value === 'string' ? value : newForm.getFieldValue('tax_number');
    const digits = String(currentTax || '').replace(/[^0-9]/g, '');
    
    if (digits.length < 8) {
      message.warning('Kérjük adjon meg legalább az első 8 számjegyet!');
      return;
    }

    try {
      setTaxThinking(true);
      
      // Check for duplicates first
      const existingCompanies = await crmService.searchCompanies(digits.slice(0, 8));
      const duplicate = existingCompanies?.find((c: any) => 
        (c.tax_number || '').replace(/[^0-9]/g, '').startsWith(digits.slice(0, 8))
      );

      if (duplicate && !editingCustomer) {
        Modal.confirm({
          title: 'Már létezik cég ezzel az adószámmal',
          content: (
            <div>
              <p>A következő cég már szerepel a rendszerben:</p>
              <p><strong>{duplicate.name}</strong><br />Adószám: {duplicate.tax_number}</p>
              <p>Válassza ki ezt az ügyfelet?</p>
            </div>
          ),
          okText: 'Igen, kiválaszt',
          cancelText: 'Mégse',
          onOk: () => {
            onChange(duplicate);
            setNewCustomerModalVisible(false);
            setModalVisible(false);
          },
        });
        setTaxThinking(false);
        return;
      }
      
      message.loading({ content: 'NAV adószám lekérdezés...', key: 'tax_verify' });
      
      const result = await crmService.lookupCompanyByNav(digits, { debug: true });

      if (result && 'found' in result && result.found) {
        message.success({ content: 'Adószám érvényes - adatok betöltve', key: 'tax_verify' });
        newForm.setFieldsValue({
          name: result.name,
          short_name: result.name,
          postal_code: result.postal_code,
          city: result.city,
          street_name: result.street_name,
          street_type: result.street_type,
          house_number: result.house_number,
          country: result.country || 'Magyarország',
          full_address: result.full_address,
          vat_code: result.vat_code,
          county_code: result.county_code,
          full_tax_number: result.full_tax_number || result.tax_number,
          tax_number: result.tax_number,
          group_tax_number: result.group_tax_number,
          eu_tax_number: result.eu_tax_number,
          vat_group_id: result.vat_group_id,
          vat_group_member_tax_number: result.vat_group_member_tax_number,
          vat_status: 'DOMESTIC',
        });
      } else {
        message.warning({ content: 'Adószám nem található', key: 'tax_verify' });
      }
    } catch (error) {
      console.error('NAV lookup error:', error);
      message.error({ content: 'NAV lekérdezési hiba', key: 'tax_verify' });
    } finally {
      setTaxThinking(false);
    }
  };

  const handleVerifyEuVat = async (value?: string) => {
    const euVat = ((value ?? newForm.getFieldValue('eu_tax_number')) || '').trim();
    if (euVat.length < 4) {
      message.warning('Kérjük, adja meg az EU adószámot!');
      return;
    }
    setTaxThinking(true);
    message.loading({ content: 'VIES EU adószám lekérdezés...', key: 'vies_verify' });
    try {
      const viesRes = await crmService.validateEuVat({ vat_number: euVat });
      // VIES API returns 'valid'
      if (!viesRes || !viesRes.valid) {
        message.error({ content: 'EU adószám nem érvényes vagy nem található', key: 'vies_verify' });
        setTaxThinking(false);
        return;
      }
      message.success({ content: `Érvényes EU adószám: ${viesRes.name || 'OK'}`, key: 'vies_verify' });
      // Populate form fields from VIES response
      const viesName = viesRes.name || '';
      const viesAddress = viesRes.address || '';
      const viesZipCode = viesRes.zip_code || '';
      const viesCity = viesRes.city || '';
      const viesCountryCode = viesRes.countryCode || '';
      const viesCountry = viesCountryCode ? (COUNTRY_CODE_MAP[viesCountryCode] || viesCountryCode) : '';
      
      newForm.setFieldsValue({
        name: viesName || newForm.getFieldValue('name'),
        eu_tax_number: euVat,
        address: viesAddress || newForm.getFieldValue('address'),
        postal_code: viesZipCode || newForm.getFieldValue('postal_code'),
        city: viesCity || newForm.getFieldValue('city'),
        country: viesCountry || newForm.getFieldValue('country'),
      });
      setTaxThinking(false);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || err?.message || 'Ismeretlen hiba';
      message.error({ content: 'VIES lekérdezés hiba: ' + errorMsg, key: 'vies_verify' });
      setTaxThinking(false);
    }
  };

  const handleCreateNew = async () => {
    try {
      const values = await newForm.validateFields();
      
      if (editingCustomer) {
        // Update existing customer
        const response = await api.patch(`/crm/companies/${editingCustomer.id}/`, values);
        message.success('Ügyfél adatok frissítve');
        setEditingCustomer(null);
        newForm.resetFields();
        onChange(response.data);
        saveLastSelectedCustomer(response.data.id);
        setModalVisible(false);
        fetchCustomers();
      } else {
        // Create new customer
        const response = await api.post('/crm/companies/', {
          ...values,
          is_customer: true,
          is_supplier: false,
          is_active: true
        });
        message.success('Új ügyfél létrehozva');
        setNewCustomerModalVisible(false);
        newForm.resetFields();
        onChange(response.data);
        saveLastSelectedCustomer(response.data.id);
        setModalVisible(false);
        fetchCustomers();
      }
    } catch (error) {
      console.error('Error saving customer:', error);
      message.error(editingCustomer ? 'Nem sikerült frissíteni az ügyfél adatokat' : 'Nem sikerült létrehozni az ügyfelet');
    }
  };

  const columns = [
    {
      title: 'Ügyfél neve',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Adószám',
      dataIndex: 'tax_number',
      key: 'tax_number',
      width: 150,
    },
    {
      title: 'Irányítószám',
      dataIndex: 'postal_code',
      key: 'postal_code',
      width: 120,
    },
    {
      title: 'Város',
      dataIndex: 'city',
      key: 'city',
      width: 150,
    },
    {
      title: 'Cím',
      dataIndex: 'address',
      key: 'address',
      ellipsis: true,
      render: (_: any, record: Customer) => {
        if (record.address) return record.address;
        const parts = [];
        if (record.street_name) {
          parts.push(record.street_name);
          if (record.street_type) parts.push(record.street_type);
          if (record.house_number) parts.push(record.house_number + '.');
        }
        return parts.join(' ') || '-';
      }
    },
  ];

  // If used as modal content (not as card button)
  if (isModal) {
    return (
      <>
        <style>
          {`
            /* Force scrollbar visibility and styling */
            .customer-selection-modal .ant-table-body {
              overflow-y: scroll !important;
              scrollbar-width: thick !important;
              scrollbar-color: #1890ff #f1f1f1 !important;
            }
            
            /* WebKit scrollbar - wider and more visible */
            .customer-selection-modal .ant-table-body::-webkit-scrollbar {
              width: 40px !important;
              display: block !important;
            }
            
            .customer-selection-modal .ant-table-body::-webkit-scrollbar-track {
              background: #f1f1f1 !important;
              border-radius: 10px !important;
            }
            
            .customer-selection-modal .ant-table-body::-webkit-scrollbar-thumb {
              background: #1890ff !important;
              border-radius: 10px !important;
              border: 5px solid #f1f1f1 !important;
            }
            
            .customer-selection-modal .ant-table-body::-webkit-scrollbar-thumb:hover {
              background: #40a9ff !important;
            }
            
            /* Row hover and selection colors */
            .customer-selection-modal .ant-table-tbody > tr:hover > td {
              background-color: #e6f7ff !important;
            }
            
            .customer-selection-modal .ant-table-tbody > tr.selected-row > td {
              background-color: #69c0ff !important;
            }
            
            .customer-selection-modal .ant-table-tbody > tr.selected-row:hover > td {
              background-color: #91d5ff !important;
            }
          `}
        </style>
        <Input
          ref={searchInputRef}
          placeholder="Keresés név, cím vagy adószám alapján..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          size="large"
          style={{ marginBottom: 12, textAlign: 'center' }}
          prefix={<SearchOutlined />}
        />

        <div className="customer-selection-modal" style={{ display: 'flex', gap: 16, height: 'calc(100vh - 200px)', position: 'relative' }}>
          {/* Táblázat - 90% */}
          <div style={{ flex: '0 0 90%', position: 'relative' }}>
            <Table
              columns={columns}
              dataSource={filteredCustomers}
              loading={loading}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 'calc(100vh - 240px)' }}
              onRow={(record) => ({
                onClick: () => setSelectedRow(record),
                className: selectedRow?.id === record.id ? 'selected-row' : ''
              })}
            />
            {/* Alphabetical Index */}
            {currentLetter && (
              <div style={{
                position: 'absolute',
                right: 20,
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: 'rgba(24, 144, 255, 0.9)',
                color: 'white',
                padding: '10px 15px',
                borderRadius: '8px',
                fontSize: '24px',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                zIndex: 10
              }}>
                {currentLetter}
              </div>
            )}
          </div>

          {/* Gombok - 10% */}
          <div style={{ flex: '0 0 10%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Button 
              type="primary"
              size="large" 
              onClick={() => setNewCustomerModalVisible(true)} 
              icon={<PlusOutlined />}
              block
              style={{ height: 60, backgroundColor: '#52c41a', borderColor: '#52c41a' }}
            >
              Új
            </Button>
            <Button 
              size="large" 
              onClick={handleEdit} 
              icon={<EditOutlined />} 
              disabled={!selectedRow}
              block
              style={{ height: 60, backgroundColor: '#faad14', borderColor: '#faad14', color: 'white' }}
            >
              Módosít
            </Button>
            <Button 
              size="large" 
              onClick={handleReceipt}
              block
              style={{ height: 60, backgroundColor: '#722ed1', borderColor: '#722ed1', color: 'white' }}
            >
              Nyugtás
            </Button>
            <Button 
              type="primary" 
              size="large" 
              onClick={handleSelect} 
              disabled={!selectedRow}
              block
              style={{ height: 60, backgroundColor: '#1890ff', borderColor: '#1890ff' }}
            >
              Kiválaszt
            </Button>
          </div>
        </div>

        {/* View customer modal */}
        <Modal
          title="Ügyfél adatai"
          visible={viewModalVisible}
          onCancel={() => setViewModalVisible(false)}
          footer={[
            <Button key="close" size="large" onClick={() => setViewModalVisible(false)}>
              Bezár
            </Button>
          ]}
        >
          {viewingCustomer && (
            <div>
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  <Text strong>Név:</Text> <Text>{viewingCustomer.name}</Text>
                </Col>
                <Col span={24}>
                  <Text strong>Cím:</Text> <Text>{viewingCustomer.address}</Text>
                </Col>
                <Col span={24}>
                  <Text strong>Adószám:</Text> <Text>{viewingCustomer.tax_number}</Text>
                </Col>
                <Col span={24}>
                  <Text strong>E-mail:</Text> <Text>{viewingCustomer.email}</Text>
                </Col>
              </Row>
            </div>
          )}
        </Modal>

        {/* New/Edit customer modal */}
        <Modal
          title={editingCustomer ? "Ügyfél szerkesztése" : "Új ügyfél létrehozása"}
          visible={newCustomerModalVisible || !!editingCustomer}
          onCancel={() => {
            setNewCustomerModalVisible(false);
            setEditingCustomer(null);
            newForm.resetFields();
          }}
          onOk={handleCreateNew}
          okText="Mentés"
          cancelText="Mégse"
          width={920}
        >
          <Form 
            form={newForm} 
            layout="vertical"
            initialValues={{
              vat_status: 'DOMESTIC',
              country: 'Magyarország',
              street_type: 'utca',
              payment_due_days: 8,
              payment_method: 'CASH',
              is_customer: true,
              is_supplier: false,
              is_active: true,
              bank_accounts: []
            }}
            onValuesChange={(changedValues) => {
              if ('vat_status' in changedValues) {
                const status = changedValues.vat_status;
                if (status === 'DOMESTIC') {
                  newForm.setFieldsValue({ eu_tax_number: '' });
                } else if (status === 'PRIVATE_PERSON') {
                  newForm.setFieldsValue({ tax_number: '', eu_tax_number: '' });
                }
              }
            }}
          >
            <Form.Item name="full_tax_number" hidden><Input /></Form.Item>
            <Form.Item name="vat_code" hidden><Input /></Form.Item>
            <Form.Item name="county_code" hidden><Input /></Form.Item>
            <Form.Item name="vat_group_id" hidden><Input /></Form.Item>
            <Form.Item name="is_customer" hidden><Input /></Form.Item>
            <Form.Item name="is_supplier" hidden><Input /></Form.Item>
            <Form.Item name="is_active" hidden><Input /></Form.Item>

            <Form.Item name="vat_status" label="Vevő adóalanyisága">
              <Radio.Group>
                <Radio value="DOMESTIC">Magyar adószámos</Radio>
                <Radio value="PRIVATE_PERSON">Magánszemély</Radio>
                <Radio value="OTHER">Egyéb (EU/3. ország)</Radio>
              </Radio.Group>
            </Form.Item>

            {isHungarianTaxpayer && (
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item label="Adószám">
                    <Input.Search
                      value={newForm.getFieldValue('tax_number')}
                      onChange={(e) => newForm.setFieldValue('tax_number', e.target.value)}
                      placeholder="12345678-1-42 (NAV keresés)"
                      enterButton={<><SearchOutlined /> NAV</>}
                      onSearch={handleVerifyTaxNumber}
                      loading={taxThinking}
                    />
                    <Text type="secondary" style={{ fontSize: '12px' }}>Magyar adószám (8 számjegy)</Text>
                  </Form.Item>
                  <Form.Item name="tax_number" hidden><Input /></Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="eu_tax_number" label="EU adószám">
                    <Input.Search
                      placeholder="HU..."
                      enterButton={<><SearchOutlined /> VIES</>}
                      onSearch={handleVerifyEuVat}
                      loading={taxThinking}
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}

            {!isHungarianTaxpayer && watchedVatStatus === 'OTHER' && (
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="eu_tax_number" label="EU adószám (VIES alapján)">
                    <Input.Search
                      placeholder="EU adószám (pl. DE123456789)"
                      enterButton={<><SearchOutlined /> VIES</>}
                      onSearch={handleVerifyEuVat}
                      loading={taxThinking}
                    />
                    <Text type="secondary" style={{ fontSize: '12px' }}>EU adószám (pl. DE, AT, FR...)</Text>
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="tax_number" label="Adószám (Opcionális)">
                    <Input placeholder="Adószám (opcionális)" />
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Divider orientation="left">Cégadatok</Divider>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="name" label="Név" rules={[{ required: true, message: 'Kötelező mező' }]}>
                  <Input placeholder="Hivatalos cégnév" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="short_name" label="Rövid név">
                  <Input placeholder="Rövid név" />
                </Form.Item>
              </Col>
            </Row>
            
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="group_tax_number" label="Csoportos adószám">
                  <Input placeholder="12345678-1-12" />
                </Form.Item>
              </Col>
              {isHungarianTaxpayer && (
                <Col xs={24} md={12}>
                  <Form.Item name="vat_group_member_tax_number" label="Csoport tag adószáma">
                    <Input placeholder="" disabled={true} />
                  </Form.Item>
                </Col>
              )}
            </Row>

            <Divider orientation="left">Cím</Divider>
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="country" label="Ország">
                  <Input placeholder="Magyarország" />
                </Form.Item>
              </Col>
              <Col xs={10} md={4}>
                <Form.Item name="postal_code" label="Irányítószám">
                  <Input maxLength={10} />
                </Form.Item>
              </Col>
              <Col xs={14} md={12}>
                <Form.Item name="city" label="Város">
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            {watchedVatStatus === 'OTHER' ? (
              <Form.Item name="address" label="Cím (Utca, házszám)">
                <TextArea rows={2} placeholder="Utca, házszám..." />
              </Form.Item>
            ) : (
              <>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="street_name" label="Közterület neve">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="street_type" label="Közterület jellege">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        options={STREET_TYPES.map((t) => ({ label: t, value: t }))}
                        placeholder="pl. utca"
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="house_number" label="Házszám">
                      <Input />
                    </Form.Item>
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col xs={12} md={6}>
                    <Form.Item name="building" label="Épület">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="staircase" label="Lépcsőház">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="floor" label="Emelet">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="door" label="Ajtó">
                      <Input />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Form.Item name="address" label="Egyéb cím / megjegyzés">
                  <TextArea rows={2} />
                </Form.Item>
              </>
            )}

            <Divider orientation="left">Kapcsolattartás</Divider>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="email" label="E-mail" rules={[{ type: 'email', message: 'Érvénytelen e-mail cím!' }]}>
                  <Input type="email" placeholder="pelda@ceg.hu" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="phone" label="Telefon">
                  <Input placeholder="+36..." />
                </Form.Item>
              </Col>
            </Row>
            
            <Divider orientation="left">Beállítások</Divider>
            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="payment_due_days" label="Fizetési határidő (nap)">
                  <Input type="number" min={0} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="payment_method" label="Fizetési mód">
                  <Select>
                    <Select.Option value="CASH">Készpénz</Select.Option>
                    <Select.Option value="TRANSFER">Átutalás</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            
            <Row gutter={16}>
              <Col xs={24} md={24}>
                <Form.Item label="Szerepkörök">
                  <Space>
                    <Form.Item name="is_customer" valuePropName="checked" noStyle>
                      <Switch checkedChildren="Ügyfél" unCheckedChildren="Ügyfél" />
                    </Form.Item>
                    <Form.Item name="is_supplier" valuePropName="checked" noStyle>
                      <Switch checkedChildren="Beszállító" unCheckedChildren="Beszállító" />
                    </Form.Item>
                  </Space>
                </Form.Item>
              </Col>
            </Row>

            <Divider orientation="left">Bankszámlák</Divider>
            <Form.List name="bank_accounts">
              {(fields, { add, remove }) => (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {fields.map((field, idx) => {
                    const accounts = newForm.getFieldValue('bank_accounts') || [];
                    const isPrimary = accounts[idx]?.is_primary;
                    return (
                      <Card 
                        key={field.key} 
                        size="small" 
                        title={
                          <Space>
                            <Text strong>Számla #{idx + 1}</Text>
                            {isPrimary && <Tag color="blue">Elsődleges</Tag>}
                          </Space>
                        } 
                        extra={
                          <Space>
                            <Button 
                              size="small" 
                              onClick={() => {
                                const current = newForm.getFieldValue('bank_accounts') || [];
                                const next = current.map((acc: any, index: number) => ({ ...acc, is_primary: index === idx }));
                                newForm.setFieldsValue({ bank_accounts: next });
                              }}
                            >
                              Elsődleges
                            </Button>
                            <Button size="small" danger onClick={() => remove(field.name)}>Törlés</Button>
                          </Space>
                        }
                      >
                        <Row gutter={12}>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, 'bank_name']} label="Bank neve">
                              <Input placeholder="Bank neve" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, 'account_number']} label="Számlaszám">
                              <Input placeholder="123-456..." />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={12}>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, 'iban']} label="IBAN">
                              <Input placeholder="IBAN" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={12}>
                            <Form.Item name={[field.name, 'swift_bic']} label="SWIFT/BIC">
                              <Input placeholder="SWIFT/BIC" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={12}>
                          <Col xs={12} md={8}>
                            <Form.Item name={[field.name, 'currency']} label="Pénznem" initialValue="HUF">
                              <Select options={[
                                { label: 'HUF', value: 'HUF' },
                                { label: 'EUR', value: 'EUR' },
                                { label: 'USD', value: 'USD' },
                                { label: 'GBP', value: 'GBP' },
                              ]} />
                            </Form.Item>
                          </Col>
                          <Col xs={12} md={8}>
                            <Form.Item name={[field.name, 'is_primary']} label="Elsődleges" valuePropName="checked">
                              <Switch onChange={() => {
                                const current = newForm.getFieldValue('bank_accounts') || [];
                                const next = current.map((acc: any, index: number) => ({ ...acc, is_primary: index === idx }));
                                newForm.setFieldsValue({ bank_accounts: next });
                              }} />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    );
                  })}
                  <Button type="dashed" onClick={() => add({ currency: 'HUF', is_primary: fields.length === 0 })} block icon={<PlusOutlined />}>
                    Új bankszámla
                  </Button>
                </Space>
              )}
            </Form.List>

            <Divider orientation="left">Státusz</Divider>
            <Form.Item name="is_active" label="Aktív" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Modal>
      </>
    );
  }

  // Normal render as card button
  return (
    <>
      <Card
        hoverable
        className={`pos-menu-card customer-card ${selectedCustomer ? 'selected' : ''}`}
        onClick={() => {
          setModalVisible(true);
          // If there's a selected customer, set it as selectedRow so it auto-scrolls
          if (selectedCustomer) {
            setSelectedRow(selectedCustomer);
            saveLastSelectedCustomer(selectedCustomer.id);
          }
        }}
      >
        <UserOutlined className="pos-menu-icon" />
        <Title level={3} style={{ whiteSpace: 'normal', wordWrap: 'break-word', marginBottom: '12px' }}>
          {selectedCustomer ? selectedCustomer.name : 'Nyugtás'}
        </Title>
        {selectedCustomer && (
          <div style={{ fontSize: '16px', color: '#666', lineHeight: '1.6' }}>
            <div style={{ marginBottom: '4px' }}>{selectedCustomer.address}</div>
            <div style={{ fontWeight: 500 }}>{selectedCustomer.tax_number}</div>
          </div>
        )}
        {!selectedCustomer && <p>Ügyfél kiválasztása</p>}
      </Card>

      {/* Customer selection modal */}
      <Modal
        title="Ügyfél kiválasztása"
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        width="95vw"
        styles={{ body: { height: 'calc(100vh - 120px)', padding: '16px' } }}
        footer={null}
      >
        <style>
          {`
            .ant-table-body::-webkit-scrollbar {
              width: 40px;
            }
            .ant-table-body::-webkit-scrollbar-track {
              background: #f1f1f1;
              border-radius: 10px;
            }
            .ant-table-body::-webkit-scrollbar-thumb {
              background: #1890ff;
              border-radius: 10px;
              border: 5px solid #f1f1f1;
            }
            .ant-table-body::-webkit-scrollbar-thumb:hover {
              background: #40a9ff;
            }
            .ant-table-body {
              scrollbar-width: thick;
              scrollbar-color: #1890ff #f1f1f1;
            }
            .ant-table-row:hover {
              background-color: #e6f7ff !important;
            }
            .ant-table-row.selected-row {
              background-color: #69c0ff !important;
            }
            .ant-table-row.selected-row:hover {
              background-color: #91d5ff !important;
            }
          `}
        </style>
        <Input
          ref={searchInputRef}
          placeholder="Keresés név, cím vagy adószám alapján..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          size="large"
          style={{ marginBottom: 12, textAlign: 'center' }}
          prefix={<SearchOutlined />}
        />

        <div style={{ position: 'relative' }}>
          <Table
            columns={columns}
            dataSource={filteredCustomers}
            loading={loading}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 'calc(100vh - 300px)' }}
            onRow={(record) => ({
              onClick: () => setSelectedRow(record),
              className: selectedRow?.id === record.id ? 'selected-row' : ''
            })}
          />
          {/* Alphabetical Index */}
          {currentLetter && (
            <div style={{
              position: 'absolute',
              right: 20,
              top: '50%',
              transform: 'translateY(-50%)',
              backgroundColor: 'rgba(24, 144, 255, 0.9)',
              color: 'white',
              padding: '10px 15px',
              borderRadius: '8px',
              fontSize: '24px',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              pointerEvents: 'none',
              zIndex: 10
            }}>
              {currentLetter}
            </div>
          )}
        </div>

        <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }}>
          <Button size="large" onClick={() => setNewCustomerModalVisible(true)} icon={<PlusOutlined />}>
            Új
          </Button>
          <Button size="large" onClick={handleEdit} icon={<EditOutlined />}>
            Módosít
          </Button>
          <Button size="large" onClick={handleReceipt}>
            Nyugtás
          </Button>
          <Button type="primary" size="large" onClick={handleSelect}>
            Kiválaszt
          </Button>
        </Space>
      </Modal>

      {/* View customer modal */}
      <Modal
        title="Ügyfél adatai"
        visible={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={[
          <Button key="close" size="large" onClick={() => setViewModalVisible(false)}>
            Bezár
          </Button>
        ]}
      >
        {viewingCustomer && (
          <div>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Text strong>Név:</Text> <Text>{viewingCustomer.name}</Text>
              </Col>
              <Col span={24}>
                <Text strong>Cím:</Text> <Text>{viewingCustomer.address}</Text>
              </Col>
              <Col span={24}>
                <Text strong>Adószám:</Text> <Text>{viewingCustomer.tax_number}</Text>
              </Col>
              <Col span={24}>
                <Text strong>E-mail:</Text> <Text>{viewingCustomer.email}</Text>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      {/* New customer modal */}
      <Modal
        title="Új ügyfél létrehozása"
        visible={newCustomerModalVisible}
        onCancel={() => setNewCustomerModalVisible(false)}
        onOk={handleCreateNew}
        okText="Létrehoz"
        cancelText="Mégse"
        width={600}
      >
        <Form form={newForm} layout="vertical">
          <Form.Item label="Adószám" name="tax_number">
            <Input
              size="large"
              addonAfter={
                <Button type="link" onClick={() => handleVerifyTaxNumber()}>
                  Ellenőrzés
                </Button>
              }
            />
          </Form.Item>
          <Form.Item label="Név" name="name" rules={[{ required: true, message: 'Kötelező mező!' }]}>
            <Input size="large" />
          </Form.Item>
          <Form.Item label="Cím" name="address">
            <Input.TextArea rows={3} size="large" />
          </Form.Item>
          <Form.Item label="E-mail" name="email" rules={[{ type: 'email', message: 'Érvénytelen e-mail cím!' }]}>
            <Input size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CustomerSelection;
