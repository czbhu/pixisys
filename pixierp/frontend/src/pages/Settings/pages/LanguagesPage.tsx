import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Button, Space, Typography, Tag, Switch, message, Table, Input,
  Alert, Divider, Tooltip, Popconfirm, Drawer, Select, Badge, Segmented,
  Spin, Form,
} from 'antd';
import {
  GlobalOutlined, SyncOutlined, DeleteOutlined, CheckCircleOutlined, ClockCircleOutlined,
  EditOutlined, SaveOutlined, CloseOutlined, TranslationOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from '../../../contexts/TranslationContext';
import { FLAG_EMOJIS, SUPPORTED_LANGS } from '../../../i18n';
import api from '../../../services/api';
import UnifiedQuickSearchHeader from '../../../components/Layout/UnifiedQuickSearchHeader';

const { Text, Paragraph } = Typography;

interface Entry {
  id: number | null;
  source: string;
  translation: string;
  status: 'translated' | 'missing';
  updated_at: string | null;
}

interface LangStats {
  lang: string;
  name: string;
  count: number;
}

// ── PO Editor Drawer ─────────────────────────────────────────────────────────

const PoEditor: React.FC<{ lang: string; onClose: () => void }> = ({ lang, onClose }) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'translated' | 'missing'>('all');
  const [search, setSearch] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [autoTranslating, setAutoTranslating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/i18n/entries/', { params: { lang } });
      setEntries(res.data);
    } catch {
      message.error('Betöltési hiba');
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  const saveEntry = async (source: string, translation: string) => {
    setSaving(source);
    try {
      const res = await api.put('/i18n/entry/', { source, target_lang: lang, translation });
      setEntries(prev => prev.map(e =>
        e.source === source ? { ...e, translation: res.data.translation, status: 'translated', id: res.data.id } : e
      ));
      setEditingKey(null);
      message.success('Mentve');
    } catch {
      message.error('Mentési hiba');
    } finally {
      setSaving(null);
    }
  };

  const deleteEntry = async (source: string) => {
    try {
      await api.delete('/i18n/entry/', { data: { source, target_lang: lang } });
      setEntries(prev => prev.map(e =>
        e.source === source ? { ...e, translation: '', status: 'missing', id: null } : e
      ));
      message.success('Törlve');
    } catch {
      message.error('Törlési hiba');
    }
  };

  const autoTranslateOne = async (source: string) => {
    setAutoTranslating(source);
    try {
      const res = await api.post('/i18n/translate/', { texts: [source], target: lang });
      const translated = res.data[source];
      if (translated) await saveEntry(source, translated);
    } catch {
      message.error('Fordítási hiba');
    } finally {
      setAutoTranslating(null);
    }
  };

  const autoTranslateMissing = async () => {
    const missing = entries.filter(e => e.status === 'missing').slice(0, 50);
    if (!missing.length) return;
    setLoading(true);
    try {
      const texts = missing.map(e => e.source);
      const res = await api.post('/i18n/translate/', { texts, target: lang });
      // Save all
      for (const [source, translation] of Object.entries(res.data as Record<string, string>)) {
        if (translation) {
          await api.put('/i18n/entry/', { source, target_lang: lang, translation });
        }
      }
      await load();
      message.success(`${Object.keys(res.data).length} szöveg lefordítva`);
    } catch {
      message.error('Fordítási hiba');
    } finally {
      setLoading(false);
    }
  };

  const visibleEntries = entries.filter(e => {
    if (filter === 'translated' && e.status !== 'translated') return false;
    if (filter === 'missing' && e.status !== 'missing') return false;
    if (search) {
      const q = search.toLowerCase();
      return e.source.toLowerCase().includes(q) || e.translation.toLowerCase().includes(q);
    }
    return true;
  });

  const translatedCount = entries.filter(e => e.status === 'translated').length;
  const missingCount = entries.filter(e => e.status === 'missing').length;

  const columns = [
    {
      title: 'Eredeti (Magyar)',
      dataIndex: 'source',
      key: 'source',
      width: '40%',
      render: (src: string, row: Entry) => (
        <div>
          <Text style={{ fontSize: 13 }}>{src}</Text>
          {row.status === 'missing' && (
            <Tag color="orange" style={{ marginLeft: 8, fontSize: 10 }}>Hiányzó</Tag>
          )}
        </div>
      ),
    },
    {
      title: `Fordítás (${SUPPORTED_LANGS[lang] || lang})`,
      key: 'translation',
      width: '45%',
      render: (_: any, row: Entry) => {
        const isEditing = editingKey === row.source;
        if (isEditing) {
          return (
            <Space.Compact style={{ width: '100%' }}>
              <Input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onPressEnter={() => saveEntry(row.source, editValue)}
                placeholder="Fordítás megadása…"
                size="small"
              />
              <Button
                size="small" type="primary" icon={<SaveOutlined />}
                loading={saving === row.source}
                onClick={() => saveEntry(row.source, editValue)}
              />
              <Button size="small" icon={<CloseOutlined />} onClick={() => setEditingKey(null)} />
            </Space.Compact>
          );
        }
        return (
          <Text
            style={{ cursor: 'pointer', color: row.status === 'missing' ? '#d9d9d9' : undefined }}
            onClick={() => { setEditingKey(row.source); setEditValue(row.translation); }}
          >
            {row.translation || <span style={{ color: '#bbb', fontStyle: 'italic' }}>— kattints a szerkesztéshez —</span>}
          </Text>
        );
      },
    },
    {
      title: 'Műveletek',
      key: 'actions',
      width: '15%',
      render: (_: any, row: Entry) => (
        <Space size={4}>
          <Tooltip title="Szerkesztés">
            <Button
              size="small" icon={<EditOutlined />}
              onClick={() => { setEditingKey(row.source); setEditValue(row.translation); }}
            />
          </Tooltip>
          <Tooltip title="Auto-fordítás">
            <Button
              size="small" icon={<SyncOutlined spin={autoTranslating === row.source} />}
              loading={autoTranslating === row.source}
              onClick={() => autoTranslateOne(row.source)}
            />
          </Tooltip>
          {row.status === 'translated' && (
            <Tooltip title="Törlés">
              <Popconfirm title="Törli ezt a fordítást?" onConfirm={() => deleteEntry(row.source)} okText="Törlés" cancelText="Mégse">
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Drawer
      title={
        <Space>
          <span style={{ fontSize: 20 }}>{FLAG_EMOJIS[lang] || '🌐'}</span>
          <Text strong>{SUPPORTED_LANGS[lang]} — PO szerkesztő</Text>
          <Badge count={translatedCount} color="green" showZero />
          <Text type="secondary" style={{ fontSize: 12 }}>lefordítva</Text>
          <Badge count={missingCount} color="orange" showZero />
          <Text type="secondary" style={{ fontSize: 12 }}>hiányzó</Text>
        </Space>
      }
      open
      onClose={onClose}
      width="80vw"
      styles={{ body: { padding: '12px 16px' } }}
      extra={
        <Space>
          <Button
            icon={<SyncOutlined />}
            onClick={autoTranslateMissing}
            loading={loading}
            disabled={missingCount === 0}
          >
            Hiányzók auto-fordítása ({missingCount})
          </Button>
          <Button icon={<SyncOutlined />} onClick={load}>Frissítés</Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
        <Segmented
          value={filter}
          onChange={v => setFilter(v as any)}
          options={[
            { label: `Összes (${entries.length})`, value: 'all' },
            { label: `Lefordított (${translatedCount})`, value: 'translated' },
            { label: `Hiányzó (${missingCount})`, value: 'missing' },
          ]}
        />
        <Input
          prefix={<SearchOutlined />}
          placeholder="Keresés…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ width: 260 }}
        />
      </Space>

      <Table
        dataSource={visibleEntries}
        columns={columns}
        rowKey="source"
        loading={loading}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `${t} bejegyzés` }}
        rowClassName={row => row.status === 'missing' ? 'ant-table-row-level-1' : ''}
        scroll={{ y: 'calc(100vh - 260px)' }}
      />
    </Drawer>
  );
};

// ── Main Languages Page ───────────────────────────────────────────────────────

const LanguagesPage: React.FC = () => {
  const { lang, setLang, clearCache } = useTranslation();
  const [stats, setStats] = useState<LangStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState<string | null>(null);
  const [poEditorLang, setPoEditorLang] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    try {
      const langs = Object.keys(SUPPORTED_LANGS).filter(l => l !== 'hu');
      const counts = await Promise.all(
        langs.map(l => api.get('/i18n/translations/', { params: { lang: l } })
          .then(r => ({ lang: l, count: Object.keys(r.data).length }))
          .catch(() => ({ lang: l, count: 0 }))
        )
      );
      setStats(counts.map(c => ({ ...c, name: SUPPORTED_LANGS[c.lang] || c.lang })));
    } catch {
      message.error('Nem sikerült betölteni a fordítási statisztikákat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const preTranslate = async (targetLang: string) => {
    setTranslating(targetLang);
    try {
      const sampleTexts = [
        'Beállítások', 'Mentés', 'Mégse', 'Törlés', 'Szerkesztés', 'Keresés',
        'Igen', 'Nem', 'Bezárás', 'Megnyitás', 'Hozzáadás', 'Eltávolítás',
        'Létrehozás', 'Frissítés', 'Importálás', 'Exportálás', 'Visszavonás',
        'Hátra', 'Következő', 'Előző', 'Összes', 'Nincs találat',
        'Betöltés', 'Hiba', 'Figyelmeztetés', 'Sikeres', 'Folyamatban',
        'Dátum', 'Összeg', 'Mennyiség', 'Státusz', 'Megjegyzés', 'Leírás',
        'Név', 'Cím', 'Telefon', 'E-mail', 'Jelszó', 'Felhasználónév',
        'Bejelentkezés', 'Kijelentkezés', 'Regisztráció', 'Profil',
        'Irányítópult', 'Értékesítés', 'Gyártás', 'Pénzügy', 'Raktár',
        'HR', 'CRM', 'Megrendelések', 'Árajánlatok', 'Számlák',
        'Termékek', 'Ügyfelek', 'Kapcsolatok', 'Munkatársak',
        'Aktív', 'Inaktív', 'Nyitott', 'Lezárt', 'Függőben',
        'Új', 'Módosított', 'Törölt', 'Mentve', 'Kötelező mező',
        'Érvénytelen', 'Feltöltés', 'Letöltés', 'Nyomtatás',
        'Műveletek', 'Szerkesztő', 'Részletek', 'Összesítő', 'Kijelölt',
      ];
      const res = await api.post('/i18n/translate/', { texts: sampleTexts, target: targetLang });
      message.success(`${Object.keys(res.data).length} szöveg lefordítva (${SUPPORTED_LANGS[targetLang]})`);
      await loadStats();
      clearCache();
    } catch {
      message.error('Fordítási hiba.');
    } finally {
      setTranslating(null);
    }
  };

  const clearLangCache = async (targetLang: string) => {
    try {
      await api.delete('/i18n/entry/', { data: { source: '__all__', target_lang: targetLang } });
    } catch {}
    clearCache();
    message.info('Helyi cache törölve.');
    await loadStats();
  };

  const columns = [
    {
      title: 'Nyelv',
      key: 'lang',
      render: (_: any, row: LangStats) => (
        <Space>
          <span style={{ fontSize: 20 }}>{FLAG_EMOJIS[row.lang] || '🌐'}</span>
          <div>
            <Text strong>{row.name}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>{row.lang}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Lefordított szövegek',
      key: 'count',
      render: (_: any, row: LangStats) => (
        <Tooltip title="Kattints a PO szerkesztő megnyitásához">
          <Badge
            count={row.count}
            showZero
            color={row.count > 0 ? 'green' : 'default'}
            style={{ cursor: 'pointer' }}
            onClick={() => setPoEditorLang(row.lang)}
          >
            <Button
              size="small"
              icon={row.count > 0 ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
              onClick={() => setPoEditorLang(row.lang)}
              style={{ minWidth: 120 }}
            >
              {row.count} szöveg &nbsp;
              <EditOutlined style={{ fontSize: 10, opacity: 0.6 }} />
            </Button>
          </Badge>
        </Tooltip>
      ),
    },
    {
      title: 'Aktív',
      key: 'active',
      render: (_: any, row: LangStats) => (
        <Switch
          checked={lang === row.lang}
          onChange={checked => checked && setLang(row.lang)}
          checkedChildren={FLAG_EMOJIS[row.lang]}
          unCheckedChildren="–"
        />
      ),
    },
    {
      title: 'Műveletek',
      key: 'actions',
      render: (_: any, row: LangStats) => (
        <Space>
          <Tooltip title="PO szerkesztő — fordítások kézi szerkesztése">
            <Button size="small" icon={<TranslationOutlined />} onClick={() => setPoEditorLang(row.lang)}>
              Szerkesztő
            </Button>
          </Tooltip>
          <Tooltip title="Alapszótár előzetes lefordítása (70 leggyakoribb kifejezés)">
            <Button
              size="small"
              icon={<SyncOutlined spin={translating === row.lang} />}
              loading={translating === row.lang}
              onClick={() => preTranslate(row.lang)}
            >
              Előfordítás
            </Button>
          </Tooltip>
          <Tooltip title="Fordítási cache törlése">
            <Popconfirm title="Törli a tárolt fordításokat?" onConfirm={() => clearLangCache(row.lang)} okText="Törlés" cancelText="Mégse">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 24px' }}>
      <UnifiedQuickSearchHeader
        title="Nyelvek és fordítások"
        searchValue=""
        onSearchChange={() => {}}
        actions={
          <Space>
            <Button icon={<GlobalOutlined />} onClick={() => setLang('hu')}>
              Alapértelmezett (Magyar)
            </Button>
            <Button icon={<SyncOutlined />} onClick={loadStats} loading={loading}>
              Frissítés
            </Button>
          </Space>
        }
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Automatikus fordítás"
        description={
          <span>
            A rendszer automatikusan fordítja a szövegeket a <strong>MyMemory</strong> ingyenes API segítségével.
            Kattints a <strong>szövegszámlálóra</strong> vagy a <strong>Szerkesztő</strong> gombra a PO szerkesztő megnyitásához, ahol manuálisan javíthatod vagy kiegészítheted a fordításokat — mint a WordPress PO szerkesztőjénél.
          </span>
        }
      />

      <Card title="Aktív felületi nyelv" style={{ marginBottom: 16 }}>
        <Space size={16} wrap>
          {Object.entries(SUPPORTED_LANGS).map(([code, name]) => (
            <Button
              key={code}
              type={lang === code ? 'primary' : 'default'}
              onClick={() => setLang(code)}
              style={{ height: 48, fontSize: 16, minWidth: 110 }}
            >
              {FLAG_EMOJIS[code] || '🌐'} {name}
            </Button>
          ))}
        </Space>
      </Card>

      <Card title="Fordítási adatbázis — kattints a szövegszámlálóra a szerkesztéshez">
        <Table
          dataSource={stats}
          columns={columns}
          rowKey="lang"
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      {poEditorLang && (
        <PoEditor
          lang={poEditorLang}
          onClose={() => { setPoEditorLang(null); loadStats(); clearCache(); }}
        />
      )}
    </div>
  );
};

export default LanguagesPage;
