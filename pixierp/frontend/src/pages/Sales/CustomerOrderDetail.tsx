import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, Tag, Divider, Row, Col, Form, Select, Input, Button, message, Modal, Spin, Space, List, DatePicker, Popover, Steps, Dropdown, Alert, Upload, Tooltip } from 'antd';
import { ItemsTable } from '../../components/Sales/ItemsTable';
import { ItemSelectorModal, SelectedItemPayload } from '../../components/Sales/ItemSelectorModal';
import ExtraWorksPanel from '../../components/Sales/ExtraWorksPanel';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { LeftOutlined, TeamOutlined, CheckCircleOutlined, RocketOutlined, CheckOutlined, CarOutlined, UserAddOutlined, UserSwitchOutlined, ClockCircleOutlined, HistoryOutlined, MessageOutlined, FileTextOutlined, FileDoneOutlined, SettingOutlined, SmileOutlined, CloseCircleOutlined, UploadOutlined, DeleteOutlined, PaperClipOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { salesService } from '../../services/salesService';
import { useAuth } from '../../contexts/AuthContext';
import { useTimeTracker } from '../../contexts/TimeTrackerContext';
import { Table } from 'antd';
import { ChatDrawer } from '../../components/Chat/ChatDrawer';
import ActivityLogModal from '../../components/ActivityLogModal';
import { isPdf, openPdfPreview } from '../../utils/pdfPreview';

const { TextArea } = Input;

const stripHtmlToText = (s: any): string => {
  if (s == null) return '';
  const str = String(s);
  if (str.indexOf('<') === -1 && str.indexOf('&') === -1) return str;
  if (typeof document !== 'undefined') {
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = str;
      return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    } catch {
      // fall back to regex when DOM parsing is unavailable
    }
  }
  return str.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};


const CustomerOrderDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const hidePrices = location.state?.hidePrices;
  const isPopup = new URLSearchParams(location.search).get('popup') === '1';
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>();
  const [formBasic] = Form.useForm();
  const [orderFiles, setOrderFiles] = useState<UploadFile<any>[]>([]);
  const [orderAttachments, setOrderAttachments] = useState<any[]>([]);
  const [attachUploading, setAttachUploading] = useState(false);
  const [attachRemark, setAttachRemark] = useState('');
  const [editingRemarkId, setEditingRemarkId] = useState<number | null>(null);
  const [editingRemarkValue, setEditingRemarkValue] = useState('');
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [filePreviewTitle, setFilePreviewTitle] = useState('');
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [takeoverConfirmOpen, setTakeoverConfirmOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [inviteUserId, setInviteUserId] = useState<number | null>(null);
  
  // Work Log features
  const { setModalOpen: setTimerModalOpen, setPreselectedOrderId } = useTimeTracker();
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [workLogs, setWorkLogs] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);

  // Long-press for status dropdown
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  // Item editing
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'manufacturing' | 'service'>('product');
  const [editContext, setEditContext] = useState<null | { item: any }>(null);

  const loadLogs = async () => {
    try {
        const params: any = { order_id: id };
        if (hidePrices) {
            params.user_id = user?.id;
        }
        const res = await salesService.getWorkLogs(params);
        setWorkLogs(res.results ?? res);
        setLogModalOpen(true);
    } catch (e) {
        message.error('Nem sikerült betölteni a naplót');
    }
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await api.get(`/sales/customer-orders/${id}/`);
      const orderData = response.data;
      setOrder(orderData);
      
      const rfq = orderData.quote_request;
      try {
        const createdByName = orderData.created_by_name || rfq?.created_by_name || rfq?.requested_by_name || '';
        formBasic.setFieldsValue({
          number: orderData.order_number,
          created_by_name: createdByName,
          issue_date: rfq?.issue_date ? dayjs(rfq.issue_date) : null,
          deadline: rfq?.deadline ? dayjs(rfq.deadline) : null,
          company_id: rfq?.company?.name || rfq?.company_name || rfq?.contacts?.[0]?.company_name || '',
          contact_ids: rfq?.contact_names || '',
          title: rfq?.title || '',
          project_id: orderData.project_name || rfq?.project?.name || '',
          description: stripHtmlToText(rfq?.description),
          internal_description: stripHtmlToText(rfq?.internal_description),
          currency_code: rfq?.currency_code || 'HUF',
        });
      } catch {}
      try {
        const atts = rfq?.attachments || [];
        setOrderFiles(atts.map((a: any) => ({ uid: String(a.id), name: a.file?.split('/').pop() || `#${a.id}`, status: 'done', url: a.file_url || a.file, response: a })));
      try {
        const attRes = await api.get(`/sales/customer-orders/${id}/attachments/`);
        setOrderAttachments(attRes.data || []);
      } catch {}
      } catch {}
    } catch (error: any) {
      message.error(error?.response?.data?.detail || 'Hiba a megrendelés betöltésekor');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const us = await salesService.listUsers();
        setAllUsers(us as any);
      } catch {}
    })();
  }, []);

  const handleBack = useCallback(() => {
    if (isPopup) {
        window.close();
        return;
    }
    if (location.key !== "default") {
        navigate(-1);
    } else {
        navigate('/sales/customer-orders');
    }
  }, [navigate, isPopup]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleBack();
        }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [handleBack]);

  const startLongPress = () => {
    longPressTriggeredRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setStatusMenuOpen(true);
    }, 600);
  };

  const endLongPress = (normalAction?: () => void) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (!longPressTriggeredRef.current && normalAction) {
      normalAction();
    }
    longPressTriggeredRef.current = false;
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      const response = await api.post(`/sales/customer-orders/${id}/update_status/`, { status: newStatus });
      if (response.data?.status === 'approval_requested') {
        message.info(response.data?.message || 'Jóváhagyásra vár');
      } else {
        message.success('Státusz frissítve');
      }
      load();
    } catch (err: any) {
      message.error(err?.response?.data?.error || err?.response?.data?.detail || 'Hiba történt a státuszváltáskor');
    }
  };

  const onEditSelected = async (payload: SelectedItemPayload) => {
    if (!editContext?.item) return;
    try {
      const patch: any = {
        quantity: payload.quantity,
        unit: payload.unit,
        net_unit_price: payload.net_unit_price,
        vat_rate: payload.vat_rate,
        description: payload.description,
        discount_percent: (payload as any).discount_percent,
        discount_amount: (payload as any).discount_amount,
      };
      if (payload.item_type === 'product') {
        patch.item_type = 'product'; patch.product = payload.ref_id; patch.manufacturing_product = null; patch.service = null;
      } else if (payload.item_type === 'manufacturing') {
        patch.item_type = 'manufacturing'; patch.manufacturing_product = payload.ref_id; patch.product = null; patch.service = null;
      } else if (payload.item_type === 'service') {
        patch.item_type = 'service'; patch.service = payload.ref_id; patch.product = null; patch.manufacturing_product = null;
      }
      // CustomerOrderItem has its own quantity/price fields; patch via customer-order-items endpoint
      const coiPatch: any = {
        quantity: patch.quantity,
        unit: patch.unit,
        net_unit_price: patch.net_unit_price,
        vat_rate: patch.vat_rate,
        description: patch.description,
        discount_percent: patch.discount_percent,
      };
      await api.patch(`/sales/customer-order-items/${editContext.item.id}/`, coiPatch);
      // Also update attachments on the underlying quote_item
      if ((payload as any).files && (payload as any).files.length) {
        const qiId = editContext.item.quote_item?.id;
        if (qiId) {
          for (const f of (payload as any).files) {
            try {
              const key = (f as any)?.uid || (f as any)?.name;
              const remark = (payload as any).fileRemarks ? (payload as any).fileRemarks[key] : undefined;
              await salesService.uploadQuoteRequestItemAttachment(qiId, f as any, remark);
            } catch {
              message.error('Nem sikerült feltölteni egy csatolmányt');
            }
          }
        }
      }
      message.success('Tétel frissítve');
      setSelectorOpen(false);
      setEditContext(null);
      load();
    } catch {
      message.error('Nem sikerült frissíteni a tételt');
    }
  };

  const handleStatusChange = async (action: string) => {
    try {
      const response = await api.post(`/sales/customer-orders/${id}/${action}/`, {});
      if (response.data?.status === 'approval_requested') {
        message.info(response.data?.message || 'Jóváhagyásra vár');
      } else {
        message.success('Státusz frissítve');
      }
      load();
    } catch (error: any) {
      message.error(error?.response?.data?.error || 'Hiba történt a művelet során');
    }
  };

  const statusTag = (status: string) => {
    const statusMap: any = {
      new: { color: 'blue', text: 'Új' },
      confirmed: { color: 'green', text: 'Megerősítve' },
      in_production: { color: 'orange', text: 'Gyártásban' },
      ready: { color: 'purple', text: 'Kész' },
      in_delivery: { color: 'cyan', text: 'Szállítás alatt' },
      delivered: { color: 'success', text: 'Kiszállítva' },
      cancelled: { color: 'red', text: 'Törölve' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return (
      <Space size={6} wrap>
        <Tag color={config.color}>{config.text}</Tag>
        {order?.pending_approval && (
          <Tag color="gold">
            Jóváhagyásra vár: {statusMap[order.pending_approval.requested_status]?.text || order.pending_approval.requested_status}
          </Tag>
        )}
      </Space>
    );
  };

  const getStepStatus = () => {
      if (!order) return { current: 0, status: 'process' };
      const s = order.status;
      if (s === 'cancelled') return { current: 1, status: 'error' }; // Just loose logic
      
      const map: any = {
          'new': 1,
          'confirmed': 2,
          'in_production': 3,
          'ready': 4,
          'in_delivery': 5,
          'delivered': 6
      };
      
      let current = map[s] || 0;
      let status = s === 'delivered' ? 'process' : 'process';

      if (s === 'delivered') {
          if (order.invoice_number) {
              current = 7;
              status = 'finish';
          } else {
              current = 6;
          }
      }
      
      return { current, status };
  };

  const { current: currentStep, status: stepStatus } = getStepStatus();

  const ALL_STATUSES = [
    { key: 'new', label: 'Új', icon: <FileDoneOutlined /> },
    { key: 'confirmed', label: 'Megerősítve', icon: <CheckCircleOutlined /> },
    { key: 'in_production', label: 'Gyártásban', icon: <RocketOutlined /> },
    { key: 'ready', label: 'Kész', icon: <CheckOutlined /> },
    { key: 'in_delivery', label: 'Szállítás alatt', icon: <CarOutlined /> },
    { key: 'delivered', label: 'Kiszállítva', icon: <SmileOutlined /> },
    { key: 'cancelled', label: 'Törölve', icon: <CloseCircleOutlined /> },
  ];

  const statusMenuItems = order
    ? ALL_STATUSES.filter(s => s.key !== order.status).map(s => ({
        key: s.key, icon: s.icon, label: s.label, danger: s.key === 'cancelled',
      }))
    : [];

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Form form={formBasic} style={{ display: 'none' }} />
        <Spin />
      </div>
    );
  }

  if (!order) return null;
  
  const rfq = order.quote_request || {};

  return (
    <div>
      <Card title={<Space>
        <Button icon={<LeftOutlined />} onClick={handleBack}>Vissza</Button>
        <span>Megrendelés {order.order_number}</span>
      </Space>} extra={<Space>
        <Button icon={<MessageOutlined />} onClick={() => setChatOpen(true)}>Chat</Button>
        <Button icon={<ClockCircleOutlined />} onClick={() => {
            if (order?.id) setPreselectedOrderId(order.id);
            setTimerModalOpen(true);
        }}>Stopper</Button>
        <Button icon={<HistoryOutlined />} onClick={loadLogs}>Munkanapló</Button>
        <Button icon={<FileTextOutlined />} onClick={() => setActivityLogOpen(true)}>Napló</Button>
        <Dropdown
          open={statusMenuOpen}
          onOpenChange={(v) => { if (!v) setStatusMenuOpen(false); }}
          trigger={[]}
          placement="bottomRight"
          menu={{
            items: statusMenuItems,
            onClick: ({ key }) => { setStatusMenuOpen(false); handleUpdateStatus(key); },
          }}
        >
          {order.status === 'new' ? (
            <Button type="primary" icon={<CheckCircleOutlined />}
              onMouseDown={startLongPress}
              onMouseUp={() => endLongPress(() => handleStatusChange('confirm'))}
              onMouseLeave={() => endLongPress()}
            >Megerősítés</Button>
          ) : order.status === 'confirmed' ? (
            <Button type="primary" icon={<RocketOutlined />}
              onMouseDown={startLongPress}
              onMouseUp={() => endLongPress(() => handleStatusChange('start_production'))}
              onMouseLeave={() => endLongPress()}
            >Gyártás indítása</Button>
          ) : order.status === 'in_production' ? (
            <Button type="primary" icon={<CheckOutlined />}
              onMouseDown={startLongPress}
              onMouseUp={() => endLongPress(() => handleStatusChange('mark_ready'))}
              onMouseLeave={() => endLongPress()}
            >Készre jelölés</Button>
          ) : order.status === 'ready' ? (
            <Button type="primary" icon={<CarOutlined />}
              onMouseDown={startLongPress}
              onMouseUp={() => endLongPress(() => handleStatusChange('start_delivery'))}
              onMouseLeave={() => endLongPress()}
            >Szállítás indítása</Button>
          ) : order.status === 'in_delivery' ? (
            <Button type="primary" icon={<CheckCircleOutlined />}
              onMouseDown={startLongPress}
              onMouseUp={() => endLongPress(() => handleStatusChange('mark_delivered'))}
              onMouseLeave={() => endLongPress()}
            >Kiszállítva jelölés</Button>
          ) : (
            <Button icon={<SettingOutlined />} onClick={() => setStatusMenuOpen(true)}>Státusz módosítás</Button>
          )}
        </Dropdown>
      </Space>}>
        <div style={{ marginBottom: 8 }}>
          <Space>
            {rfq?.assignee_names ? (<span style={{ color: '#888' }}><TeamOutlined /> {rfq.assignee_names}</span>) : null}
          </Space>
        </div>

        <div style={{ marginBottom: 30, marginTop: 10 }}>
            <Steps
                current={currentStep}
                status={stepStatus as any}
                items={[
                    { title: 'Ajánlat', icon: <FileTextOutlined /> },
                    { title: 'Új megrendelés', icon: <FileDoneOutlined /> },
                    { title: 'Megerősítve', icon: <CheckCircleOutlined /> },
                    { title: 'Gyártás', icon: <RocketOutlined /> },
                    { title: 'Kész', icon: <CheckOutlined /> },
                    { title: 'Szállítás', icon: <CarOutlined /> },
                    { title: 'Kiszállítva', icon: <SmileOutlined /> },
                    { title: 'Kiszámlázva', icon: <FileTextOutlined /> },
                ]}
            />
            {order.status !== 'cancelled' && order.status !== 'delivered' && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                     {order.status === 'new' && (
                        <Button type="primary" size="large" icon={<CheckCircleOutlined />} onClick={() => handleStatusChange('confirm')}>
                            Megerősítés (Következő státusz)
                        </Button>
                     )}
                     {order.status === 'confirmed' && (
                        <Button type="primary" size="large" icon={<RocketOutlined />} onClick={() => handleStatusChange('start_production')}>
                            Gyártás indítása (Következő státusz)
                        </Button>
                     )}
                     {order.status === 'in_production' && (
                        <Button type="primary" size="large" icon={<CheckOutlined />} onClick={() => handleStatusChange('mark_ready')}>
                            Készre jelölés (Következő státusz)
                        </Button>
                     )}
                     {order.status === 'ready' && (
                        <Button type="primary" size="large" icon={<CarOutlined />} onClick={() => handleStatusChange('start_delivery')}>
                            Szállítás indítása (Következő státusz)
                        </Button>
                     )}
                      {order.status === 'in_delivery' && (
                        <Button type="primary" size="large" icon={<CheckCircleOutlined />} onClick={() => handleStatusChange('mark_delivered')}>
                            Kiszállítva (Következő státusz)
                        </Button>
                     )}
                </div>
            )}
        </div>

        {order.pending_approval && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Jóváhagyásra vár: ${order.pending_approval.requester}`}
            description={`Kért státusz: ${order.pending_approval.requested_status}`}
          />
        )}

        <Form layout="vertical" form={formBasic}>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="Megrendelés száma" name="number">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Rögzítette" name="created_by_name">
                <Input readOnly />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Keltezés" name="issue_date">
                <DatePicker style={{ width: '100%' }} disabled />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="Határidő" name="deadline">
                <DatePicker style={{ width: '100%' }} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Cég" name="company_id">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item label="Kapcsolattartók" name="contact_ids">
                <Input disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item label="Megnevezés" name="title">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="Projekt" name="project_id">
                <Input disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Leírás" name="description">
                <TextArea autoSize={{ minRows: 1, maxRows: 6 }} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Belső leírás" name="internal_description">
                <TextArea autoSize={{ minRows: 1, maxRows: 6 }} disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Pénznem" name="currency_code">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={16} style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
              <div style={{ flex: 1 }} />
              <div style={{ alignSelf: 'flex-end' }}>{statusTag(order.status)}</div>
            </Col>
          </Row>
        </Form>

        {/* Assignment controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ color: '#555' }}>
            {rfq?.owner_name ? (<span><strong>Felelős:</strong> {rfq.owner_name} </span>) : (<span><strong>Felelős:</strong> - </span>)}
            
            <div style={{ display: 'inline-block', marginLeft: 12 }}>
                <strong>Résztvevők: </strong>
                {rfq?.assignee_details && rfq.assignee_details.length > 0 ? (
                    rfq.assignee_details.map((part: any) => (
                        <Tag 
                            key={part.id} 
                            closable={!hidePrices}
                            onClose={async (e) => {
                                e.preventDefault();
                                if (!rfq?.id) return;
                                try {
                                    await salesService.removeAssignee(rfq.id, part.id);
                                    message.success('Résztvevő eltávolítva');
                                    load();
                                } catch {
                                    message.error('Hiba törléskor');
                                }
                            }}
                        >
                            {part.name}
                        </Tag>
                    ))
                ) : (
                    <span>-</span>
                )}
            </div>

            {Array.isArray(rfq?.invitations_pending) && (rfq.invitations_pending.length > 0) ? (
              <span style={{ marginLeft: 12, color: '#888' }}>
                <strong>Meghívottak: </strong>
                {rfq.invitations_pending.map((i: any) => (
                    <Tag 
                        key={i.id} 
                        closable={!hidePrices}
                        color="warning"
                        onClose={async (e) => {
                                e.preventDefault();
                                if (!rfq?.id) return;
                                try {
                                    await salesService.cancelInvitation(rfq.id, i.id);
                                    message.success('Meghívás visszavonva');
                                    load();
                                } catch {
                                    message.error('Hiba');
                                }
                            }}
                    >
                        {i.invitee_name}
                    </Tag>
                ))}
              </span>
            ) : null}
          </div>
          <Space>
            <Button icon={<UserAddOutlined />} onClick={async () => {
              if (!rfq?.id) return;
              try { await salesService.takeQuoteRequest(rfq.id); message.success('Hozzárendelve (ide vele)'); load(); }
              catch { message.error('Nem sikerült'); }
            }}>Ide vele</Button>
            {(() => {
              const assignees: number[] = (rfq?.assignees || []) as number[];
              const isMeAssigned = user?.id ? assignees.includes(user.id) : false;
              const onToggle = async () => {
                if (!rfq?.id) return;
                try {
                  if (isMeAssigned) {
                    await salesService.leaveQuoteRequest(rfq.id);
                    message.success('Kiszálltál');
                  } else {
                    await salesService.joinQuoteRequest(rfq.id);
                    message.success('Beszálltál');
                  }
                  load();
                } catch {
                  message.error('Nem sikerült');
                }
              };
              return (
                <Button onClick={onToggle}>{isMeAssigned ? 'Kiszállok' : 'Beszállok'}</Button>
              );
            })()}
            <Button icon={<UserSwitchOutlined />} onClick={() => setTakeoverConfirmOpen(true)}>Átveszem</Button>
            <Select
              showSearch
              allowClear
              placeholder="Munkatárs meghívása"
              optionFilterProp="label"
              style={{ minWidth: 240 }}
              value={inviteUserId as any}
              onChange={(val) => setInviteUserId(val || null)}
            >
              {allUsers.map((u) => (
                <Select.Option key={u.id} value={u.id} label={u.name}>{u.name}</Select.Option>
              ))}
            </Select>
            <Button disabled={!inviteUserId} onClick={async () => {
              if (!inviteUserId || !rfq?.id) return;
              try { await salesService.inviteUserToRfq(rfq.id, inviteUserId); message.success('Meghívó elküldve'); setInviteUserId(null); load(); }
              catch { message.error('Nem sikerült meghívni'); }
            }}>Meghívás</Button>
          </Space>
        </div>

        <Divider />

        {order.invoice_number && (
          <Alert
            type="info"
            showIcon
            message={`A megrendelés számlázva (${order.invoice_number}), az árak már nem módosíthatók.`}
            style={{ marginBottom: 12 }}
          />
        )}

        <ItemsTable
          items={order.items || []}
          onRefresh={load}
          quoteRequestId={rfq?.id ? Number(rfq.id) : undefined}
          currency={rfq?.currency_code || 'HUF'}
          hidePrices={hidePrices}
          hideDetailLink
          showInlineSubItems
          onEditItem={(() => {
            // Számlázás után már nem szerkeszthető
            if (order.invoice_number) return undefined;
            // Csak sales.orders edit jogosultsággal, vagy admin/superuser
            const canEdit =
              (user as any)?.is_superuser ||
              (user as any)?.is_staff ||
              ((user as any)?.permissions ?? []).some(
                (p: any) => p.resource === 'sales.orders' && p.action === 'edit' && p.allowed !== false
              ) ||
              ((user as any)?.permissions ?? []).some(
                (p: any) => p.resource === 'sales.orders' && p.action === 'manage' && p.allowed !== false
              );
            if (!canEdit) return undefined;
            return (item: any) => {
              setEditContext({ item });
              setSelectorType(item.item_type);
              setSelectorOpen(true);
            };
          })()}
        />

        <Divider />

        <ExtraWorksPanel
          orderId={Number(id)}
          showPrices={!hidePrices}
          orderItems={order.items || []}
          onChange={load}
        />

        <Divider />

        <Card
          size="small"
          title="Csatolmányok"
          extra={
            <Space>
              <Input
                placeholder="Megjegyzés (opcionális)"
                size="small"
                value={attachRemark}
                onChange={e => setAttachRemark(e.target.value)}
                style={{ width: 200 }}
              />
              <Upload
                showUploadList={false}
                beforeUpload={async (file) => {
                  setAttachUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append('file', file);
                    if (attachRemark) fd.append('remark', attachRemark);
                    await api.post(`/sales/customer-orders/${id}/attachments/`, fd, {
                      headers: { 'Content-Type': 'multipart/form-data' },
                    });
                    message.success('Fájl feltöltve');
                    setAttachRemark('');
                    const attRes = await api.get(`/sales/customer-orders/${id}/attachments/`);
                    setOrderAttachments(attRes.data || []);
                  } catch {
                    message.error('Feltöltés sikertelen');
                  } finally {
                    setAttachUploading(false);
                  }
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={attachUploading} size="small">Feltöltés</Button>
              </Upload>
            </Space>
          }
        >
          <List
            size="small"
            bordered
            locale={{ emptyText: 'Nincs csatolmány' }}
            dataSource={[
              ...orderAttachments,
              ...(orderFiles || []).map((f: any) => ({
                id: `rfq-${f.uid}`,
                original_filename: f.name,
                file_url: f.url,
                remark: f.response?.remark || '',
                uploaded_by_name: f.response?.uploaded_by_name || '',
                created_at: f.response?.created_at || '',
                _source: 'rfq',
                _source_label: 'Ajánlat',
              })),
            ]}
            renderItem={(att: any) => {
              const isImage = (att.original_filename || '').match(/\.(jpg|jpeg|png|gif|webp)$/i);
              const fileBtn = isImage && att.file_url ? (
                <Popover content={<img src={att.file_url} alt={att.original_filename} style={{ maxWidth: 300, maxHeight: 300, objectFit: 'contain' }} />} title={att.original_filename}>
                  <Button type="link" style={{ padding: 0 }} onClick={() => window.open(att.file_url, '_blank')}>{att.original_filename}</Button>
                </Popover>
              ) : (
                <Button type="link" style={{ padding: 0 }} onClick={() => isPdf(att.file_url) ? openPdfPreview(att.file_url) : window.open(att.file_url, '_blank')}>{att.original_filename}</Button>
              );
              return (
                <List.Item>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <PaperClipOutlined />
                      {fileBtn}
                      {att._source === 'rfq' && <Tag color="blue" style={{ fontSize: 10 }}>Ajánlat</Tag>}
                      {att._source === 'item' && <Tag color="green" style={{ fontSize: 10 }}>{att._source_label || 'Tétel'}</Tag>}
                      {att._source === 'subitem' && <Tag color="orange" style={{ fontSize: 10 }}>{att._source_label || 'Altétel'}</Tag>}
                      {att._source === 'order' ? (
                        editingRemarkId === att.id ? (
                          <Input.Group compact style={{ display: 'inline-flex' }}>
                            <Input
                              size="small"
                              value={editingRemarkValue}
                              onChange={e => setEditingRemarkValue(e.target.value)}
                              onPressEnter={async () => {
                                try {
                                  const res = await api.patch(`/sales/customer-orders/${id}/attachments/${att.id}/remark/`, { remark: editingRemarkValue });
                                  setOrderAttachments(prev => prev.map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a));
                                  setEditingRemarkId(null);
                                } catch { message.error('Mentés sikertelen'); }
                              }}
                              style={{ width: 200 }}
                              autoFocus
                            />
                            <Button size="small" type="primary" onClick={async () => {
                              try {
                                const res = await api.patch(`/sales/customer-orders/${id}/attachments/${att.id}/remark/`, { remark: editingRemarkValue });
                                setOrderAttachments(prev => prev.map((a: any) => a.id === att.id ? { ...a, remark: res.data.remark } : a));
                                setEditingRemarkId(null);
                              } catch { message.error('Mentés sikertelen'); }
                            }}>Mentés</Button>
                            <Button size="small" onClick={() => setEditingRemarkId(null)}>Mégsem</Button>
                          </Input.Group>
                        ) : (
                          <span
                            style={{ color: att.remark ? '#595959' : '#bbb', fontSize: 12, fontStyle: att.remark ? 'italic' : 'normal', cursor: 'pointer' }}
                            onClick={() => { setEditingRemarkId(att.id); setEditingRemarkValue(att.remark || ''); }}
                            title="Kattints a megjegyzés szerkesztéséhez"
                          >
                            {att.remark || '+ megjegyzés'}
                          </span>
                        )
                      ) : (
                        att.remark && <span style={{ color: '#595959', fontSize: 12, fontStyle: 'italic' }}>{att.remark}</span>
                      )}
                      <span style={{ color: '#888', fontSize: 12 }}>{att.uploaded_by_name}</span>
                      <span style={{ color: '#aaa', fontSize: 12 }}>{att.created_at ? new Date(att.created_at).toLocaleString('hu-HU') : ''}</span>
                    </Space>
                    {att._source === 'order' && (
                      <Tooltip title="Törlés">
                        <Button
                          type="text" danger icon={<DeleteOutlined />} size="small"
                          onClick={async () => {
                            try {
                              await api.delete(`/sales/customer-orders/${id}/attachments/${att.id}/`);
                              setOrderAttachments(prev => prev.filter((a: any) => a.id !== att.id));
                              message.success('Törölve');
                            } catch { message.error('Törlés sikertelen'); }
                          }}
                        />
                      </Tooltip>
                    )}
                  </Space>
                </List.Item>
              );
            }}
          />
        </Card>

        <Modal
          title={filePreviewTitle}
          open={filePreviewOpen}
          onCancel={() => {
            setFilePreviewOpen(false);
            setFilePreviewUrl(null);
            setFilePreviewTitle('');
          }}
          footer={null}
          width={900}
        >
          {filePreviewUrl ? (
            filePreviewUrl.match(/\.pdf($|\?)/i) ? (
              <iframe title="preview" src={filePreviewUrl} style={{ width: '100%', height: '70vh', border: 0 }} />
            ) : (
              <img alt={filePreviewTitle} src={filePreviewUrl} style={{ maxWidth: '100%', maxHeight: '70vh' }} />
            )
          ) : (
            <div>Nincs előnézet</div>
          )}
        </Modal>

        <Divider />

      </Card>
      <Modal
        title={`Munkanapló - Összesen: ${(workLogs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60).toFixed(1)} perc`}
        open={logModalOpen}
        onCancel={() => setLogModalOpen(false)}
        footer={[<Button key="close" onClick={() => setLogModalOpen(false)}>Bezárás</Button>]}
        width={1000}
      >
        <Table
          dataSource={workLogs}
          rowKey="id"
          pagination={false}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: 'Felhasználó', dataIndex: 'user_name' },
            { title: 'Tétel', dataIndex: 'item_name' },
            { title: 'Folyamat', dataIndex: 'workflow_name' },
            { title: 'Kezdet', dataIndex: 'started_at', render: (val) => new Date(val).toLocaleString('hu-HU') },
            { title: 'Vége', dataIndex: 'ended_at', render: (val) => val ? new Date(val).toLocaleString('hu-HU') : 'Folyamatban' },
            { title: 'Időtartam (perc)', dataIndex: 'duration_seconds', align: 'right', render: (val) => (val/60).toFixed(1) },
          ]}
        />
      </Modal>

      <Modal title="Átveszem" open={takeoverConfirmOpen} onCancel={() => setTakeoverConfirmOpen(false)} onOk={async () => {
        if (!rfq?.id) return;
        try { await salesService.takeoverQuoteRequest(rfq.id); message.success('Átvetted'); setTakeoverConfirmOpen(false); load(); } catch { message.error('Nem sikerült átvenni'); }
      }}>
        Biztosan átveszed? Mindenki más lekerül a feladatról és csak te maradsz.
      </Modal>

      <ChatDrawer
        open={chatOpen} 
        onClose={() => setChatOpen(false)} 
        orderId={Number(id)} 
        rfqId={order.quote_request?.id}
        title={`Chat - ${order.order_number}`}
      />

      <ActivityLogModal
        visible={activityLogOpen}
        onClose={() => setActivityLogOpen(false)}
        objectType="customerorder"
        objectId={Number(id)}
        objectTitle={order.order_number || ''}
      />

      {selectorOpen && (
        <ItemSelectorModal
          open={selectorOpen}
          defaultType={selectorType}
          onCancel={() => { setSelectorOpen(false); setEditContext(null); }}
          onAdd={onEditSelected}
          mode="edit"
          rfqId={rfq?.id ? Number(rfq.id) : undefined}
          rfqCurrency={rfq?.currency_code || 'HUF'}
          initialSelection={editContext ? {
            item_type: editContext.item.item_type,
            ref_id: (editContext.item.quote_item?.product || editContext.item.quote_item?.manufacturing_product || editContext.item.quote_item?.service) as number,
            name: (editContext.item.product_name || editContext.item.manufacturing_product_name || editContext.item.service_name),
          } : undefined}
          initialValues={editContext ? {
            quantity: Number(editContext.item.quantity),
            unit: editContext.item.unit,
            net_unit_price: Number(editContext.item.net_unit_price),
            vat_rate: Number(editContext.item.vat_rate),
            description: editContext.item.description,
            discount_percent: Number(editContext.item.discount_percent || 0),
            discount_amount: Number(editContext.item.discount_amount || 0),
          } : undefined}
          quoteItemId={editContext?.item?.quote_item?.id}
        />
      )}
    </div>
  );
};

export default CustomerOrderDetail;
