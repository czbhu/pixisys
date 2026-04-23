import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Modal, Select, message, Tag, Space, InputNumber, Descriptions, Popconfirm, Form, Divider, Tooltip } from 'antd';
import NumInput from '../../components/NumInput';
import { PlusOutlined, SendOutlined, DeleteOutlined, EyeOutlined, FileTextOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import EnhancedTable from '../../components/EnhancedTable';
import api from '../../services/api';
import dayjs from 'dayjs';
// @ts-ignore
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import UnifiedQuickSearchHeader from '../../components/Layout/UnifiedQuickSearchHeader';

interface DeliveryNoteItemRow {
  id: number;
  delivery_note: number;
  delivery_note_number: string;
  order_number: string;
  issue_date: string;
  customer_name?: string;
  contact_name?: string;
  contact_names?: string;
  quantity: number;
  unit: string;
  item_name: string;
  notes: string;
  is_confirmed: boolean;
  confirmed_by_info?: string;
  confirmed_by_user_name?: string;
  confirmed_at?: string;
  delivery_note_public_url?: string;
}

interface OrderItemForDelivery {
  order_id: number;
  order_number: string;
  order_item_id: number;
  item_name: string;
  unit: string;
  unit_price: number;
  ordered_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number;
  to_deliver: number;
}

interface EmailPreview {
    subject: string;
    body: string;
    is_html: boolean;
}

interface EmailTemplate {
    key: string;
    name: string;
}

interface SignatureTemplate {
    key: string;
    name: string;
}

const DeliveryNotes: React.FC = () => {
  const [data, setData] = useState<DeliveryNoteItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [csvMode, setCsvMode] = useState(false);
  const [csvSelectedKeys, setCsvSelectedKeys] = useState<React.Key[]>([]);

  const exportCsv = () => {
    const rows = (csvSelectedKeys.length > 0 ? data.filter(r => csvSelectedKeys.includes(r.id)) : data)
      .map(r => ({
        'Szállítólevél szám': r.delivery_note_number,
        'Megrendelés szám': r.order_number,
        'Dátum': r.issue_date ? dayjs(r.issue_date).format('YYYY-MM-DD') : '',
        'Ügyfél': r.customer_name ?? '',
        'Kapcsolattartó': r.contact_names ?? r.contact_name ?? '',
        'Tétel': r.item_name,
        'Mennyiség': r.quantity,
        'ME': r.unit,
        'Megjegyzés': r.notes ?? '',
        'Visszaigazolt': r.is_confirmed ? 'Igen' : 'Nem',
        'Visszaigazoló': r.confirmed_by_user_name ?? '',
      }));
    if (!rows.length) { message.warning('Nincs exportálható adat.'); return; }
    const headers = Object.keys(rows[0]);
    const escape = (v: any) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape((r as any)[h])).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `szallitolevelek_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
    URL.revokeObjectURL(url);
    setCsvMode(false); setCsvSelectedKeys([]);
  };
  const [searchText, setSearchText] = useState('');
  
  // Specific filters
  const [filterNoteNumber, setFilterNoteNumber] = useState<string>('');
  const [filterOrderNumber, setFilterOrderNumber] = useState<string>('');
  const [filterItemName, setFilterItemName] = useState<string>('');
  
  // Creation modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deliverableCustomers, setDeliverableCustomers] = useState<{id: string, name: string, type: string, real_id: number}[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [availableItems, setAvailableItems] = useState<OrderItemForDelivery[]>([]);
  const [creating, setCreating] = useState(false);
  const [deliveryNoteNotes, setDeliveryNoteNotes] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(dayjs().format('YYYY-MM-DD'));
  
  // Email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [signatureTemplates, setSignatureTemplates] = useState<SignatureTemplate[]>([]);
  const [emailTargetId, setEmailTargetId] = useState<number | null>(null);
  const [emailTargetName, setEmailTargetName] = useState<string>('');
  const [emailTargetNumber, setEmailTargetNumber] = useState<string>('');

  const [sendForm] = Form.useForm();
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [sending, setSending] = useState(false);
  
  const location = useLocation();
  
  const fetchDeliveryNoteItems = async (globalSearch = '') => {
    setLoading(true);
    try {
      const params: any = {};
      if (globalSearch) params.q = globalSearch;
      if (filterNoteNumber) params.note_number = filterNoteNumber;
      if (filterOrderNumber) params.order_number = filterOrderNumber;
      if (filterItemName) params.item_name = filterItemName;

      // Ensure we hit the items endpoint
      const response = await api.get('/sales/delivery-note-items/', { params });
      setData(response.data.results || response.data);
    } catch (error) {
      console.error(error);
      message.error('Hiba a tételek betöltésekor');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliverableCustomers = async () => {
    try {
      const response = await api.get('/sales/delivery-notes/deliverable_customers/');
      setDeliverableCustomers(response.data);
    } catch (error) {
      console.error('Failed to fetch deliverable customers');
    }
  };

  useEffect(() => {
    fetchDeliveryNoteItems();
  }, [filterNoteNumber, filterOrderNumber, filterItemName]);

  // Handle "Create from Order" link
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('create_from_order');
    if (orderId) {
        initCreateFromOrder(orderId);
    }
  }, [location.search]);

  const initCreateFromOrder = async (orderId: string) => {
     try {
         // 1. Fetch Order Details
         const orderRes = await api.get(`/sales/customer-orders/${orderId}/`);
         const order = orderRes.data;
         
         // 2. Fetch customers if needed and determine correct entity
         let customers = deliverableCustomers;
         if (customers.length === 0) {
             const custRes = await api.get('/sales/delivery-notes/deliverable_customers/');
             customers = custRes.data;
             setDeliverableCustomers(customers);
         }
         
         // 3. Find matching entity
         // Order has quote_request -> company or contacts
         let entityId: string | null = null;
         const qr = order.quote_request;
         
         if (qr) {
             // Check company
             if (qr.company && typeof qr.company === 'object') {
                 // Check if it exists in list
                 const key = `company_${qr.company.id}`;
                 if (customers.find(c => c.id === key)) entityId = key;
             } 
             // If not company, maybe contact?
             if (!entityId && qr.contacts && qr.contacts.length > 0) {
                 // Try first contact
                 const contactId = typeof qr.contacts[0] === 'object' ? qr.contacts[0].id : qr.contacts[0];
                 const key = `contact_${contactId}`;
                 if (customers.find(c => c.id === key)) entityId = key;
             }
         }
         
         if (entityId) {
             // 4. Open Modal and Select Entity
             setIsModalOpen(true);
             setSelectedEntityId(entityId);
             setDeliveryDate(dayjs().format('YYYY-MM-DD'));
             setDeliveryNoteNotes(order.notes || '');
             
             // 5. Fetch items for this customer
             // We want to pre-filter ONLY this order's items if possible, 
             // but handleEntitySelect pulls ALL items for customer.
             // We can filter them client-side after fetch.
             
             // Manually calling the logic of handleEntitySelect but with filter
             const selected = customers.find(c => c.id === entityId);
             if (selected) {
                 const params: any = {};
                 if (selected.type === 'company') {
                    params.customer_id = selected.real_id;
                 } else {
                    params.contact_id = selected.real_id;
                 }
                 const itemsRes = await api.get('/sales/delivery-notes/items_for_customer/', { params });
                 
                 // Filter for this order only!
                 const allItems = itemsRes.data;
                 const orderItems = allItems.filter((i: any) => String(i.order_id) === String(orderId));
                 
                 // Pre-set "to_deliver" to remaining quantity for these items
                 const preparedItems = orderItems.map((item: any) => ({
                    ...item,
                    to_deliver: item.remaining_quantity // Default to full remaining
                 }));
                 
                 setAvailableItems(preparedItems);
             }
         } else {
             message.warning('Nem található szállítható ügyfél ehhez a megrendeléshez (nincs összerendelve, vagy nincs aktív tétele).');
             setIsModalOpen(true); // Open anyway so they can try manual
         }
         
     } catch (e) {
         console.error(e);
         message.error('Hiba a megrendelés adatainak betöltésekor');
     }
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    fetchDeliveryNoteItems(value);
  };

  const startCreate = () => {
    setIsModalOpen(true);
    setSelectedEntityId(null);
    setAvailableItems([]);
    setDeliveryNoteNotes('');
    setDeliveryDate(dayjs().format('YYYY-MM-DD'));
    fetchDeliverableCustomers();
  };

  const handleEntitySelect = async (entityKey: string) => {
    setSelectedEntityId(entityKey);
    setAvailableItems([]);
    
    const selected = deliverableCustomers.find(c => c.id === entityKey);
    if (!selected) return;

    try {
      const params: any = {};
      if (selected.type === 'company') {
        params.customer_id = selected.real_id;
      } else {
        params.contact_id = selected.real_id;
      }

      const response = await api.get('/sales/delivery-notes/items_for_customer/', { params });
      const items = response.data.map((item: any) => ({
        ...item,
        to_deliver: 0
      }));
      setAvailableItems(items);
    } catch (error) {
       message.error('Hiba a rendelési tételek betöltésekor');
    }
  };

  const handleSave = async () => {
    if (!selectedEntityId) {
      message.error('Válasszon ügyfelet!');
      return;
    }

    const selected = deliverableCustomers.find(c => c.id === selectedEntityId);
    if (!selected) return;

    const itemsToDeliver = availableItems.filter(i => i.to_deliver > 0);
    
    if (itemsToDeliver.length === 0) {
      message.error('Nincs kiválasztva tétel kiszállításra (mennyiség > 0)');
      return;
    }

    setCreating(true);
    try {
      const payload: any = {
        delivery_date: deliveryDate,
        issue_date: deliveryDate, 
        notes: deliveryNoteNotes,
        is_confirmed: false, // Do not auto-confirm
        items_data: itemsToDeliver.map(i => ({
          customer_order_item: i.order_item_id,
          quantity: i.to_deliver,
          net_unit_price: i.unit_price,
          item_name: i.item_name,
          unit: i.unit
        }))
      };

      if (selected.type === 'company') {
          payload.customer = selected.real_id;
      } else {
          payload.contact = selected.real_id;
      }

      const res = await api.post('/sales/delivery-notes/', payload);
      message.success('Szállítólevél sikeresen létrehozva');
      setIsModalOpen(false);
      fetchDeliveryNoteItems(searchText);
      
      // Auto-open email modal for the new note
      const newNote = res.data;
      if (newNote && newNote.id) {
          openEmailModal({
              id: newNote.id,
              delivery_note_number: newNote.delivery_note_number,
              customer_name: newNote.customer_name || newNote.contact_name || selected.name
          });
      }

    } catch (error) {
      message.error('Hiba a mentés során');
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (noteId: number) => {
      try {
          await api.delete(`/sales/delivery-notes/${noteId}/`);
          message.success('Szállítólevél törölve');
          fetchDeliveryNoteItems(searchText);
      } catch (error) {
          message.error('Hiba a törléskor');
      }
  };

  /* Email Logic */
  const openEmailModal = (target: { id: number, delivery_note_number: string, customer_name?: string }) => {
      setEmailTargetId(target.id);
      setEmailTargetName(target.customer_name || 'Ügyfelünk');
      setEmailTargetNumber(target.delivery_note_number);
      
      // Load templates first
      Promise.all([
          api.get('/core/email-templates/'),
          api.get('/core/signature-templates/'),
      ]).then(([tplRes, sigRes]) => {
          setEmailTemplates(tplRes.data.results || tplRes.data);
          setSignatureTemplates(sigRes.data.results || sigRes.data);
      }).catch(err => console.error("Could not load templates", err));
      
      const initialValues = {
          template_key: 'szallitolevel',
          signature_key: 'default'
      };
      
      sendForm.resetFields();
      sendForm.setFieldsValue(initialValues);
      setEmailPreview(null);
      setEmailModalOpen(true);
      
      // Auto-load template content
      loadTemplateContent(target.id, initialValues);
  };
  
  const loadTemplateContent = (id: number, values: any) => {
      api.post(`/sales/delivery-notes/${id}/render_email/`, values)
        .then(response => {
            const updates: any = {
                subject: response.data.subject,
                body: response.data.body
            };
            
            // Auto fill recipient if available and current field is empty
            const currentTo = sendForm.getFieldValue('to');
            if (response.data.proposed_recipients && response.data.proposed_recipients.length > 0) {
                 if (!currentTo) {
                     updates.to = response.data.proposed_recipients.join(', ');
                 }
            }
            
            sendForm.setFieldsValue(updates);
        })
        .catch(err => {
            console.error('Failed to load template defaults', err);
        });
  };

  const handleTemplateChange = (changedValues: any, allValues: any) => {
      if (emailTargetId && (changedValues.template_key || changedValues.signature_key)) {
          loadTemplateContent(emailTargetId, allValues);
      }
  };

  const handleEmailPreview = async () => {
      if (!emailTargetId) return;
      try {
          const v = await sendForm.validateFields();
          const response = await api.post(`/sales/delivery-notes/${emailTargetId}/render_email/`, v);
          setEmailPreview(response.data);
      } catch (err) {
          message.error('Hiba az előnézet generálásakor');
      }
  };

  const handleEmailSend = async () => {
      if (!emailTargetId) return;
      try {
          const v = await sendForm.validateFields();
          setSending(true);
          await api.post(`/sales/delivery-notes/${emailTargetId}/send_email/`, v);
          message.success('E-mail elküldve');
          setEmailModalOpen(false);
      } catch (err) {
          message.error('Hiba a küldés során');
      } finally {
          setSending(false);
      }
  };

  const columns: ColumnsType<DeliveryNoteItemRow> = [
    {
      title: 'Dátum',
      dataIndex: 'issue_date',
      key: 'issue_date',
      width: 110,
      sorter: (a: any, b: any) => (a.issue_date || '').localeCompare(b.issue_date || ''),
    },
    {
      title: 'Szállítólevél',
      dataIndex: 'delivery_note_number',
      key: 'delivery_note_number',
      render: (text) => <a onClick={() => setFilterNoteNumber(filterNoteNumber === text ? '' : text)}>{text}</a>,
      sorter: (a: any, b: any) => (a.delivery_note_number || '').localeCompare(b.delivery_note_number || ''),
    },
    {
      title: 'Megnevezés',
      key: 'item_name',
      sorter: (a: any, b: any) => (a.item_name || '').localeCompare(b.item_name || '', 'hu'),
      render: (_, record) => (
        <span>
            <a onClick={() => setFilterItemName(filterItemName === record.item_name ? '' : record.item_name)}>
                 {record.item_name}
            </a>
            <br />
            <small style={{color: '#888'}}>
                <a onClick={() => setFilterOrderNumber(filterOrderNumber === record.order_number ? '' : record.order_number)} style={{color: '#888'}}>
                    {record.order_number}
                </a>
            </small>
        </span>
      )
    },
    {
      title: 'Ügyfél',
      key: 'customer',
      width: 200,
      sorter: (a: any, b: any) => (a.customer_name || a.contact_name || '').localeCompare(b.customer_name || b.contact_name || '', 'hu'),
      render: (_, record) => {
          const name = record.customer_name || record.contact_name || '-';
          const contacts = record.contact_names || record.contact_name;
          return (
              <div style={{
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  minWidth: '150px' 
              }}>
                  <div title={name}>{name}</div>
                  {contacts && contacts !== name && <small style={{color: '#666', fontSize: 11}} title={contacts}>{contacts}</small>}
              </div>
          )
      },
      responsive: ['md']
    },
    {
      title: 'Mennyiség',
      key: 'quantity',
      sorter: (a: any, b: any) => (a.quantity || 0) - (b.quantity || 0),
      render: (_, record) => <span>{record.quantity} {record.unit}</span>
    },
    {
      title: 'Megjegyzés',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      responsive: ['lg'],
      sorter: (a: any, b: any) => (a.notes || '').localeCompare(b.notes || '', 'hu'),
    },
    {
      title: 'Visszaigazolta',
      key: 'confirmed',
      sorter: (a: any, b: any) => (a.is_confirmed === b.is_confirmed ? 0 : a.is_confirmed ? -1 : 1),
      render: (_, record) => {
        if (!record.is_confirmed) return <Tag color="orange">Nincs</Tag>;
        
        return (
            <Space direction="vertical" size={0} style={{lineHeight: 1.2}}>
                <Tag color="green">Visszaigazolva</Tag>
                {record.confirmed_at && (
                    <div style={{fontSize: 11, fontWeight: 'bold'}}>
                        {dayjs(record.confirmed_at).format('YYYY-MM-DD HH:mm')}
                    </div>
                )}
                {record.confirmed_by_info && (
                    <div style={{fontSize: 11, color: '#666'}}>
                        {record.confirmed_by_info}
                    </div>
                )}
                {record.confirmed_by_user_name && (
                    <div style={{fontSize: 11, color: '#666'}}>
                        {record.confirmed_by_user_name}
                    </div>
                )}
            </Space>
        );
      }
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_, record) => (
        <Space>
             <Button 
                type="text" 
                icon={<EyeOutlined />} 
                onClick={() => {
                   if (record.delivery_note_public_url) {
                       window.open(record.delivery_note_public_url, '_blank');
                   } else {
                       message.info('Nincs nyilvános nézet, előbb megnyitás szükséges');
                   }
                }}
                title="Megnyitás"
             />
             <Button 
                type="text" 
                icon={<SendOutlined />} 
                onClick={() => openEmailModal({
                    id: record.delivery_note, 
                    delivery_note_number: record.delivery_note_number,
                    customer_name: record.customer_name
                })}
                title="Kiküldés"
             />
              <Popconfirm 
                title="Biztosan törli a teljes szállítólevelet?" 
                onConfirm={() => handleDelete(record.delivery_note)}
                okText="Igen" cancelText="Nem"
              >
                <Button 
                    type="text" 
                    danger
                    icon={<DeleteOutlined />} 
                    title="Törlés"
                />
              </Popconfirm>
        </Space>
      )
    }
  ];

  /* Creation Columns */
  const creationColumns: ColumnsType<OrderItemForDelivery> = [
    {
        title: 'Rendelés',
        dataIndex: 'order_number',
        key: 'order_number',
        width: 120,
    },
    {
        title: 'Tétel',
        dataIndex: 'item_name',
        key: 'item_name',
    },
    {
        title: 'Mértékegység',
        dataIndex: 'unit',
        key: 'unit',
        width: 80,
    },
    {
        title: 'Rendelt',
        dataIndex: 'ordered_quantity',
        key: 'ordered_quantity',
        width: 100,
    },
    {
        title: 'Kiszállítva',
        dataIndex: 'delivered_quantity',
        key: 'delivered_quantity',
        width: 100,
    },
    {
        title: 'Maradék',
        dataIndex: 'remaining_quantity',
        key: 'remaining_quantity',
        width: 100,
        render: (val) => <b style={{color: val > 0 ? 'red' : 'green'}}>{val}</b>
    },
    {
        title: 'Most szállít',
        key: 'to_deliver',
        width: 150,
        render: (_, record, index) => (
            <Space>
                <NumInput 
                    min={0}
                    max={record.remaining_quantity}
                    value={record.to_deliver}
                    onChange={(val) => {
                        const newItems = [...availableItems];
                        newItems[index].to_deliver = val || 0;
                        setAvailableItems(newItems);
                    }}
                />
                <Button 
                    size="small" 
                    type="dashed"
                    onClick={() => {
                        const newItems = [...availableItems];
                        newItems[index].to_deliver = record.remaining_quantity;
                        setAvailableItems(newItems);
                    }}
                >
                    Max
                </Button>
            </Space>
        )
    }
  ];

  const totalValue = availableItems.reduce((acc, curr) => acc + (curr.to_deliver * curr.unit_price), 0);

  return (
    <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
                <UnifiedQuickSearchHeader
                        title={<h1 style={{ margin: 0 }}>Szállítólevél Tételek</h1>}
                        actions={<Space className="pixi-unified-card-actions">
             {csvMode ? (
               <Space size="small">
                 <span style={{ fontSize: 13, color: '#666' }}>{csvSelectedKeys.length > 0 ? `${csvSelectedKeys.length} kijelölve` : 'Minden látható'}</span>
                 <Button type="primary" icon={<FileTextOutlined />} size="small" onClick={exportCsv}>CSV letöltés</Button>
                 <Button size="small" onClick={() => { setCsvMode(false); setCsvSelectedKeys([]); }}>Mégse</Button>
               </Space>
             ) : (
               <Tooltip title="CSV export"><Button icon={<FileTextOutlined />} onClick={() => { setCsvMode(true); setCsvSelectedKeys([]); }} /></Tooltip>
             )}
                 <Button onClick={() => {
                     setFilterNoteNumber('');
                     setFilterOrderNumber('');
                     setFilterItemName('');
                 }}>Szűrők törlése</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={startCreate}>
            Új szállítólevél
            </Button>
                        </Space>}
                />
      </div>

      <EnhancedTable
        tableKey="deliveryNotes"
        searchValue={searchText}
        onSearchChange={handleSearch}
        searchPlaceholder="Keresés..."
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        cardBreakpoint={850}
        rowSelection={csvMode ? { selectedRowKeys: csvSelectedKeys, onChange: (keys) => setCsvSelectedKeys(keys), columnWidth: 40 } : undefined}
      />

      <Modal
        title="Új szállítólevél készítése"
        open={isModalOpen}
        onCancel={() => {
            const isDirty = selectedEntityId !== null || deliveryNoteNotes !== '' || availableItems.some(i => i.to_deliver > 0);
            if (isDirty) {
                 Modal.confirm({
                    title: 'Biztosan bezárja?',
                    content: 'A nem mentett változtatások elvesznek.',
                    okText: 'Igen',
                    cancelText: 'Nem',
                    onOk: () => setIsModalOpen(false)
                });
            } else {
                setIsModalOpen(false);
            }
        }}
        onOk={handleSave}
        confirmLoading={creating}
        width={1000}
        okText="Létrehozás"
        cancelText="Mégse"
      >
        <Space direction="vertical" style={{width: '100%', marginBottom: 16}}>
            <Descriptions column={2}>
                <Descriptions.Item label="Dátum">
                    <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
                </Descriptions.Item>
                <Descriptions.Item label="Ügyfél">
                    <Select 
                        showSearch
                        placeholder="Válasszon ügyfelet"
                        filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        style={{width: 300}}
                        onChange={handleEntitySelect}
                        value={selectedEntityId}
                        options={deliverableCustomers.map(c => ({ label: c.name, value: c.id }))}
                    />
                </Descriptions.Item>
                <Descriptions.Item label="Megjegyzés" span={2}>
                    <Input.TextArea value={deliveryNoteNotes} onChange={e => setDeliveryNoteNotes(e.target.value)} rows={2} />
                </Descriptions.Item>
            </Descriptions>
        </Space>

        {selectedEntityId && (
            <>
                <h4>Kiszállítható tételek (Aktív rendelésekből)</h4>
                <Table 
                    columns={creationColumns}
                    dataSource={availableItems}
                    rowKey="order_item_id"
                    pagination={false}
                    size="small"
                    scroll={{ y: 400 }}
                />
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <h3>Összes nettó érték (Szállítandó): {totalValue.toLocaleString()} Ft</h3>
                </div>
            </>
        )}
      </Modal>
      
      {/* Email Modal */}
      <Modal 
        title={`Szállítólevél küldés: ${emailTargetNumber} (${emailTargetName})`}
        open={emailModalOpen}
        onCancel={() => setEmailModalOpen(false)}
        footer={[
            <Button key="preview" onClick={handleEmailPreview}>Előnézet</Button>,
            <Button key="cancel" onClick={() => setEmailModalOpen(false)}>Mégse</Button>,
            <Button key="send" type="primary" loading={sending} icon={<SendOutlined />} onClick={handleEmailSend}>Küldés</Button>
        ]}
        width={800}
      >
           <Form 
                layout="vertical" 
                form={sendForm} 
                initialValues={{ template_key: 'szallitolevel', signature_key: 'default' }}
                onValuesChange={handleTemplateChange}
           >
                <Form.Item label="Címzettek" name="to" rules={[{ required: true, message: 'Adja meg a címzettet!' }]}>
                    <Input placeholder="email1@example.com, email2@example.com" />
                </Form.Item>
                <Form.Item label="Másolat" name="cc">
                    <Input placeholder="cc@example.com" />
                </Form.Item>
                <div style={{ display: 'flex', gap: 16 }}>
                    <Form.Item label="Sablon" name="template_key" style={{ flex: 1 }}>
                        <Select showSearch optionFilterProp="children">
                            {emailTemplates.map(t => (
                                <Select.Option key={t.key} value={t.key}>{t.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item label="Aláírás" name="signature_key" style={{ flex: 1 }}>
                        <Select showSearch optionFilterProp="children">
                            <Select.Option value="">Nincs</Select.Option>
                            <Select.Option value="default">User alapértelmezett</Select.Option>
                            {signatureTemplates.map(t => (
                                <Select.Option key={t.key} value={t.key}>{t.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </div>
                <Form.Item label="Tárgy" name="subject">
                    <Input placeholder="E-mail tárgya (üresen hagyva a sablonból jön)" />
                </Form.Item>
                <Form.Item label="Törzs" name="body">
                    <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50 }} />
                </Form.Item>
           </Form>
           
           {emailPreview && (
                <>
                <Divider>Előnézet</Divider>
                <div style={{ border: '1px solid #ddd', padding: 16, borderRadius: 4 }}>
                    <div style={{marginBottom: 8}}><b>Tárgy:</b> {emailPreview.subject}</div>
                    <div className="email-preview-content">
                        {emailPreview.is_html ? (
                            <div dangerouslySetInnerHTML={{ __html: emailPreview.body }} />
                        ) : (
                            <pre style={{whiteSpace: 'pre-wrap'}}>{emailPreview.body}</pre>
                        )}
                    </div>
                </div>
                </>
           )}
      </Modal>
    </div>
  );
};

export default DeliveryNotes;