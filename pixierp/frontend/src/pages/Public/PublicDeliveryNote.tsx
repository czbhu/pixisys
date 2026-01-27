import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, message, Tag, Typography, Descriptions, Spin, Checkbox, Button, Input, Alert, Modal, Row, Col } from 'antd';
import { CheckCircleOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../../services/api';
import dayjs from 'dayjs';

const { Title } = Typography;
const { TextArea } = Input;

interface DeliveryNoteItem {
    id: number;
    item_name: string;
    item_code?: string;
    quantity: number;
    unit: string;
    net_unit_price: number;
    order_number?: string;
}

interface ContactData {
    name: string;
    email?: string;
    phone?: string;
    position?: string;
}

interface SupplierData {
    name: string;
    address: string;
    tax_number?: string;
    email?: string;
    phone?: string;
}

interface DeliveryNoteData {
    delivery_note_number: string;
    customer_name: string;
    customer_address?: string;
    issue_date: string;
    notes: string;
    is_confirmed: boolean;
    confirmed_at?: string;
    items: DeliveryNoteItem[];
    contact_name?: string;
    supplier_info?: SupplierData;
    customer_contacts?: ContactData[];
}

const PublicDeliveryNote: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [data, setData] = useState<DeliveryNoteData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showPrices, setShowPrices] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    const fetchDeliveryData = async () => {
        try {
            setLoading(true);
            const res = await api.get(`/sales/delivery-notes/public/${token}/`);
            setData(res.data);
            setModalVisible(true);
        } catch (err: any) {
            setError("Nem található vagy lejárt szállítólevél link.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchDeliveryData();
    }, [token]);

    const handleConfirm = async () => {
        if (!data) return;
        try {
            setSubmitting(true);
            await api.post(`/sales/delivery-notes/public/${token}/confirm/`, {
                confirmed_items: [],
                notes: notes
            });
            message.success('Szállítólevél sikeresen visszaigazolva!');
            setData({ ...data, is_confirmed: true, confirmed_at: new Date().toISOString() });
        } catch (err: any) {
             message.error('Hiba történt a visszaigazolás során.');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePrint = () => {
        const baseUrl = api.defaults.baseURL || '/api/v1';
        const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const pdfUrl = `${url}/sales/delivery-notes/public/${token}/pdf/?show_prices=${showPrices}`;
        window.open(pdfUrl, '_blank');
    };

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}><Spin size="large" /></div>;
    if (error) return <div style={{ maxWidth: 800, margin: '50px auto', padding: 20 }}><Alert message="Hiba" description={error} type="error" showIcon /></div>;
    if (!data) return null;

    const columns: ColumnsType<DeliveryNoteItem> = [
        { 
            title: 'Tétel', 
            dataIndex: 'item_name', 
            key: 'item_name',
            render: (text, r) => (
                <div>
                     <b>{r.item_code ? `[${r.item_code}] ` : ''}{text}</b>
                     {r.order_number && <div style={{fontSize: 12, color: '#888'}}>Megrendelés: {r.order_number}</div>}
                </div>
            )
        },
        { 
            title: 'Mennyiség', 
            key: 'quantity', 
            align: 'right',
            render: (_: any, r: DeliveryNoteItem) => <span style={{fontSize: 16}}>{r.quantity} {r.unit}</span> 
        },
    ];

    if (showPrices) {
        columns.push({
            title: 'Egységár (Nettó)',
            dataIndex: 'net_unit_price',
            key: 'price',
            align: 'right',
            render: (val) => val ? `${Number(val).toLocaleString()} Ft` : '-'
        });
        columns.push({
            title: 'Összesen (Nettó)',
            key: 'total',
            align: 'right',
            render: (_, r) => r.net_unit_price ? `${(r.quantity * r.net_unit_price).toLocaleString()} Ft` : '-'
        });
    }

    // Calculate statistics
    const stats: { [key: string]: number } = {};
    data.items.forEach(i => {
        const u = i.unit || 'db';
        if (!stats[u]) stats[u] = 0;
        stats[u] += parseFloat(i.quantity as any);
    });
    const quantitySummary = Object.keys(stats).map(u => `${parseFloat(stats[u].toFixed(2))} ${u}`).join(', ');
    const typeSummary = `${data.items.length} fajta tétel`;

    return (
        <div style={{ maxWidth: 1000, margin: '20px auto', padding: '0 20px', fontFamily: 'Arial, sans-serif' }}>
             <Modal
                title="Árak megjelenítése"
                open={modalVisible}
                onOk={() => { setShowPrices(true); setModalVisible(false); }}
                onCancel={() => { setShowPrices(false); setModalVisible(false); }}
                okText="Igen, mutassa az árakat"
                cancelText="Nem, csak a mennyiségeket"
                closable={false}
                maskClosable={false}
                width={400}
                centered
             >
                 <p style={{fontSize: 16}}>Szeretné, hogy a szállítólevélen (és a nyomtatott PDF-en) szerepeljenek az árak?</p>
             </Modal>

             <Card
                style={{ marginBottom: 20 }}
                bodyStyle={{padding: '30px'}}
             >
                 <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: 20, marginBottom: 20}}>
                     {data.supplier_info ? (
                         <div style={{fontSize: 12, color: '#555'}}>
                             <Title level={5} style={{marginBottom: 5}}>Szállító:</Title>
                             <div style={{fontSize: 14, fontWeight: 'bold'}}>{data.supplier_info.name}</div>
                             <div>{data.supplier_info.address}</div>
                             {data.supplier_info.tax_number && <div>Adószám: {data.supplier_info.tax_number}</div>}
                             <div>
                                 {data.supplier_info.email && <span>{data.supplier_info.email}</span>}
                                 {data.supplier_info.phone && <span style={{marginLeft: 10}}>{data.supplier_info.phone}</span>}
                             </div>
                         </div>
                     ) : (
                         <div>Szállító adatai</div>
                     )}
                     <div style={{textAlign: 'right'}}>
                        <Title level={2} style={{ margin: 0 }}>SZÁLLÍTÓLEVÉL</Title>
                        <div style={{fontSize: 16, marginTop: 5}}><b>{data.delivery_note_number}</b></div>
                     </div>
                 </div>

                 <Row gutter={[24, 24]}>
                     <Col span={12} xs={24}>
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="Kiállítás dátuma">{data.issue_date}</Descriptions.Item>
                            {/* Delivery date if available could be shown here */}
                            {data.is_confirmed && (
                                <Descriptions.Item label="Státusz">
                                    <Tag color="green">VISSZAIGAZOLVA</Tag> 
                                    {data.confirmed_at && <span style={{fontSize: 12, color: '#666'}}>({dayjs(data.confirmed_at).format('YYYY-MM-DD HH:mm')})</span>}
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                     </Col>
                     <Col span={12} xs={24}>
                        <Card size="small" title="Megrendelő" style={{background: '#f9f9f9'}}>
                             <div style={{fontWeight: 'bold', fontSize: 15}}>{data.customer_name}</div>
                             <div style={{whiteSpace: 'pre-wrap', marginTop: 5}}>{data.customer_address}</div>
                             {data.contact_name && <div style={{marginTop: 5, fontStyle: 'italic'}}>Kapcsolattartó: {data.contact_name}</div>}
                        </Card>
                     </Col>
                 </Row>

             </Card>

             <Card 
                title={
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap'}}>
                        <span>Szállított tételek</span>
                        <span style={{fontSize: 14, fontWeight: 'normal', color: '#666'}}>
                            Összes mennyiség: <b>{quantitySummary}</b> | {typeSummary}
                        </span>
                    </div>
                } 
                style={{ marginBottom: 20 }}
             >
                {data.is_confirmed && (
                    <div style={{ marginBottom: 16 }}>
                        <Tag color="blue">Minden tétel átvéve</Tag>
                    </div>
                )}
                
                <Table 
                    dataSource={data.items}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    bordered
                    summary={(pageData) => {
                        if (!showPrices) return null;
                        let totalNet = 0;
                        pageData.forEach(({ quantity, net_unit_price }) => {
                             totalNet += (quantity * (net_unit_price || 0));
                        });
                        return (
                            <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={2} />
                                <Table.Summary.Cell index={2} align="right"><b>Összesen (Nettó):</b></Table.Summary.Cell>
                                <Table.Summary.Cell index={3} align="right"><b>{totalNet.toLocaleString()} Ft</b></Table.Summary.Cell>
                            </Table.Summary.Row>
                        );
                    }}
                />
             </Card>

             <Card title="Megjegyzés" style={{ marginBottom: 20 }}>
                <TextArea 
                    rows={4}
                    placeholder="Ide írhat megjegyzést az átvétellel kapcsolatban..."
                    value={notes} 
                    onChange={e => setNotes(e.target.value)}
                    disabled={data.is_confirmed}
                    defaultValue={data.notes}
                />
             </Card>

             {!data.is_confirmed && (
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <Button
                    type="primary"
                    size="large"
                    icon={<CheckCircleOutlined />}
                    onClick={handleConfirm}
                    loading={submitting}
                    style={{minWidth: 250, height: 50, fontSize: 18}}
                  >
                    Szállítólevél visszaigazolása
                  </Button>
                </div>
              )}

            <div style={{ textAlign: 'center', marginTop: 16, marginBottom: 40 }}>
                <Button
                    size="large"
                    icon={<PrinterOutlined />}
                    onClick={handlePrint}
                >
                    Nyomtatás PDF-be
                </Button>
            </div>
            
            {(data.customer_contacts && data.customer_contacts.length > 0) && (
                <div style={{borderTop: '1px solid #eee', paddingTop: 20, marginBottom: 40, color: '#666'}}>
                     <Title level={5} style={{color: '#666'}}>Kapcsolattartók (Megrendeléshez kapcsolva):</Title>
                     <Row gutter={[16, 16]}>
                         {data.customer_contacts.map((c, idx) => (
                             <Col key={idx} xs={24} sm={12} md={8}>
                                 <div style={{fontWeight: 'bold'}}>{c.name}</div>
                                 {c.position && <div style={{fontSize: 12}}>{c.position}</div>}
                                 {c.phone && <div>{c.phone}</div>}
                                 {c.email && <div>{c.email}</div>}
                             </Col>
                         ))}
                     </Row>
                </div>
            )}

            <div style={{textAlign: 'center', color: '#999', paddingBottom: 20}}>
                PixiSys ERP
            </div>
        </div>
    );
}

export default PublicDeliveryNote;