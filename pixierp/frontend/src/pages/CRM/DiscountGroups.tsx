import React, { useCallback, useEffect, useState } from 'react';
import { Button, Input, Modal, Form, Select, Switch, Table, Tag, Tooltip, Space, Popconfirm, message, InputNumber, Typography, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, CheckCircleOutlined, StopOutlined, SearchOutlined, PercentageOutlined, DollarOutlined } from '@ant-design/icons';
import api from '../../services/api';

const { Text } = Typography;
const { Option } = Select;

type DiscountRule = { id?: number; name: string; target_type: string; target_id?: number | null; target_name: string; discount_type: string; discount_value: number; stackable: boolean; };
type Member = { id: number; name: string };
type DiscountGroup = { id: number; name: string; is_active: boolean; created_by_name?: string; member_count: number; member_names: Member[]; rules: DiscountRule[]; created_at: string; };
type TargetOption = { id: number; name: string };
const TARGET_LABELS: Record<string, string> = { product: 'Termék', material: 'Alapanyag', service: 'Szolgáltatás', category: 'Kategória' };

const ResizableHeaderCell: React.FC<any> = ({ width, onResize, children, ...rest }) => {
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onResize) return;
    e.stopPropagation();
    const startX = e.clientX, startW = width || 100;
    const move = (ev: PointerEvent) => onResize(Math.max(60, startW + ev.clientX - startX));
    const up = (ev: PointerEvent) => { onResize(Math.max(60, startW + ev.clientX - startX)); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return (
    <th {...rest} style={{ ...rest.style, ...(width ? { width, minWidth: width } : {}), position: 'relative', overflow: 'visible' }}>
      {children}
      {onResize && <div onPointerDown={handlePointerDown} style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 10 }} />}
    </th>
  );
};

export default function DiscountGroups() {
  const [groups, setGroups] = useState<DiscountGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountGroup | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [memberOptions, setMemberOptions] = useState<Member[]>([]);
  const [targetOptions, setTargetOptions] = useState<TargetOption[]>([]);
  const [colW, setColW] = useState({ name: 280, author: 160, members: 110, rules: 110, actions: 170 });

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/crm/discount-groups/'); setGroups(res.data?.results ?? res.data ?? []); }
    catch { message.error('Betöltési hiba'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const searchMembers = async (q: string) => {
    if (q.length < 1) return;
    try { const res = await api.get('/crm/companies/', { params: { q, page_size: 30 } }); setMemberOptions((res.data?.results ?? res.data ?? []).map((c: any) => ({ id: c.id, name: c.name }))); } catch {}
  };
  const loadTargets = async (type: string, q = '') => {
    try {
      const ep: Record<string, string> = { product: '/manufacturing/product-templates/', material: '/warehouse/materials/', service: '/manufacturing/services/', category: '/printshop/template-categories/' };
      const res = await api.get(ep[type] || ep.product, { params: { search: q, page_size: 50 } });
      setTargetOptions((res.data?.results ?? res.data ?? []).map((x: any) => ({ id: x.id, name: x.name })));
    } catch {}
  };

  const openCreate = () => { setEditing(null); form.resetFields(); setMembers([]); setRules([]); setModalOpen(true); };
  const openEdit = (g: DiscountGroup) => { setEditing(g); form.setFieldsValue({ name: g.name, is_active: g.is_active }); setMembers(g.member_names ?? []); setRules(g.rules?.map(r => ({ ...r })) ?? []); setModalOpen(true); };

  const save = async () => {
    try {
      const vals = await form.validateFields();
      setSaving(true);
      let g: DiscountGroup;
      if (editing) g = (await api.patch(`/crm/discount-groups/\${editing.id}/`, { name: vals.name, is_active: vals.is_active ?? true })).data;
      else g = (await api.post('/crm/discount-groups/', { name: vals.name, is_active: vals.is_active ?? true })).data;
      await api.post(`/crm/discount-groups/\${g.id}/set-members/`, { member_ids: members.map(m => m.id) });
      await api.post(`/crm/discount-groups/\${g.id}/set-rules/`, { rules });
      message.success(editing ? 'Mentve' : 'Létrehozva'); setModalOpen(false); load();
    } catch (e: any) { if (e?.response?.data) message.error(JSON.stringify(e.response.data)); }
    finally { setSaving(false); }
  };

  const del = async (id: number) => { try { await api.delete(`/crm/discount-groups/\${id}/`); message.success('Törölve'); load(); } catch { message.error('Törlési hiba'); } };
  const dup = async (id: number) => { try { await api.post(`/crm/discount-groups/\${id}/duplicate/`); message.success('Másolva'); load(); } catch { message.error('Másolási hiba'); } };
  const tog = async (id: number) => { try { await api.post(`/crm/discount-groups/\${id}/toggle-active/`); load(); } catch { message.error('Hiba'); } };

  const addRule = () => setRules(r => [...r, { name: '', target_type: 'product', target_id: null, target_name: '', discount_type: 'percent', discount_value: 0, stackable: false }]);
  const upd = (i: number, f: string, v: any) => setRules(r => r.map((x, j) => j === i ? { ...x, [f]: v } : x));
  const rm = (i: number) => setRules(r => r.filter((_, j) => j !== i));

  const tooltipContent = (rules: DiscountRule[]) => !rules?.length ? '–' : (
    <table style={{ fontSize: 11 }}><thead><tr>{['Név','Mire','Kedvezmény','Halmozható'].map(h => <th key={h} style={{ padding:'2px 6px', borderBottom:'1px solid #555', textAlign:'left' }}>{h}</th>)}</tr></thead>
    <tbody>{rules.map((r, i) => <tr key={i}><td style={{padding:'2px 6px'}}>{r.name||'–'}</td><td style={{padding:'2px 6px'}}>{TARGET_LABELS[r.target_type]}{r.target_name?`: \${r.target_name}`:''}</td><td style={{padding:'2px 6px'}}>{r.discount_type==='percent'?`\${r.discount_value}%`:`\${Number(r.discount_value).toLocaleString('hu-HU')} Ft`}</td><td style={{padding:'2px 6px'}}>{r.stackable?'Igen':'Nem'}</td></tr>)}</tbody></table>
  );

  const mkR = (k: keyof typeof colW) => (w: number) => setColW(c => ({ ...c, [k]: w }));
  const hdr = (k: keyof typeof colW) => () => ({ width: colW[k], onResize: mkR(k) });

  const columns = [
    { title:'Név', dataIndex:'name', key:'name', width:colW.name, sorter:(a:DiscountGroup,b:DiscountGroup)=>a.name.localeCompare(b.name), onHeaderCell:hdr('name'),
      render:(n:string,r:DiscountGroup)=><Space><Tag color={r.is_active?'green':'default'} style={{fontSize:10}}>{r.is_active?'Aktív':'Inaktív'}</Tag><Text strong>{n}</Text></Space> },
    { title:'Létrehozta', dataIndex:'created_by_name', key:'author', width:colW.author, sorter:(a:DiscountGroup,b:DiscountGroup)=>(a.created_by_name||'').localeCompare(b.created_by_name||''), onHeaderCell:hdr('author') },
    { title:'Tagok', dataIndex:'member_count', key:'members', width:colW.members, sorter:(a:DiscountGroup,b:DiscountGroup)=>a.member_count-b.member_count, onHeaderCell:hdr('members'),
      render:(cnt:number,r:DiscountGroup)=><Tooltip title={r.member_names?.map(m=>m.name).join(', ')||'Nincs tag'}><Tag>{cnt} tag</Tag></Tooltip> },
    { title:'Kedvezmények', key:'rules', width:colW.rules, onHeaderCell:hdr('rules'),
      render:(_:any,r:DiscountGroup)=><Tooltip title={<div style={{maxWidth:520}}>{tooltipContent(r.rules)}</div>} color="#222"><Tag color="blue">{r.rules?.length??0} szabály</Tag></Tooltip> },
    { title:'Műveletek', key:'actions', width:colW.actions, fixed:'right' as const, onHeaderCell:hdr('actions'),
      render:(_:any,r:DiscountGroup)=>(
        <Space size={4}>
          <Tooltip title="Szerkesztés"><Button size="small" icon={<EditOutlined />} onClick={()=>openEdit(r)} /></Tooltip>
          <Tooltip title="Másolás"><Button size="small" icon={<CopyOutlined />} onClick={()=>dup(r.id)} /></Tooltip>
          <Tooltip title={r.is_active?'Inaktívvá tesz':'Aktívvá tesz'}><Button size="small" icon={r.is_active?<StopOutlined />:<CheckCircleOutlined />} style={{color:r.is_active?'#faad14':'#52c41a'}} onClick={()=>tog(r.id)} /></Tooltip>
          <Popconfirm title="Biztosan törli?" onConfirm={()=>del(r.id)} okText="Igen" cancelText="Mégsem"><Tooltip title="Törlés"><Button size="small" icon={<DeleteOutlined />} danger /></Tooltip></Popconfirm>
        </Space>
      ) },
  ];

  const filtered = search ? groups.filter(g=>g.name.toLowerCase().includes(search.toLowerCase())) : groups;

  return (
    <div style={{padding:24}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <Text style={{fontSize:20,fontWeight:700}}>Kedvezmény csoportok</Text>
        <Space>
          <Input prefix={<SearchOutlined />} placeholder="Keresés…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:220}} allowClear />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Új csoport</Button>
        </Space>
      </div>
      <Table rowKey="id" dataSource={filtered} columns={columns} loading={loading} size="small" scroll={{x:'max-content'}}
        components={{header:{cell:ResizableHeaderCell}}} pagination={{pageSize:50,showSizeChanger:true,showTotal:t=>`\${t} csoport`}} />

      <Modal open={modalOpen} title={editing?`Szerkesztés: \${editing.name}`:'Új kedvezmény csoport'}
        onCancel={()=>setModalOpen(false)} onOk={save} okText="Mentés" cancelText="Mégsem" confirmLoading={saving} width={860} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Név" rules={[{required:true,message:'Kötelező'}]}><Input placeholder="Kedvezmény csoport neve" /></Form.Item>
          <Form.Item name="is_active" label="Aktív" valuePropName="checked" initialValue={true}><Switch /></Form.Item>
        </Form>

        <Divider orientation="left" style={{marginTop:0}}>Tagok</Divider>
        <div style={{marginBottom:8}}>
          <Select showSearch style={{width:'100%'}} placeholder="Cég keresése és hozzáadás…" filterOption={false} onSearch={searchMembers} value={undefined}
            onSelect={(val: any, opt:any)=>{if(!members.find(m=>m.id===val))setMembers(m=>[...m,{id:val,name:opt.children}]);}}>
            {memberOptions.filter(o=>!members.find(m=>m.id===o.id)).map(o=><Option key={o.id} value={o.id}>{o.name}</Option>)}
          </Select>
        </div>
        {members.length>0
          ? <div style={{border:'1px solid #f0f0f0',borderRadius:6,padding:8,maxHeight:130,overflowY:'auto',marginBottom:8}}>{members.map(m=><Tag key={m.id} closable onClose={()=>setMembers(mm=>mm.filter(x=>x.id!==m.id))} style={{marginBottom:4}}>{m.name}</Tag>)}</div>
          : <Text type="secondary" style={{fontSize:12,display:'block',marginBottom:8}}>Nincs tag</Text>}

        <Divider orientation="left">Kedvezmény szabályok</Divider>
        <Button size="small" icon={<PlusOutlined />} onClick={addRule} style={{marginBottom:8}}>Sor hozzáadása</Button>
        {rules.length>0&&(
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'#fafafa'}}>
              {['Név','Mire','Elem','Kedvezmény','Halmozható',''].map((h,i)=><th key={i} style={{padding:'6px 8px',border:'1px solid #f0f0f0',fontWeight:600,textAlign:'left'}}>{h}</th>)}
            </tr></thead>
            <tbody>{rules.map((rule,i)=>(
              <tr key={i}>
                <td style={{padding:4,border:'1px solid #f0f0f0',width:130}}><Input size="small" value={rule.name} onChange={e=>upd(i,'name',e.target.value)} /></td>
                <td style={{padding:4,border:'1px solid #f0f0f0',width:108}}>
                  <Select size="small" style={{width:'100%'}} value={rule.target_type} onChange={v=>{upd(i,'target_type',v);upd(i,'target_id',null);upd(i,'target_name','');loadTargets(v);}}>
                    <Option value="product">Termék</Option><Option value="material">Alapanyag</Option><Option value="service">Szolgáltatás</Option><Option value="category">Kategória</Option>
                  </Select>
                </td>
                <td style={{padding:4,border:'1px solid #f0f0f0',minWidth:170}}>
                  <Select size="small" style={{width:'100%'}} showSearch filterOption={false} placeholder="Keresés…" value={rule.target_id??undefined}
                    onSearch={q=>loadTargets(rule.target_type,q)} onFocus={()=>loadTargets(rule.target_type)}
                    onChange={(val,opt:any)=>{upd(i,'target_id',val);upd(i,'target_name',opt?.children||'');}}
                    allowClear onClear={()=>{upd(i,'target_id',null);upd(i,'target_name','');}}>
                    {rule.target_id&&rule.target_name&&!targetOptions.find(o=>o.id===rule.target_id)&&<Option key={rule.target_id} value={rule.target_id}>{rule.target_name}</Option>}
                    {targetOptions.map(o=><Option key={o.id} value={o.id}>{o.name}</Option>)}
                  </Select>
                </td>
                <td style={{padding:4,border:'1px solid #f0f0f0',width:170}}>
                  <Space.Compact size="small" style={{width:'100%'}}>
                    <Select size="small" value={rule.discount_type} style={{width:50}} onChange={v=>upd(i,'discount_type',v)}>
                      <Option value="percent"><PercentageOutlined /></Option><Option value="fixed"><DollarOutlined /></Option>
                    </Select>
                    <InputNumber size="small" style={{flex:1}} min={0} value={rule.discount_value} addonAfter={rule.discount_type==='percent'?'%':'Ft'} onChange={v=>upd(i,'discount_value',v??0)} />
                  </Space.Compact>
                </td>
                <td style={{padding:4,border:'1px solid #f0f0f0',width:76,textAlign:'center'}}><Switch size="small" checked={rule.stackable} onChange={v=>upd(i,'stackable',v)} /></td>
                <td style={{padding:4,border:'1px solid #f0f0f0',width:34,textAlign:'center'}}><Button size="small" icon={<DeleteOutlined />} type="text" danger onClick={()=>rm(i)} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {rules.length===0&&<Text type="secondary" style={{fontSize:12}}>Nincs kedvezmény szabály</Text>}
      </Modal>
    </div>
  );
}
