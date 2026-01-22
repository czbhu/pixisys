import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Tag, Divider, Table, Row, Col, Form, Select, Input, Button, message, Modal, Spin, Space, List, DatePicker, Checkbox, Alert } from 'antd';
import { salesService } from '../../services/salesService';
import { manufacturingService } from '../../services/manufacturingService';
import { ItemSelectorModal, SelectedItemPayload } from '../../components/Sales/ItemSelectorModal';
import { ItemsTable } from '../../components/Sales/ItemsTable';
import { RFQCostsTable } from '../../components/Sales/RFQCostsTable';
import { Upload, Popconfirm } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { crmService } from '../../services/crmService';
import dayjs from 'dayjs';
import { LeftOutlined, DeleteOutlined, UserAddOutlined, UserSwitchOutlined, LogoutOutlined, TeamOutlined, PlusOutlined, MessageOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { postalCodeService } from '../../services/postalCodeService';
import { getCountries } from '../../services/countryService';
import { ChatDrawer } from '../../components/Chat/ChatDrawer';

const { TextArea } = Input;

const RFQDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rfq, setRfq] = useState<any>();
  // removed unused local product/service lists
  const [projects, setProjects] = useState<any[]>([]);
  const [formBasic] = Form.useForm();
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorType, setSelectorType] = useState<'product' | 'manufacturing' | 'service'>('product');
  const [editContext, setEditContext] = useState<null | { item: any }>(null);
  const [rfqFiles, setRfqFiles] = useState<UploadFile<any>[]>([]);
  const [rfqPendingRemark, setRfqPendingRemark] = useState<string>('');
  const [sendOpen, setSendOpen] = useState(false);
  const [sendForm] = Form.useForm();
  const [preview, setPreview] = useState<{ subject: string; body: string; is_html: boolean } | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [currencyList, setCurrencyList] = useState<any[]>([]);
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [filePreviewTitle, setFilePreviewTitle] = useState('');
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [takeoverConfirmOpen, setTakeoverConfirmOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [inviteUserId, setInviteUserId] = useState<number | null>(null);
  const [isCompanyModalVisible, setIsCompanyModalVisible] = useState(false);
  const [companyForm] = Form.useForm();
  const [selectedCountry, setSelectedCountry] = useState('Magyarország');
  const [navPreviewOpen, setNavPreviewOpen] = useState(false);
  const [navPreviewData, setNavPreviewData] = useState<any>(null);
  const [navPreviewSel, setNavPreviewSel] = useState<Record<string, boolean>>({});
  const [navDebug, setNavDebug] = useState<boolean>(false);
  const selectedCompanyId = Form.useWatch('company_id', formBasic);

  const contactOptionLabel = (p: any) => {
    const nameParts = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    const altNameParts = [p.last_name, p.first_name].filter(Boolean).join(' ').trim();
    return (
      p.full_name ||
      p.fullName ||
      nameParts ||
      altNameParts ||
      p.name ||
      p.email ||
      p.phone ||
      p.mobile ||
      p.company_name ||
      p.customer_name ||
      p.id
    );
  };

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [rfqRes, projRes, compRes, currRes] = await Promise.all([
        salesService.getQuoteRequest(Number(id)),
        manufacturingService.getProjects(),
        crmService.getCompanies(),
        manufacturingService.getCurrencies(),
      ]);
      setRfq(rfqRes);
      let allCompanies = (compRes as any).results ?? compRes;
      // Filter for customers locally or use what we got
      let filteredCompanies = (allCompanies as any[]).filter((c: any) => c.is_customer);
      // Ensure the currently assigned company is in the list
      if (rfqRes?.company?.id && !filteredCompanies.find((c: any) => c.id === rfqRes.company.id)) {
        filteredCompanies.push(rfqRes.company);
      }
      setCompanies(filteredCompanies);

      setCurrencyList(currRes as any);
      if (rfqRes?.company?.id) {
        try {
          const cl = await crmService.getContactsByCompany(rfqRes.company.id);
          const loadedContacts = ((cl as any).results ?? cl) || [];
          // Ensure assigned contacts are in the list
          if (rfqRes.contacts && rfqRes.contacts.length > 0) {
            rfqRes.contacts.forEach((rc: any) => {
              if (!loadedContacts.find((c: any) => c.id === rc.id)) {
                loadedContacts.push(rc);
              }
            });
          }
          setContacts(loadedContacts);
        } catch {}
      } else if (rfqRes?.contacts && rfqRes.contacts.length > 0) {
        // Ha nincs cég, de vannak kapcsolattartók, akkor magánszemélyek
        try {
          const cl = await crmService.getPrivateContacts();
          const loadedContacts = ((cl as any).results ?? cl) || [];
          rfqRes.contacts.forEach((rc: any) => {
            if (!loadedContacts.find((c: any) => c.id === rc.id)) {
              loadedContacts.push(rc);
            }
          });
          setContacts(loadedContacts);
        } catch {}
      } else {
        setContacts([]);
      }
      try {
        const computedDemandTitle = (!rfqRes.title && (rfqRes.items || []).length === 0)
          ? `Ajánlat ${rfqRes.number || rfqRes.request_number}`
          : rfqRes.title;
        const createdByName = rfqRes.created_by_name || rfqRes.requested_by_name || (user?.first_name && user?.last_name ? `${user.last_name} ${user.first_name}` : user?.username || '');
        formBasic.setFieldsValue({
          number: rfqRes.number || rfqRes.request_number,
          created_by_name: createdByName,
          issue_date: rfqRes.issue_date ? dayjs(rfqRes.issue_date) : null,
          deadline: rfqRes.deadline ? dayjs(rfqRes.deadline) : null,
          company_id: rfqRes.company?.id || (rfqRes.contacts && rfqRes.contacts.length > 0 ? 'private' : undefined),
          contact_ids: (rfqRes.contacts || []).map((c: any) => String(c.id)),
          title: computedDemandTitle,
          project_id: rfqRes.project?.id || rfqRes.project,
          description: rfqRes.description,
          internal_description: rfqRes.internal_description,
          currency_code: rfqRes.currency_code || 'HUF',
          partial_order_allowed: rfqRes.partial_order_allowed ?? true,
        });
      } catch {}
      try {
        const atts = await salesService.getQuoteRequestAttachments(Number(id));
        // map to UploadFile minimal
        setRfqFiles((atts || []).map((a: any) => ({ uid: String(a.id), name: a.file?.split('/').pop() || `#${a.id}`, status: 'done', url: a.file_url || a.file, response: a })));
      } catch {}
  setProjects(projRes);
    } catch (e) {
      // noop; errors surfaced via UI interactions
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

  // Frissítsd a kapcsolattartó listát, amikor cég választás változik - REMOVED to avoid overwriting on load
  // useEffect logic moved to Select onChange and initial load


  const isDemand = (rfq?: any) => {
    const itc = (rfq?.items || []).length;
    return itc === 0;
  };

  const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const postalCode = e.target.value;
    if (postalCode && postalCode.length === 4) {
      const cityData = postalCodeService.getCityByPostalCode(postalCode);
      if (cityData) {
        companyForm.setFieldsValue({ city: cityData });
      }
    }
  };

  const handleCountryChange = (value: string) => {
    setSelectedCountry(value);
    companyForm.setFieldsValue({
      postal_code: '',
      city: '',
      street_name: '',
      street_type: 'utca',
      house_number: '',
      address: ''
    });
  };

  const handleCompanySubmit = async (values: any) => {
    try {
      const newCompany = await crmService.createCompany(values);
      message.success('Cég sikeresen létrehozva!');
      setIsCompanyModalVisible(false);
      companyForm.resetFields();
      // Reload companies
      const compRes = await crmService.getCompanies();
      const companiesList = (compRes as any).results ?? compRes;
      setCompanies(companiesList);
      
      // Set the newly created company as selected
      formBasic.setFieldsValue({ company_id: newCompany.id });
      
      // Load contacts for the new company
      try {
        const cl = await crmService.getContactsByCompany(newCompany.id);
        setContacts((cl as any).results ?? cl);
        formBasic.setFieldValue('contact_ids', []);
      } catch {}
      
      // Update title if empty - use company name
      const currentTitle = formBasic.getFieldValue('title');
      if (!currentTitle || !currentTitle.trim()) {
        formBasic.setFieldValue('title', newCompany.name);
      }
    } catch (err) {
      console.error('Error saving company:', err);
      message.error('Hiba történt a cég mentése során');
    }
  };

  const statusTag = (status: string) => {
    const color: Record<string, any> = {
      new: 'blue',
      in_progress: 'orange',
      quoted: isDemand(rfq) ? 'default' : 'cyan',
      accepted: 'green',
      rejected: 'red',
      expired: 'default',
    };
    const text: Record<string, string> = {
      new: 'Új',
      in_progress: 'Folyamatban',
      quoted: isDemand(rfq) ? 'Zárt' : 'Árazva',
      accepted: 'Elfogadva',
      rejected: 'Elutasítva',
      expired: 'Lejárt',
    };
    return <Tag color={color[status] || 'default'}>{text[status] || status}</Tag>;
  };

  // removed unused itemColumns and old add-item helpers (using ItemSelectorModal instead)

  const onAddSelected = async (payload: SelectedItemPayload) => {
    if (!id) return;
    const qid = Number(id);
    let createdItem: any = null;
    if (payload.item_type === 'product') {
      // Send material_id instead of product_id for warehouse materials
      createdItem = await salesService.addRfqProductItem(
        qid, 
        payload.ref_id,  // This is used as product_id in the old system
        payload.quantity, 
        payload.description || '', 
        payload.unit, 
        payload.net_unit_price, 
        payload.vat_rate, 
        (payload as any).discount_percent, 
        (payload as any).discount_amount,
        payload.ref_id  // Send as material_id too
      );
    } else if (payload.item_type === 'manufacturing') {
      createdItem = await salesService.addRfqManufacturingItem(qid, payload.ref_id, payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount);
    } else {
      createdItem = await salesService.addRfqServiceItem(qid, payload.ref_id, payload.quantity, payload.description || '', payload.unit, payload.net_unit_price, payload.vat_rate, (payload as any).discount_percent, (payload as any).discount_amount);
    }
    // Upload any queued files
    if (createdItem?.id && payload.files?.length) {
      try {
        for (const f of payload.files) {
          const key = (f as any)?.uid || (f as any)?.name;
          const remark = (payload as any).fileRemarks ? (payload as any).fileRemarks[key] : undefined;
          await salesService.uploadQuoteRequestItemAttachment(createdItem.id, f as any, remark);
        }
      } catch (e) {
        message.error('Nem sikerült a csatolmányok egy részét feltölteni');
      }
    }
    message.success('Tétel hozzáadva');
    setSelectorOpen(false);
    load();
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
        patch.item_type = 'product';
        patch.product = payload.ref_id;
        patch.manufacturing_product = null;
        patch.service = null;
      } else if (payload.item_type === 'manufacturing') {
        patch.item_type = 'manufacturing';
        patch.manufacturing_product = payload.ref_id;
        patch.product = null;
        patch.service = null;
      } else if (payload.item_type === 'service') {
        patch.item_type = 'service';
        patch.service = payload.ref_id;
        patch.product = null;
        patch.manufacturing_product = null;
      }
      await salesService.updateQuoteRequestItem(editContext.item.id, patch);

      // Upload newly added files (if any)
      if (payload.files && payload.files.length) {
        for (const f of payload.files) {
          try {
            const key = (f as any)?.uid || (f as any)?.name;
            const remark = (payload as any).fileRemarks ? (payload as any).fileRemarks[key] : undefined;
            await salesService.uploadQuoteRequestItemAttachment(editContext.item.id, f as any, remark);
          } catch (e) {
            message.error('Nem sikerült feltölteni egy csatolmányt');
          }
        }
      }
      message.success('Tétel frissítve');
      setSelectorOpen(false);
      setEditContext(null);
      load();
    } catch (e) {
      message.error('Nem sikerült frissíteni a tételt');
    }
  };

  // assignProject removed; project is now part of the main edit form

  const openLogs = async () => {
    if (!id) return;
    const data = await salesService.getQuoteRequestLogs(Number(id));
    setLogs(data.results ?? data);
    setLogsOpen(true);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        {/* Keep form instance connected to avoid AntD warning */}
        <Form form={formBasic} style={{ display: 'none' }} />
        <Spin />
      </div>
    );
  }

  if (!rfq) return null;

  const isDemandOpen = isDemand(rfq) && (rfq.status === 'new' || rfq.status === 'in_progress');
  const isDemandClosed = isDemand(rfq) && rfq.status === 'quoted';

  return (
    <div>
      <Card title={<Space>
        <Button icon={<LeftOutlined />} onClick={() => navigate('/sales/rfqs')}>Vissza</Button>
        <span>{isDemand(rfq) ? 'Ajánlat' : 'Árajánlat'} {rfq.number || rfq.request_number}</span>
      </Space>} extra={<Space>
        <Button icon={<MessageOutlined />} onClick={() => setChatOpen(true)}>Chat</Button>
        <Button type="primary" onClick={async () => {
          try {
            const q = await salesService.createQuoteFromRfq(Number(id));
            message.success(`Ajánlat létrehozva: ${q.quote_number}`);
          } catch (e: any) {
            message.error(e?.response?.data?.error || 'Nem sikerült ajánlatot készíteni');
          }
        }}>Készíts ajánlatot</Button>
        <Button onClick={() => setSendOpen(true)}>Kiküldés</Button>
        <Button onClick={async () => {
          try {
            const res = await salesService.copyQuoteRequest(Number(id));
            message.success(`Másolat létrehozva: ${res.number}`);
            navigate(`/sales/rfqs/${res.id}`);
          } catch (e: any) {
            message.error(e?.response?.data?.error || 'Nem sikerült másolni');
          }
        }}>Másol</Button>
  <Button onClick={openLogs}>Napló</Button>
        {isDemandOpen && (
          <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'quoted'); message.success('Lezárva'); load(); }}>Lezár</Button>
        )}
        {isDemandClosed && (
          <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'in_progress'); message.success('Újranyitva'); load(); }}>Újra nyit</Button>
        )}
        {!isDemand(rfq) && (
          <>
            <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'accepted'); message.success('Elfogadva'); load(); }}>Elfogad</Button>
            <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'rejected'); message.success('Elutasítva'); load(); }}>Elutasít</Button>
            <Button onClick={async () => { await salesService.setQuoteRequestStatus(Number(id), 'expired'); message.success('Lejárt'); load(); }}>Lejártat</Button>
          </>
        )}
      </Space>}>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <Button icon={<DeleteOutlined />} danger onClick={async () => {
              try { await salesService.softDeleteQuoteRequest(Number(id)); message.success('Megjelölve töröltként'); navigate('/sales/demands'); }
              catch { message.error('Nem sikerült törölni'); }
            }}>Törlés</Button>
            {rfq?.assignee_names ? (<span style={{ color: '#888' }}><TeamOutlined /> {rfq.assignee_names}</span>) : null}
          </Space>
        </div>
        <Form layout="vertical" form={formBasic} onFinish={async (v) => {
          console.log('[RFQDetail] Form submitted with values:', v);
          try {
            // Company or 'private' required for new quote and demand on save
            const companyId = v.company_id ?? rfq.company?.id;
            if (!companyId && companyId !== 'private') {
              message.error('A Cég mező kötelező.');
              return;
            }
            const autoTitle = (!v.title || !String(v.title).trim())
              ? (isDemand(rfq) ? `Ajánlat ${rfq.number || rfq.request_number}` : (rfq.number || rfq.request_number))
              : String(v.title).trim();
            console.log('[RFQDetail] Sending update_basic with project_id:', v.project_id);
            
            const updateData: any = {
              title: autoTitle,
              description: v.description,
              internal_description: v.internal_description,
              issue_date: v.issue_date ? v.issue_date.format('YYYY-MM-DD') : undefined,
              deadline: v.deadline ? v.deadline.format('YYYY-MM-DD') : undefined,
              contact_ids: v.contact_ids || [],
              project_id: v.project_id,
              currency_code: v.currency_code,
              partial_order_allowed: v.partial_order_allowed,
            };
            
            // Set company_id: null for private, or the actual ID
            if (companyId === 'private') {
              updateData.company_id = null;
            } else if (companyId) {
              updateData.company_id = companyId;
            }
            
            await salesService.updateQuoteRequestBasic(Number(id), updateData);
            message.success('Mentve');
            load();
          } catch (err) {
            console.error('[RFQDetail] Save failed:', err);
            message.error('Mentés sikertelen');
          }
        }}>
          <Row gutter={12}>
            <Col span={24} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
               <Space>
                 <div style={{ marginRight: 16 }}>{statusTag(rfq.status)}</div>
                 <Button type="primary" htmlType="submit">Mentés</Button>
               </Space>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="Ajánlatszám" name="number">
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
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Row gutter={4}>
                <Col flex="auto">
                  <Form.Item label="Cég" name="company_id">
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Válassz céget"
                      onFocus={async () => {
                        // Frissítjük a cégek listáját amikor rákattintanak
                        const list = await crmService.getCompanies();
                        setCompanies((list as any).results ?? list);
                      }}
                      onChange={async (val) => {
                        try {
                          if (val === 'private') {
                            const list = await crmService.getPrivateContacts();
                            setContacts((list as any).results ?? list);
                            formBasic.setFieldValue('contact_ids', []);
                          } else {
                            const list = await crmService.getContactsByCompany(val);
                            setContacts((list as any).results ?? list);
                            formBasic.setFieldValue('contact_ids', []);
                          }
                        } catch {}
                      }}
                    >
                      <Select.Option key="private" value="private" label="Magánszemély">Magánszemély</Select.Option>
                      {(companies || []).map((c: any) => (
                        <Select.Option key={c.id} value={c.id} label={c.name}>{c.name}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col flex="40px">
                  <Form.Item label=" ">
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setSelectedCountry('Magyarország');
                        companyForm.resetFields();
                        companyForm.setFieldsValue({ 
                          country: 'Magyarország',
                          is_customer: true,
                          is_supplier: false
                        });
                        setIsCompanyModalVisible(true);
                      }}
                      title="Új cég"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
            <Col span={16}>
              <Row gutter={4}>
                <Col flex="auto">
                  <Form.Item label="Kapcsolattartók" name="contact_ids">
                    <Select 
                      mode="multiple" 
                      allowClear 
                      showSearch 
                      optionFilterProp="label" 
                      optionLabelProp="label"
                      placeholder="Válassz kapcsolattartókat"
                      options={(contacts || []).map((p: any, idx: number) => ({
                        value: String(p.id ?? idx),
                        label: contactOptionLabel(p),
                      }))}
                      onFocus={async () => {
                        // Frissítjük a kapcsolattartók listáját amikor rákattintanak
                        const companyId = formBasic.getFieldValue('company_id');
                        if (companyId === 'private') {
                          const list = await crmService.getPrivateContacts();
                          setContacts((list as any).results ?? list);
                        } else if (companyId) {
                          const list = await crmService.getContactsByCompany(companyId);
                          setContacts((list as any).results ?? list);
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col flex="40px">
                  <Form.Item label=" ">
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => {
                        const companyId = formBasic.getFieldValue('company_id');
                        let url = '/crm/contacts?action=create';
                        if (companyId && companyId !== 'private') {
                          url += `&company=${companyId}`;
                        }
                        window.open(url, '_blank');
                      }}
                      title="Új kapcsolattartó"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item label="Megnevezés" name="title">
                <Input placeholder="Ha üres, az ajánlatszám lesz" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item label="Projekt" name="project_id">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Válassz projektet">
                  {(projects || []).map((p: any) => (
                    <Select.Option key={p.id} value={p.id} label={p.name}>{p.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Leírás" name="description">
                <TextArea autoSize={{ minRows: 1, maxRows: 6 }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Belső leírás" name="internal_description">
                <TextArea autoSize={{ minRows: 1, maxRows: 6 }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={6}>
              <Form.Item label="Pénznem" name="currency_code">
                <Select showSearch optionFilterProp="label" placeholder="Válassz pénznemet">
                  {(currencyList || []).map((c: any) => (
                    <Select.Option key={c.id} value={c.code} label={`${c.code} – ${c.name}`}>
                      {c.code} – {c.name} {c.symbol ? `(${c.symbol})` : ''}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label=" " name="partial_order_allowed" valuePropName="checked">
                <Checkbox>Részlegesen megrendelhető</Checkbox>
              </Form.Item>
            </Col>
            <Col span={12} style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
            </Col>
          </Row>
        </Form>

        {/* Assignment controls under the save button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ color: '#555' }}>
            {rfq?.owner_name ? (<span><strong>Felelős:</strong> {rfq.owner_name} </span>) : (<span><strong>Felelős:</strong> - </span>)}
            
            <div style={{ display: 'inline-block', marginLeft: 12 }}>
                <strong>Résztvevők: </strong>
                {rfq?.assignee_details && rfq.assignee_details.length > 0 ? (
                    rfq.assignee_details.map((part: any) => (
                        <Tag 
                            key={part.id} 
                            closable 
                            onClose={async (e) => {
                                e.preventDefault();
                                try {
                                    await salesService.removeAssignee(Number(id), part.id);
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
                        closable 
                        color="warning"
                        onClose={async (e) => {
                                e.preventDefault();
                                try {
                                    await salesService.cancelInvitation(Number(id), i.id);
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
              try { await salesService.takeQuoteRequest(Number(id)); message.success('Hozzárendelve (ide vele)'); load(); }
              catch { message.error('Nem sikerült'); }
            }}>Ide vele</Button>
            {(() => {
              const assignees: number[] = (rfq?.assignees || []) as number[];
              const isMeAssigned = user?.id ? assignees.includes(user.id) : false;
              const onToggle = async () => {
                try {
                  if (isMeAssigned) {
                    await salesService.leaveQuoteRequest(Number(id));
                    message.success('Kiszálltál');
                  } else {
                    await salesService.joinQuoteRequest(Number(id));
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
              if (!inviteUserId) return;
              try { await salesService.inviteUserToRfq(Number(id), inviteUserId); message.success('Meghívó elküldve'); setInviteUserId(null); load(); }
              catch { message.error('Nem sikerült meghívni'); }
            }}>Meghívás</Button>
          </Space>
        </div>

        <Divider />

        <Row gutter={12}>
          <Col>
            <Space>
              <Button onClick={() => { setSelectorType('product'); setSelectorOpen(true); }}>Termék</Button>
              <Button onClick={() => { setSelectorType('manufacturing'); setSelectorOpen(true); }}>Egyedi Gyártás</Button>
              <Button onClick={() => { setSelectorType('service'); setSelectorOpen(true); }}>Szolgáltatás</Button>
            </Space>
          </Col>
        </Row>

        <Divider />

  <ItemsTable
    items={rfq.items || []}
    onRefresh={load}
    quoteRequestId={Number(id)}
    currency={rfq.currency_code || 'HUF'}
    onEditItem={(item) => {
      setEditContext({ item });
      setSelectorType(item.item_type);
      setSelectorOpen(true);
    }}
  />

  <RFQCostsTable 
    rfqId={Number(id)} 
    totalRevenue={(rfq?.items || []).reduce((sum: number, item: any) => sum + (Number(item.discounted_net_total || item.net_total) || 0), 0)}
    currency={rfq?.currency_code || 'HUF'}
  />

        <Divider />

        <Card size="small" title="Ajánlat csatolmányok">
          <div style={{ marginBottom: 8 }}>
            <Upload.Dragger
              multiple
              fileList={rfqFiles}
              beforeUpload={async (file) => {
                try {
                  const res = await salesService.uploadQuoteRequestAttachment(Number(id), file as any, rfqPendingRemark || undefined);
                  setRfqFiles((prev) => [...prev, { uid: String(res.id), name: file.name, status: 'done', url: res.file_url || res.file, response: res }]);
                  message.success(`${file.name} feltöltve`);
                } catch {
                  message.error(`${file.name} feltöltése nem sikerült`);
                }
                return Upload.LIST_IGNORE; // prevent auto upload by antd
              }}
              onRemove={undefined}
            >
              <p className="ant-upload-drag-icon">📎</p>
              <p className="ant-upload-text">Húzd ide a fájlokat vagy kattints a feltöltéshez</p>
            </Upload.Dragger>
            <div style={{ marginTop: 8 }}>
              <Input placeholder="Megjegyzés a következő feltöltéshez" value={rfqPendingRemark} onChange={(e) => setRfqPendingRemark(e.target.value)} />
            </div>
          </div>
          <List
            size="small"
            bordered
            dataSource={(rfqFiles || [])}
            locale={{ emptyText: 'Nincs csatolmány' }}
            renderItem={(f: UploadFile & { response?: any }) => (
              <List.Item>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <Button type="link" style={{ padding: 0 }} onClick={() => {
                      const url = f.url;
                      if (url) {
                        setFilePreviewUrl(url);
                        setFilePreviewTitle(f.name);
                        setFilePreviewOpen(true);
                      }
                    }}>{f.name}</Button>
                    <span style={{ color: '#888' }}>{f.response?.created_at ? new Date(f.response.created_at).toLocaleString('hu-HU') : ''}</span>
                  </Space>
                  <Space>
                    <Input
                      defaultValue={f.response?.remark || ''}
                      placeholder="Megjegyzés"
                      style={{ width: 260 }}
                      onBlur={async (e) => {
                        const val = e.target.value;
                        const att = f.response;
                        if (!att) return;
                        if ((att.remark || '') === val) return;
                        try {
                          await salesService.updateQuoteRequestAttachmentRemark(Number(id), att.id, val);
                          message.success('Megjegyzés mentve');
                        } catch {
                          message.error('Nem sikerült menteni a megjegyzést');
                        }
                      }}
                    />
                    <Popconfirm
                      title="Csatolmány törlése"
                      okText="Törlés"
                      cancelText="Mégse"
                      onConfirm={async () => {
                        const att = f.response;
                        if (!att) return;
                        try {
                          await salesService.deleteQuoteRequestAttachment(Number(id), att.id);
                          setRfqFiles((prev) => prev.filter((x) => x.uid !== f.uid));
                          message.success('Csatolmány törölve');
                        } catch {
                          message.error('Nem sikerült törölni');
                        }
                      }}
                    >
                      <Button danger size="small">Törlés</Button>
                    </Popconfirm>
                  </Space>
                </Space>
              </List.Item>
            )}
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
      <Modal title="Átveszem" open={takeoverConfirmOpen} onCancel={() => setTakeoverConfirmOpen(false)} onOk={async () => {
        try { await salesService.takeoverQuoteRequest(Number(id)); message.success('Átvetted'); setTakeoverConfirmOpen(false); load(); } catch { message.error('Nem sikerült átvenni'); }
      }}>
        Biztosan átveszed? Mindenki más lekerül a feladatról és csak te maradsz.
      </Modal>
      <Modal title="Ajánlat kiküldése e-mailen" open={sendOpen} onOk={async () => {
        const v = await sendForm.validateFields();
        try {
          await salesService.sendQuoteRequestEmail(Number(id), v);
          message.success('E-mail elküldve');
          setSendOpen(false);
        } catch {
          message.error('Nem sikerült elküldeni az e-mailt');
        }
      }} onCancel={() => setSendOpen(false)}>
        <Form layout="vertical" form={sendForm} initialValues={{ template_key: 'rfq_send' }}>
          <Form.Item label="Címzettek" name="to" rules={[{ required: true }]}>
            <Input placeholder="email1@example.com, email2@example.com" />
          </Form.Item>
          <Form.Item label="Másolat" name="cc">
            <Input placeholder="cc@example.com" />
          </Form.Item>
          <Form.Item label="Sablon kulcs" name="template_key">
            <Input placeholder="rfq_send" />
          </Form.Item>
          <Form.Item label="Aláírás kulcs" name="signature_key">
            <Input placeholder="default" />
          </Form.Item>
          <Form.Item label="Tárgy" name="subject">
            <Input placeholder="E-mail tárgya" onChange={async () => {
              const v = await sendForm.getFieldsValue();
              try { const p = await salesService.renderQuoteRequestEmail(Number(id), { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) }); setPreview(p); } catch {}
            }} />
          </Form.Item>
          <Form.Item label="Törzs" name="body">
            <Input.TextArea rows={8} placeholder="E-mail törzse" onChange={async () => {
              const v = await sendForm.getFieldsValue();
              try { const p = await salesService.renderQuoteRequestEmail(Number(id), { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) }); setPreview(p); } catch {}
            }} />
          </Form.Item>
          <Button onClick={async () => {
            const v = await sendForm.validateFields();
            try {
              const p = await salesService.renderQuoteRequestEmail(Number(id), { template_key: v.template_key, signature_key: v.signature_key, context: v.context, ...(v.subject ? { subject: v.subject } : {}), ...(v.body ? { body: v.body } : {}) });
              setPreview(p);
            } catch {
              message.error('Előnézet nem elérhető');
            }
          }}>Előnézet</Button>
          {rfq?.public_order_url && (
            <div style={{ padding: 8, background: '#fafafa', border: '1px solid #eee', borderRadius: 4 }}>
              Megrendelő link: <a href={rfq.public_order_url} target="_blank" rel="noreferrer">{rfq.public_order_url}</a>
            </div>
          )}
        </Form>
        {preview && (
          <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <div><strong>Tárgy:</strong> {preview.subject}</div>
            <div style={{ marginTop: 8 }}>
              {preview.is_html ? (
                <div dangerouslySetInnerHTML={{ __html: preview.body }} />
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap' }}>{preview.body}</pre>
              )}
            </div>
          </div>
        )}
      </Modal>
 
      <ItemSelectorModal
        open={selectorOpen}
        defaultType={selectorType}
        onCancel={() => { setSelectorOpen(false); setEditContext(null); }}
        onAdd={editContext ? async (p) => onEditSelected(p) : onAddSelected}
        mode={editContext ? 'edit' : 'add'}
        initialSelection={editContext ? { item_type: editContext.item.item_type, ref_id: (editContext.item.product || editContext.item.manufacturing_product || editContext.item.service) as number, name: (editContext.item.product_name || editContext.item.manufacturing_product_name || editContext.item.service_name) } : undefined}
        initialValues={editContext ? {
          quantity: Number(editContext.item.quantity),
          unit: editContext.item.unit,
          net_unit_price: Number(editContext.item.net_unit_price),
          vat_rate: Number(editContext.item.vat_rate),
          description: editContext.item.description,
          discount_percent: Number(editContext.item.discount_percent || 0),
          discount_amount: Number(editContext.item.discount_amount || 0),
        } : undefined}
      />

      <Modal title="Napló" open={logsOpen} onCancel={() => setLogsOpen(false)} footer={null}>
        <Table
          size="small"
          pagination={false}
          rowKey={(r) => `${r.id}`}
          columns={[
            { title: 'Dátum', dataIndex: 'created_at', render: (d: string) => new Date(d).toLocaleString('hu-HU') },
            { title: 'Felhasználó', dataIndex: 'user_name' },
            { title: 'Művelet', dataIndex: 'action' },
          ] as any}
          dataSource={logs}
        />
      </Modal>

      <Modal
        title="Új cég létrehozása"
        open={isCompanyModalVisible}
        onCancel={() => {
          setIsCompanyModalVisible(false);
          companyForm.resetFields();
        }}
        footer={null}
        width={800}
      >
        <Form
          form={companyForm}
          layout="vertical"
          onFinish={handleCompanySubmit}
        >
          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="name"
                label="Cégnév"
                rules={[{ required: true, message: 'Kérjük, adja meg a cégnév!' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Szerepkörök">
                <Space direction="vertical">
                  <Form.Item
                    name="is_customer"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox>Ügyfél</Checkbox>
                  </Form.Item>
                  <Form.Item
                    name="is_supplier"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox>Beszállító</Checkbox>
                  </Form.Item>
                </Space>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="tax_number"
                label="Adószám"
                help="Magyar adószám: 12345678-1-41"
              >
                <Space.Compact style={{ width: '100%' }}>
                  <Input placeholder="12345678-1-41" />
                  <Button
                    onClick={async () => {
                      try {
                        const raw = companyForm.getFieldValue('tax_number') || '';
                        const digits = String(raw).replace(/[^0-9]/g, '');
                        if (digits.length < 8) {
                          message.warning('Adja meg az adószám első 8 számjegyét!');
                          return;
                        }
                        const before = companyForm.getFieldsValue();
                        if (navDebug) {
                          console.log('[RFQDetail] NAV lookup start', { raw });
                        }
                        const data = await crmService.lookupCompanyByNav(raw, { debug: navDebug });
                        if (navDebug) {
                          console.log('[RFQDetail] NAV lookup result', data);
                        }
                        const debugInfo = (data as any)?.debug;
                        const downHost = debugInfo?.finance?.host;
                        if (downHost) {
                          message.error(`Nem elérhető az API host: ${downHost}`);
                        }
                        // NAV adószám azonnali frissítése, ha eltér és teljesebb
                        if ((data as any)?.tax_number) {
                          const curTax = String((before as any).tax_number || '').trim();
                          const newTax = String((data as any).tax_number || '').trim();
                          if (newTax && newTax !== curTax) {
                            companyForm.setFieldsValue({ tax_number: newTax });
                          }
                        }
                        if (data && data.found === false) {
                          const base = debugInfo?.finance?.host || debugInfo?.client?.base || debugInfo?.fallback?.url;
                          if (base) {
                            message.error(`Nem elérhető az API host: ${base}`);
                          } else {
                            message.warning('Nem található cég a megadott adószám alapján');
                          }
                          setNavPreviewData(debugInfo ? data : null);
                          setNavPreviewSel({});
                          if (debugInfo) setNavPreviewOpen(true);
                          return;
                        }
                        // Default selection: select fields that have a value and current form is empty
                        const fieldMap: { key: string; target: string }[] = [
                          { key: 'name', target: 'name' },
                          { key: 'tax_number', target: 'tax_number' },
                          { key: 'group_tax_number', target: 'group_tax_number' },
                          { key: 'eu_tax_number', target: 'eu_tax_number' },
                          { key: 'country', target: 'country' },
                          { key: 'postal_code', target: 'postal_code' },
                          { key: 'city', target: 'city' },
                          { key: 'street_name', target: 'street_name' },
                          { key: 'street_type', target: 'street_type' },
                          { key: 'house_number', target: 'house_number' },
                          { key: 'full_address', target: 'address' },
                        ];
                        const sel: Record<string, boolean> = {};
                        fieldMap.forEach(({ key, target }) => {
                          const v = (data as any)[key];
                          const cur = (before as any)[target];
                          sel[key] = Boolean(v) && (!cur || String(cur).trim() === '');
                        });
                        // Preferáld a NAV adószámot: ha a NAV érték formázott és eltér a jelenlegitől, előválaszd
                        if ((data as any).tax_number) {
                          const curTax = String((before as any).tax_number || '').trim();
                          const newTax = String((data as any).tax_number || '').trim();
                          const fullPattern = /^\d{8}-\d-\d{2}$/;
                          if (newTax && newTax !== curTax) {
                            sel['tax_number'] = true;
                          } else if (fullPattern.test(newTax) && !fullPattern.test(curTax)) {
                            sel['tax_number'] = true;
                          }
                        }
                        setNavPreviewData(data);
                        setNavPreviewSel(sel);
                        setNavPreviewOpen(true);
                      } catch (e: any) {
                        const status = e?.response?.status;
                        if (status === 404) {
                          message.warning('Nem található cég a megadott adószám alapján');
                        } else {
                          const msg = e?.response?.data?.error || 'NAV lekérdezés sikertelen';
                          message.error(msg);
                        }
                      }
                    }}
                  >
                    NAV-tól
                  </Button>
                </Space.Compact>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="group_tax_number"
                label="Csoport adószám"
                help="Csoport adószám: 12345678-1-12"
              >
                <Input placeholder="12345678-1-12" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="eu_tax_number"
                label="EU adószám"
                help="EU adószám: HU11956541"
              >
                <Input placeholder="HU11956541" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="country"
                label="Ország"
                rules={[{ required: true, message: 'Kérjük, válassza ki az országot!' }]}
              >
                <Select
                  showSearch
                  placeholder="Válasszon országot"
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                  onChange={handleCountryChange}
                >
                  {getCountries().map(country => (
                    <Select.Option key={country.value} value={country.value}>
                      {country.label}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {selectedCountry === 'Magyarország' ? (
            <>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="postal_code"
                    label="Irányítószám"
                    rules={[{ required: true, message: 'Kérjük, adja meg az irányítószámot!' }]}
                  >
                    <Input
                      placeholder="1051"
                      onChange={handlePostalCodeChange}
                    />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item
                    name="city"
                    label="Város"
                    rules={[{ required: true, message: 'Kérjük, adja meg a várost!' }]}
                  >
                    <Input placeholder="Budapest" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Közterület" style={{ marginBottom: 0 }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item
                    name="street_name"
                    noStyle
                    rules={[{ required: true, message: 'Közterület neve kötelező!' }]}
                  >
                    <Input
                      style={{ width: '70%' }}
                      placeholder="Közterület neve"
                    />
                  </Form.Item>
                  <Form.Item
                    name="street_type"
                    noStyle
                    rules={[{ required: true, message: 'Kérjük, válassza ki a közterület típusát!' }]}
                  >
                    <Select
                      style={{ width: '30%' }}
                      placeholder="Típus"
                      showSearch
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                      }
                    >
                      {postalCodeService.getStreetTypes().map(type => (
                        <Select.Option key={type.value} value={type.value}>
                          {type.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Space.Compact>
              </Form.Item>

              <Form.Item
                name="house_number"
                label="Házszám"
              >
                <Input placeholder="1." />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="address"
              label="Cím"
              rules={[{ required: true, message: 'Kérjük, adja meg a címet!' }]}
            >
              <TextArea
                rows={3}
                placeholder="Teljes cím (utca, házszám, város, irányítószám, ország)"
              />
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Mentés
              </Button>
              <Button onClick={() => {
                setIsCompanyModalVisible(false);
                companyForm.resetFields();
              }}>
                Mégse
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="NAV adatok előnézete"
        open={navPreviewOpen}
        onCancel={() => setNavPreviewOpen(false)}
        onOk={() => {
          if (navPreviewData) {
            const update: any = {};
            Object.keys(navPreviewSel).forEach(k => {
              if (navPreviewSel[k] && navPreviewData[k]) {
                const target = k === 'full_address' ? 'address' : k;
                update[target] = navPreviewData[k];
              }
            });
            companyForm.setFieldsValue(update);
            if (update.country) setSelectedCountry(update.country);
          }
          setNavPreviewOpen(false);
        }}
        okText="Kijelöltek átvétele"
        cancelText="Mégse"
        width={720}
      >
        {navPreviewData?.debug && (
          <Alert type="info" showIcon message="Debug" description={<pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(navPreviewData.debug, null, 2)}</pre>} style={{ marginBottom: 16 }} />
        )}
        {navPreviewData ? (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Checkbox
                  checked={!!navPreviewSel.name}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, name: e.target.checked })}
                >
                  Cégnév
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.name || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.tax_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, tax_number: e.target.checked })}
                >
                  Adószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.tax_number || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.group_tax_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, group_tax_number: e.target.checked })}
                >
                  Csoport adószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.group_tax_number || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.eu_tax_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, eu_tax_number: e.target.checked })}
                >
                  EU adószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.eu_tax_number || '-'}</div>
              </Col>
              <Col span={12}>
                <Checkbox
                  checked={!!navPreviewSel.country}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, country: e.target.checked })}
                >
                  Ország
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.country || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.postal_code}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, postal_code: e.target.checked })}
                >
                  Irányítószám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.postal_code || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.city}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, city: e.target.checked })}
                >
                  Város
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.city || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.street_name}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, street_name: e.target.checked })}
                >
                  Közterület neve
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.street_name || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.street_type}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, street_type: e.target.checked })}
                >
                  Közterület típusa
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.street_type || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.house_number}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, house_number: e.target.checked })}
                >
                  Házszám
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.house_number || '-'}</div>

                <Checkbox
                  checked={!!navPreviewSel.full_address}
                  onChange={e => setNavPreviewSel({ ...navPreviewSel, full_address: e.target.checked })}
                >
                  Teljes cím
                </Checkbox>
                <div style={{ color: '#555', marginBottom: 12 }}>{navPreviewData.full_address || '-'}</div>
              </Col>
            </Row>
          </div>
        ) : (
          <Alert type="warning" message="Nincs előnézeti adat" />
        )}
      </Modal>

      <ChatDrawer 
        open={chatOpen} 
        onClose={() => setChatOpen(false)} 
        rfqId={Number(id)} 
        title={`Chat - ${rfq.number || rfq.request_number}`}
      />
    </div>
  );
};

export default RFQDetail;
