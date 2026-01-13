import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { toast } from 'react-toastify';
import { getSelectedCompanyId } from '../utils/companySelection';
import { apiAccessAPI, apiClientAPI } from '../services/api';
import Modal from '../components/Modal';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 20px;
  max-width: 980px;
  margin: 0 auto;
`;

const Section = styled.section`
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
`;

const Row = styled.div`
  padding: 8px 0;
  border-bottom: 1px dashed #f0f0f0;
  &:last-child { border-bottom: none; }
`;

const Button = styled.button`
  padding: 8px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  transition: background 0.15s ease;
  &:hover { background: #f8f9fa; }
`;

const PrimaryButton = styled(Button)`
  background: #0d6efd;
  border-color: #0d6efd;
  color: #fff;
  &:hover { background: #0b5ed7; }
`;

const DangerButton = styled(Button)`
  color: #c0392b;
  border-color: #f5c2c7;
  background: #fff5f5;
  &:hover { background: #ffe3e3; }
`;

const Muted = styled.span`
  color: #6c757d;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef6ff;
  color: #0d6efd;
  border: 1px solid #cfe2ff;
  font-size: 12px;
`;

const ApiAccess = () => {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // API clients state
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientError, setClientError] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null); // { id, name }
  const [clientRules, setClientRules] = useState(null); // {scopes, company, blocks}
  const [clientSaving, setClientSaving] = useState(false);
  const [regenLoad, setRegenLoad] = useState({});
  const [lastCreatedClient, setLastCreatedClient] = useState(null); // {id,name,api_key}
  const [showCompanyRulesModal, setShowCompanyRulesModal] = useState(false);

  const companyId = getSelectedCompanyId();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await apiAccessAPI.get({ company_id: companyId });
        if (!active) return;
        setPayload(res.data);
      } catch (e) {
        setError('Betöltési hiba');
      } finally {
        setLoading(false);
      }
    }
    if (companyId) load();
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    let active = true;
    async function loadClients() {
      setClientsLoading(true);
      setClientError('');
      try {
        const res = await apiClientAPI.list({ company_id: companyId });
        if (!active) return;
        setClients(res.data?.results || []);
      } catch (e) {
        setClientError('API kapcsolatok betöltése sikertelen');
      } finally {
        setClientsLoading(false);
      }
    }
    if (companyId) loadClients();
    return () => { active = false; };
  }, [companyId]);

  const toggleCompanyAll = () => {
    setPayload((p) => {
      if (!p || !p.company) return p;
      return { ...p, company: { ...p.company, allAccess: !p.company.allAccess } };
    });
  };

  const toggleCompanyScope = (key) => {
    setPayload((p) => {
      if (!p || !p.company) return p;
      const has = (p.company.scopes || []).includes(key);
      const scopes = has ? (p.company.scopes || []).filter(s => s !== key) : [...(p.company.scopes || []), key];
      return { ...p, company: { ...p.company, scopes } };
    });
  };

  const toggleSeriesScope = (id, key) => {
    setPayload((p) => {
      if (!p) return p;
      const series = (p.series || []).map(s => s.id === id ? { ...s, scopes: (s.scopes || []).includes(key) ? (s.scopes || []).filter(x => x !== key) : [...(s.scopes || []), key] } : s);
      return { ...p, series };
    });
  };

  const saveCompanyRules = async () => {
    setSaving(true);
    setError('');
    try {
      const body = { company_id: companyId, company: payload?.company || { allAccess: false, scopes: [] }, series: payload?.series || [] };
      await apiAccessAPI.save(body);
      toast.success('Cégszintű API-hozzáférések mentve');
      setShowCompanyRulesModal(false);
    } catch (e) {
      setError('Mentési hiba');
    } finally {
      setSaving(false);
    }
  };

  const apiBaseUrl = (() => {
    try {
      const { protocol, hostname } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${protocol}//${hostname}:4001/api/`;
      }
      return `${window.location.origin}/api/`;
    } catch {
      return 'http://localhost:4001/api/';
    }
  })();

  const createClient = async () => {
    if (!newClientName.trim()) { toast.error('Add meg az API kapcsolat nevét'); return; }
    setCreatingClient(true);
    try {
      const res = await apiClientAPI.create({ company_id: companyId, name: newClientName.trim() });
      setNewClientName('');
      toast.success('API kapcsolat létrehozva');
      setLastCreatedClient(res.data);
      setShowCreateModal(false);
      // refresh list
      const list = await apiClientAPI.list({ company_id: companyId });
      setClients(list.data?.results || []);
      // open rules editor for new client
      await openEditClient({ id: res.data.id, name: res.data.name });
    } catch (e) {
      toast.error('API kapcsolat létrehozása sikertelen');
    } finally {
      setCreatingClient(false);
    }
  };

  const openEditClient = async (client) => {
    try {
      const res = await apiClientAPI.getRules(client.id);
      setEditingClient(client);
      setClientRules(res.data);
    } catch (e) {
      toast.error('Szabályok betöltése sikertelen');
    }
  };

  const saveClientRules = async () => {
    if (!editingClient || !clientRules) return;
    setClientSaving(true);
    try {
      await apiClientAPI.saveRules(editingClient.id, clientRules);
      toast.success('API kapcsolat szabályai mentve');
      setEditingClient(null);
      setClientRules(null);
      const list = await apiClientAPI.list({ company_id: companyId });
      setClients(list.data?.results || []);
    } catch (e) {
      toast.error('Mentés sikertelen');
    } finally {
      setClientSaving(false);
    }
  };

  const regenerateClientKey = async (client) => {
    setRegenLoad((m) => ({ ...m, [client.id]: true }));
    try {
      const res = await apiClientAPI.regenerateKey(client.id);
      toast.success('API-kulcs újragenerálva');
      setClients((list) => list.map(c => c.id === client.id ? { ...c, api_key: res.data.api_key } : c));
      if (lastCreatedClient && lastCreatedClient.id === client.id) {
        setLastCreatedClient({ ...lastCreatedClient, api_key: res.data.api_key });
      }
    } catch (e) {
      toast.error('Kulcs generálás sikertelen');
    } finally {
      setRegenLoad((m) => ({ ...m, [client.id]: false }));
    }
  };

  const toggleClientActive = async (client) => {
    try {
      const res = await apiClientAPI.toggleActive(client.id);
      setClients((list) => list.map(c => c.id === client.id ? { ...c, is_active: res.data.is_active } : c));
    } catch (e) {
      toast.error('Aktiválás/Deaktiválás sikertelen');
    }
  };

  const deleteClient = async (client) => {
    if (!window.confirm(`Biztosan törlöd az API kapcsolatot: ${client.name}?`)) return;
    try {
      await apiClientAPI.delete(client.id);
      setClients((list) => list.filter(c => c.id !== client.id));
      toast.success('API kapcsolat törölve');
    } catch (e) {
      toast.error('Törlés sikertelen');
    }
  };

  if (!companyId) return <Container>Válassz céget a bal oldali listából.</Container>;
  if (loading) return <Container>Betöltés...</Container>;
  if (error) return <Container>Hiba: {error}</Container>;
  if (!payload) return <Container>Nincs adat.</Container>;

  return (
    <Container>
      <h2>API hozzáférés</h2>

      <Section>
        <h3>API végpont</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', background: '#f8f9fa', border: '1px solid #eee', padding: '6px 10px', borderRadius: 6 }}>
            {apiBaseUrl}
          </span>
          <Button onClick={() => { navigator.clipboard.writeText(apiBaseUrl); toast.success('API URL másolva'); }}>Másolás</Button>
        </div>
      </Section>

      <Section>
        <h3>API kapcsolatok</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Muted>Hozz létre több API-kulcsot külön integrációkhoz.</Muted>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => setShowCompanyRulesModal(true)}>Cég- és számlatömb szabályok</Button>
            <PrimaryButton onClick={() => setShowCreateModal(true)}>Új kapcsolat</PrimaryButton>
          </div>
        </div>
        {clientsLoading ? (
          <div>Betöltés...</div>
        ) : clientError ? (
          <div>Hiba: {clientError}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderTopLeftRadius: 8 }}>Dátum</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>API kapcsolat neve</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Hozzáférési szint</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>API-kulcs</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Aktív</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderTopRightRadius: 8 }}>Műveletek</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '8px 12px' }}>{new Date(c.created_at).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <strong>{c.name}</strong>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <Badge>{c.access_level}</Badge>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f8f9fa', padding: '2px 6px', borderRadius: 4 }}>{c.api_key}</span>
                    <Button style={{ marginLeft: 8 }} onClick={() => { navigator.clipboard.writeText(c.api_key); toast.success('API-kulcs másolva'); }}>Másolás</Button>
                    <Button style={{ marginLeft: 8 }} disabled={!!regenLoad[c.id]} onClick={() => regenerateClientKey(c)}>{regenLoad[c.id] ? '...' : 'Új kulcs'}</Button>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <input type="checkbox" checked={!!c.is_active} onChange={() => toggleClientActive(c)} />
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <Button onClick={() => openEditClient(c)}>Szerkesztés</Button>
                    <DangerButton style={{ marginLeft: 8 }} onClick={() => deleteClient(c)}>Törlés</DangerButton>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan="6" style={{ padding: 16, color: '#7f8c8d' }}>Nincs még API kapcsolat.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Section>
      {/* Cég- és számlatömb szabályok modal */}
      <Modal
        isOpen={!!showCompanyRulesModal}
        title="Cég- és számlatömb szabályok"
        onClose={() => setShowCompanyRulesModal(false)}
        width={860}
        footer={(
          <>
            <Button onClick={() => setShowCompanyRulesModal(false)}>Mégse</Button>
            <PrimaryButton onClick={saveCompanyRules} disabled={saving}>{saving ? 'Mentés...' : 'Mentés'}</PrimaryButton>
          </>
        )}
      >
        <div>
          <h4 style={{ marginTop: 0 }}>Cég szint</h4>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!(payload?.company?.allAccess)} onChange={toggleCompanyAll} />
            All access (minden API engedélyezve)
          </label>
          <div style={{ opacity: payload?.company?.allAccess ? 0.5 : 1, pointerEvents: payload?.company?.allAccess ? 'none' : 'auto' }}>
            <p>API-k:</p>
            <Grid>
              {(payload?.scopes || []).map(s => (
                <label key={s.key} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                  <input type="checkbox" checked={(payload?.company?.scopes || []).includes(s.key)} onChange={() => toggleCompanyScope(s.key)} /> {s.label}
                </label>
              ))}
            </Grid>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <h4>Számlatömb szint (felülírások)</h4>
          {(payload?.series || []).length === 0 && <div>Nincs számlatömb.</div>}
          {(payload?.series || []).map(ser => (
            <Row key={ser.id}>
              <strong>{ser.name}</strong>
              <Grid style={{ marginTop: 8 }}>
                {(payload?.scopes || []).map(s => (
                  <label key={s.key} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                    <input type="checkbox" checked={(ser.scopes || []).includes(s.key)} onChange={() => toggleSeriesScope(ser.id, s.key)} /> {s.label}
                  </label>
                ))}
              </Grid>
            </Row>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={!!showCreateModal}
        title="Új API kapcsolat"
        onClose={() => setShowCreateModal(false)}
        width={560}
        footer={(
          <>
            <Button onClick={() => setShowCreateModal(false)}>Mégse</Button>
            <PrimaryButton onClick={createClient} disabled={creatingClient}>{creatingClient ? 'Létrehozás...' : 'Létrehozás'}</PrimaryButton>
          </>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12 }}>
          <label style={{ alignSelf: 'center' }}>Kapcsolat neve</label>
          <input
            type="text"
            placeholder="Pl. Webshop integráció"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            style={{ padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          />
        </div>
      </Modal>

      {editingClient && clientRules && (
        <Modal
          isOpen={true}
          title={`API szabályok – ${editingClient?.name || ''}`}
          onClose={() => { setEditingClient(null); setClientRules(null); }}
          width={820}
          footer={(
            <>
              <Button onClick={() => { setEditingClient(null); setClientRules(null); }}>Mégse</Button>
              <PrimaryButton onClick={saveClientRules} disabled={clientSaving}>{clientSaving ? 'Mentés...' : 'Mentés'}</PrimaryButton>
            </>
          )}
        >
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={!!(clientRules?.company?.allAccess)} onChange={() => setClientRules((r) => ({ ...r, company: { ...r.company, allAccess: !r.company.allAccess } }))} />
                All access (minden API engedélyezve)
              </label>
            </div>
            <div style={{ opacity: clientRules?.company?.allAccess ? 0.5 : 1, pointerEvents: clientRules?.company?.allAccess ? 'none' : 'auto' }}>
              <p>API-k:</p>
              <Grid>
                {(clientRules?.scopes || []).map(s => (
                  <label key={s.key} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                    <input type="checkbox" checked={(clientRules?.company?.scopes || []).includes(s.key)} onChange={() => setClientRules((r) => ({ ...r, company: { ...r.company, scopes: (r.company.scopes || []).includes(s.key) ? (r.company.scopes || []).filter(x => x !== s.key) : [ ...(r.company.scopes || []), s.key ] } }))} /> {s.label}
                  </label>
                ))}
              </Grid>
            </div>
            <div style={{ marginTop: 12 }}>
              <h4>Számlatömb felülírások</h4>
              {(payload?.series || []).map(ser => (
                <Row key={ser.id}>
                  <strong>{ser.name}</strong>
                  <Grid style={{ marginTop: 8 }}>
                    {(clientRules?.scopes || []).map(s => (
                      <label key={s.key} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                        <input
                          type="checkbox"
                          checked={(clientRules?.blocks?.[ser.id] || []).includes(s.key)}
                          onChange={() => setClientRules((r) => {
                            const cur = r.blocks?.[ser.id] || [];
                            const next = cur.includes(s.key) ? cur.filter(x => x !== s.key) : [...cur, s.key];
                            return { ...r, blocks: { ...(r.blocks || {}), [ser.id]: next } };
                          })}
                        /> {s.label}
                      </label>
                    ))}
                  </Grid>
                </Row>
              ))}
            </div>
        </Modal>
      )}

      {lastCreatedClient && (
        <Modal
          isOpen={true}
          title="API-kulcs létrehozva"
          onClose={() => setLastCreatedClient(null)}
          width={600}
          footer={(
            <>
              <PrimaryButton onClick={() => setLastCreatedClient(null)}>Kész</PrimaryButton>
            </>
          )}
        >
          <p style={{ marginTop: 0 }}>
            Név: <strong>{lastCreatedClient.name}</strong>
          </p>
          <div>
            <div style={{ fontSize: 12, color: '#7f8c8d', marginBottom: 6 }}>API-kulcs</div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, background: '#f8f9fa', padding: '4px 8px', borderRadius: 4, flex: 1, overflowX: 'auto' }}>{lastCreatedClient.api_key}</span>
              <Button style={{ marginLeft: 8 }} onClick={() => { navigator.clipboard.writeText(lastCreatedClient.api_key || ''); toast.success('API-kulcs másolva'); }}>Másolás</Button>
              <Button style={{ marginLeft: 8 }} disabled={!!regenLoad[lastCreatedClient.id]} onClick={() => regenerateClientKey(lastCreatedClient)}>{regenLoad[lastCreatedClient.id] ? '...' : 'Új kulcs'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </Container>
  );
};

export default ApiAccess;
