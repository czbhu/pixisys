import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Space, Tag, Spin, Alert, message, Tooltip, Popconfirm, Input, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, CheckOutlined, SearchOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';
import { useNavigate } from 'react-router-dom';

const Quotes: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [quotes, setQuotes] = useState<any[]>([]);
    const [filtered, setFiltered] = useState<any[]>([]);
    const [query, setQuery] = useState('');
    const [creatorFilter, setCreatorFilter] = useState<string | null>(null);

    const navigate = useNavigate();
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            const quotesResponse = await salesService.getQuotes();

            const quotesList = quotesResponse.results || [];
            setQuotes(quotesList);
            setFiltered(quotesList);

        } catch (err) {
            console.error('Error loading data:', err);
            setError('Hiba történt az adatok betöltése során');
        } finally {
            setLoading(false);
        }
    };

    // Keresési logika
    const normalize = (s: any) => (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    
    useEffect(() => {
        let result = quotes;

        // Szűrés rögzítőre
        if (creatorFilter) {
            result = result.filter(q => q.created_by_name === creatorFilter);
        }

        // Szöveges keresés
        const q = normalize(query);
        if (q) {
            result = result.filter(quote => {
                const hay = [
                    quote.quote_number || '',
                    quote.quote_request_number || quote.quote_request?.number || '',
                    quote.customer_name || '',
                    quote.owner_name || quote.quote_request?.owner_name || '',
                    quote.assignee_names || quote.quote_request?.assignee_names || '',
                    quote.status || '',
                    quote.created_by_name || ''
                ].join(' \u0001 ');
                return normalize(hay).includes(q);
            });
        }
        
        setFiltered(result);
    }, [query, quotes, creatorFilter]);

    const creators = useMemo(() => {
        const names = quotes.map(q => q.created_by_name).filter(Boolean);
        return Array.from(new Set(names)).sort();
    }, [quotes]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft': return 'orange';
            case 'sent': return 'blue';
            case 'accepted': return 'green';
            case 'partially_accepted': return 'cyan';
            case 'rejected': return 'red';
            case 'ordered': return 'purple';
            default: return 'default';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'draft': return 'Vázlat';
            case 'sent': return 'Elküldve';
            case 'accepted': return 'Elfogadva';
            case 'partially_accepted': return 'Részben elfogadva';
            case 'rejected': return 'Elutasítva';
            case 'ordered': return 'Megrendelve';
            default: return status;
        }
    };

    const handleAcceptQuote = async (quoteId: number) => {
        try {
            await salesService.acceptQuote(quoteId, []);
            message.success('Ajánlat elfogadva');
            loadData();
        } catch (err) {
            message.error('Hiba történt az ajánlat elfogadása során');
        }
    };

    const handleCreateOrder = async (quoteId: number) => {
        try {
            const deliveryDate = new Date();
            deliveryDate.setDate(deliveryDate.getDate() + 30);

            await salesService.createOrderFromQuote(quoteId, deliveryDate.toISOString().split('T')[0]);
            message.success('Megrendelés létrehozva');
            loadData();
        } catch (err) {
            message.error('Hiba történt a megrendelés létrehozása során');
        }
    };

    const columns = [
        {
            title: 'Ajánlat szám',
            dataIndex: 'quote_number',
            key: 'quote_number',
        },
        {
            title: 'Igény száma',
            dataIndex: ['quote_request', 'number'],
            key: 'rfq_number',
            render: (_: any, r: any): React.ReactNode => r.quote_request_number || r.quote_request?.number || '-',
        },
        {
            title: 'Ügyfél',
            dataIndex: 'customer_name',
            key: 'customer_name',
            sorter: (a: any, b: any) => (a.customer_name || '').localeCompare(b.customer_name || ''),
        },
        { title: 'Felelős', dataIndex: 'owner_name', key: 'owner_name', render: (_: any, r: any): React.ReactNode => r.owner_name || r.quote_request?.owner_name || '-', sorter: (a: any, b: any) => (a.owner_name || a.quote_request?.owner_name || '').localeCompare(b.owner_name || b.quote_request?.owner_name || '') },
        { title: 'Résztvevők', dataIndex: 'assignee_names', key: 'assignee_names', render: (_: any, r: any): React.ReactNode => r.assignee_names || r.quote_request?.assignee_names || '-', sorter: (a: any, b: any) => (a.assignee_names || a.quote_request?.assignee_names || '').localeCompare(b.assignee_names || b.quote_request?.assignee_names || '') },
        {
            title: 'Összeg',
            dataIndex: 'total_amount',
            key: 'total_amount',
            render: (amount: number) => `${amount.toLocaleString()} Ft`,
            sorter: (a: any, b: any) => (a.total_amount || 0) - (b.total_amount || 0),
        },
        {
            title: 'Státusz',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag color={getStatusColor(status)}>
                    {getStatusText(status)}
                </Tag>
            ),
            sorter: (a: any, b: any) => (a.status || '').localeCompare(b.status || ''),
        },
        {
            title: 'Dátum',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date: string, record: any) => (
                <div>
                    <div>{new Date(date).toLocaleDateString('hu-HU')}</div>
                    {record.created_by_name && (
                        <div style={{ fontSize: '11px', color: '#888' }}>
                            {record.created_by_name}
                        </div>
                    )}
                </div>
            ),
            sorter: (a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''),
        },
        {
            title: 'Érvényes',
            dataIndex: 'valid_until',
            key: 'valid_until',
            render: (date: string) => new Date(date).toLocaleDateString('hu-HU'),
            sorter: (a: any, b: any) => (a.valid_until || '').localeCompare(b.valid_until || ''),
        },
        {
            title: 'Műveletek',
            key: 'actions',
            render: (record: any): React.ReactNode => (
                <Space size="small">
                    <Tooltip title="Megtekintés">
                        <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => navigate(`/sales/quotes/${record.id}`)}
                        />
                    </Tooltip>
                    {record.status === 'sent' && (
                        <Tooltip title="Elfogadás">
                            <Button
                                icon={<CheckOutlined />}
                                size="small"
                                type="primary"
                                onClick={() => handleAcceptQuote(record.id)}
                            />
                        </Tooltip>
                    )}
                    {record.status === 'accepted' && (
                        <Tooltip title="Megrendelés">
                            <Button
                                size="small"
                                type="primary"
                                onClick={() => handleCreateOrder(record.id)}
                            >
                                Megrendelés
                            </Button>
                        </Tooltip>
                    )}
                    <Tooltip title="Szerkesztés">
                        <Button
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => navigate(`/sales/quotes/${record.id}`)}
                        />
                    </Tooltip>
                    <Tooltip title="Törlés">
                        <Popconfirm
                            title="Biztosan törölni szeretné ezt az ajánlatot?"
                            onConfirm={() => {
                                // TODO: Implement delete functionality
                            }}
                            okText="Igen"
                            cancelText="Mégse"
                        >
                            <Button
                                icon={<DeleteOutlined />}
                                size="small"
                                danger
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{ padding: '24px', textAlign: 'center' }}>
                <Spin size="large" />
                <p>Adatok betöltése...</p>
            </div>
        );
    }

    return (
        <div>
            <Card
                title="Ajánlatok"
                extra={
                    <Button type="primary" icon={<PlusOutlined />}>
                        Új ajánlat
                    </Button>
                }
            >
                {error && (
                    <Alert
                        message="Hiba"
                        description={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: '16px' }}
                    />
                )}

                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    <Input
                        placeholder="Keresés (ajánlatszám, igényszám, ügyfél, felelős, résztevők)..."
                        prefix={<SearchOutlined />}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        style={{ flex: 1 }}
                        allowClear
                    />
                    <Select
                        placeholder="Szűrés rögzítőre"
                        allowClear
                        style={{ width: 200 }}
                        onChange={setCreatorFilter}
                        value={creatorFilter}
                    >
                        {creators.map((name: string) => (
                            <Select.Option key={name} value={name}>{name}</Select.Option>
                        ))}
                    </Select>
                </div>

                <Table
                    columns={columns}
                    dataSource={filtered}
                    pagination={{ pageSize: 10 }}
                    rowKey="id"
                />
            </Card>
        </div>
    );
};

export default Quotes;
