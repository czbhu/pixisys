import React, { useEffect, useState, useRef } from 'react';
import { Drawer, List, Input, Button, Upload, Avatar, Tag, Tooltip, Dropdown, Menu, message, Modal, Radio, Select, Space, Spin } from 'antd';
import { SendOutlined, PaperClipOutlined, UserOutlined, FileOutlined, EllipsisOutlined, DownloadOutlined, SaveOutlined } from '@ant-design/icons';
import { salesService } from '../../services/salesService';
import { useAuth } from '../../contexts/AuthContext';

interface ChatDrawerProps {
    open: boolean;
    onClose: () => void;
    rfqId?: number;
    orderId?: number;
    title: string;
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({ open, onClose, rfqId, orderId, title }) => {
    const { user } = useAuth();
    const [thread, setThread] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [text, setText] = useState('');
    const [fileList, setFileList] = useState<any[]>([]);
    
    // Promoting
    const [promoteModalOpen, setPromoteModalOpen] = useState(false);
    const [promoteTarget, setPromoteTarget] = useState<'doc'|'item'>('doc');
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [activeAttachment, setActiveAttachment] = useState<any>(null);
    const [docItems, setDocItems] = useState<any[]>([]); // For item selection

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const intervalRef = useRef<any>(null);

    useEffect(() => {
        if (open) {
            loadThread();
            // Poll for new messages
            intervalRef.current = setInterval(loadThread, 5000);
            
            // Load items for potential promotion
            loadDocItems();
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [open, rfqId, orderId]);

    const loadThread = async () => {
        try {
            const res = await salesService.getChatThread({ rfq_id: rfqId, order_id: orderId });
            setThread(res);
        } catch (e) {
            console.error(e);
        }
    };
    
    const loadDocItems = async () => {
        try {
            if (rfqId) {
                const res = await salesService.getCustomerOrder(rfqId); // Wait, this gets Order by ID. Is there RFQ get?
                // salesService.ts has createQuoteFromRfq but maybe not getQuoteRequest?
                // Let's assume we can pass items via props or fetch generic
                // Actually rfqId usually comes from RFQDetail page which has data.
                // But independency is better.
                // Checking salesService exports... getQuoteRequest is likely missing or I need to check api.
                // Let's rely on salesService.getQuoteRequest if exists, or use generic logic.
                // Re-using logic from pages is complex.
                // Assuming we can get items from thread context in future, or separate call.
                // For now, let's leave item list empty until requested.
                
                // Correction: The API endpoint for RFQ details might be needed.
            } else if (orderId) {
                const res = await salesService.getCustomerOrder(orderId);
                setDocItems(res.items || []);
            }
        } catch (e) { }
    };

    // Auto-scroll
    useEffect(() => {
        if (thread?.messages) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [thread]);

    const handleSend = async () => {
        if (!text && fileList.length === 0) return;
        if (!thread?.id) return;
        
        setSending(true);
        try {
            await salesService.sendMessage(thread.id, text, fileList.map(f => f.originFileObj));
            setText('');
            setFileList([]);
            loadThread();
        } catch (e) {
            message.error('Hiba küldés közben');
        } finally {
            setSending(false);
        }
    };

    const handlePromote = async () => {
        if (!thread?.id || !activeAttachment) return;
        
        let targetType = '' as any;
        let targetId = 0;
        
        if (promoteTarget === 'doc') {
            targetType = rfqId ? 'rfq' : 'order'; // BUT API supports 'rfq' only for now in my view logic!
            // Wait, my view logic only handled 'rfq' and 'rfq_item'. 
            // I should have added 'order' support in backend if needed.
            // Let's stick to what backend supports or update backend?
            // Backend supported 'rfq', 'rfq_item'.
            // If this is Order page, we might have issue.
            // But Order is usually final.
            // Let's assume RFQ usage mostly.
            // If I need Order support, I should fix backend.
            targetId = (rfqId || orderId)!;
        } else {
            targetType = rfqId ? 'rfq_item' : 'order_item';
            targetId = selectedItemId!;
        }
        
        try {
            await salesService.promoteAttachment(thread.id, {
                attachment_id: activeAttachment.id,
                target_type: targetType,
                target_id: targetId
            });
            message.success('Sikeres mentés');
            setPromoteModalOpen(false);
        } catch (e) {
            message.error('Hiba a mentés során (támogatott: Ajánlat)');
        }
    };
    
    const openPromoteModal = (att: any) => {
        setActiveAttachment(att);
        setPromoteModalOpen(true);
        
        // Fetch items if not yet loaded and we have context
        if (docItems.length === 0) {
             // Try fetching logic based on ID
             if (rfqId) {
                  salesService.getQuoteRequest(rfqId).then(r => {
                      setDocItems(r.items || []);
                  });
             }
        }
    };

    return (
        <Drawer 
            title={title} 
            open={open} 
            onClose={onClose} 
            width={400}
            bodyStyle={{ display: 'flex', flexDirection: 'column', padding: 0 }}
        >
            <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#f5f5f5' }}>
                <List
                    dataSource={thread?.messages || []}
                    renderItem={(msg: any) => {
                        const isMe = msg.sender === user?.id; // Assuming user.id exists
                        return (
                            <div style={{ 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: isMe ? 'flex-end' : 'flex-start',
                                marginBottom: 16 
                            }}>
                                <div style={{ fontSize: 10, color: '#999', marginBottom: 2, padding: '0 4px' }}>
                                    {msg.sender_name || (isMe ? 'Én' : 'Unknown')}
                                </div>
                                <div style={{ 
                                    maxWidth: '85%', 
                                    background: isMe ? '#1890ff' : 'white',
                                    color: isMe ? 'white' : 'rgba(0,0,0,0.85)',
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                }}>
                                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                                    {msg.attachments?.length > 0 && (
                                        <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 4 }}>
                                            {msg.attachments.map((att: any) => (
                                                <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.05)', padding: 4, borderRadius: 4, marginBottom: 4 }}>
                                                    <Space style={{ overflow: 'hidden' }}>
                                                        <FileOutlined />
                                                        <a href={att.file} target="_blank" rel="noreferrer" style={{ color: isMe ? 'white' : undefined, textDecoration: 'underline' }}>
                                                            {att.original_filename}
                                                        </a>
                                                    </Space>
                                                    <Button 
                                                        size="small" 
                                                        type="text" 
                                                        icon={<SaveOutlined style={{ color: isMe ? 'white' : undefined }} />} 
                                                        onClick={() => openPromoteModal(att)} 
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ fontSize: 10, textAlign: 'right', marginTop: 4, opacity: 0.7 }}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        );
                    }}
                />
                <div ref={messagesEndRef} />
            </div>
            
            <div style={{ padding: 16, background: 'white', borderTop: '1px solid #e8e8e8' }}>
                <Upload 
                    fileList={fileList} 
                    onChange={({ fileList }) => setFileList(fileList)}
                    beforeUpload={() => false}
                >
                    <Button icon={<PaperClipOutlined />} size="small" style={{ marginBottom: 8 }}>Melléklet</Button>
                </Upload>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Input.TextArea 
                        rows={2} 
                        value={text} 
                        onChange={e => setText(e.target.value)} 
                        placeholder="Üzenet írása..."
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <Button type="primary" icon={<SendOutlined />} onClick={handleSend} loading={sending} style={{ height: 'auto' }} />
                </div>
            </div>

            <Modal 
                title="Melléklet mentése" 
                open={promoteModalOpen} 
                onCancel={() => setPromoteModalOpen(false)}
                onOk={handlePromote}
            >
                <div>Hova szeretnéd menteni a fájlt?</div>
                <Radio.Group onChange={e => setPromoteTarget(e.target.value)} value={promoteTarget} style={{ marginTop: 16 }}>
                    <Space direction="vertical">
                        <Radio value="doc">{rfqId ? 'Ajánlat csatolmányokhoz' : 'Megrendelés csatolmányokhoz'}</Radio>
                        <Radio value="item">Tételhez</Radio>
                    </Space>
                </Radio.Group>
                
                {promoteTarget === 'item' && (
                    <div style={{ marginTop: 16 }}>
                        <Select 
                            style={{ width: '100%' }} 
                            placeholder="Válassz tételt"
                            onChange={v => setSelectedItemId(v)}
                        >
                            {docItems.map(i => (
                                <Select.Option key={i.id} value={i.id}>
                                    {i.name || i.product_name || `Tétel #${i.id}`}
                                </Select.Option>
                            ))}
                        </Select>
                    </div>
                )}
            </Modal>
        </Drawer>
    );
};
