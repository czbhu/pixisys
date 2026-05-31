import React, { useState, useCallback } from 'react';
import {
  Card,
  Checkbox,
  Button,
  Table,
  Steps,
  Upload,
  Alert,
  Space,
  Typography,
  Spin,
  Tag,
  Row,
  Col,
  Radio,
  message,
} from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import api from '../../../services/api';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

type DataType =
  | 'service_group'
  | 'service'
  | 'product_class'
  | 'product_template'
  | 'material_group'
  | 'material'
  | 'warehouse'
  | 'inventory'
  | 'employee';

const DATA_TYPES: { key: DataType; label: string }[] = [
  { key: 'service_group', label: 'Szolgáltatás csoportok' },
  { key: 'service', label: 'Szolgáltatások' },
  { key: 'product_class', label: 'Termékkategóriák' },
  { key: 'product_template', label: 'Termék sablonok' },
  { key: 'material_group', label: 'Alapanyag kategóriák' },
  { key: 'material', label: 'Alapanyagok' },
  { key: 'warehouse', label: 'Raktárak' },
  { key: 'inventory', label: 'Készlet' },
  { key: 'employee', label: 'Dolgozók' },
];

const LABEL_MAP: Record<string, string> = {
  service_group: 'Szolgáltatás csoport',
  service: 'Szolgáltatás',
  product_class: 'Termékkategória',
  product_template: 'Termék sablon',
  material_group: 'Alapanyag kategória',
  material: 'Alapanyag',
  warehouse: 'Raktár',
  inventory: 'Készlet',
  employee: 'Dolgozó',
};

type ConflictResolution = 'overwrite' | 'rename' | 'skip';

interface ConflictEntry { code: string; label: string; }
interface MissingRefEntry { ref_type: string; name: string; }

const ImportPage: React.FC = () => {
  const [step, setStep] = useState(0);
  const [fileData, setFileData] = useState<Record<string, any> | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<DataType[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [conflicts, setConflicts] = useState<Record<string, ConflictEntry[]>>({});
  const [missingRefs, setMissingRefs] = useState<Record<string, MissingRefEntry[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [resolutions, setResolutions] = useState<Record<string, Record<string, ConflictResolution>>>({});
  const [createMissing, setCreateMissing] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [importResults, setImportResults] = useState<Record<string, any> | null>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        setFileData(parsed);
        const available = DATA_TYPES.map(t => t.key).filter(k => Array.isArray(parsed[k])) as DataType[];
        setSelectedTypes(available);
        message.success(`Fájl betöltve: ${available.length} adattípus`);
      } catch {
        message.error('Érvénytelen JSON fájl!');
      }
    };
    reader.readAsText(file);
    return false;
  }, []);

  const draggerProps: UploadProps = {
    name: 'file',
    accept: '.json',
    multiple: false,
    beforeUpload: handleFile,
    showUploadList: false,
  };

  const handleAnalyze = async () => {
    if (!fileData) return;
    setAnalyzing(true);
    try {
      const { data } = await api.post('/data-import/analyze/', { data: fileData, types: selectedTypes });
      setConflicts(data.conflicts || {});
      setMissingRefs(data.missing_refs || {});
      setCounts(data.counts || {});
      const initRes: Record<string, Record<string, ConflictResolution>> = {};
      for (const [type, entries] of Object.entries(data.conflicts || {})) {
        initRes[type] = {};
        for (const entry of entries as ConflictEntry[]) {
          initRes[type][entry.code] = 'overwrite';
        }
      }
      setResolutions(initRes);
      setStep(2);
    } catch {
      message.error('Elemzés sikertelen.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExecute = async () => {
    if (!fileData) return;
    setExecuting(true);
    try {
      const owMap: Record<string, string[]> = {};
      for (const [type, codeMap] of Object.entries(resolutions)) {
        owMap[type] = Object.entries(codeMap).filter(([, res]) => res === 'overwrite').map(([code]) => code);
      }
      const { data } = await api.post('/data-import/execute/', {
        data: fileData,
        types: selectedTypes,
        overwrite: owMap,
        rename_suffix: '_import',
        create_missing_refs: createMissing,
      });
      setImportResults(data.results || {});
      setStep(3);
    } catch {
      message.error('Import sikertelen.');
    } finally {
      setExecuting(false);
    }
  };

  const setResolution = (type: string, code: string, res: ConflictResolution) => {
    setResolutions(prev => ({ ...prev, [type]: { ...(prev[type] || {}), [code]: res } }));
  };

  const setAllResolution = (type: string, res: ConflictResolution) => {
    const newMap: Record<string, ConflictResolution> = {};
    for (const e of (conflicts[type] || [])) newMap[e.code] = res;
    setResolutions(prev => ({ ...prev, [type]: newMap }));
  };

  const totalConflicts = Object.values(conflicts).reduce((s, arr) => s + arr.length, 0);
  const totalMissing = Object.values(missingRefs).reduce((s, arr) => s + arr.length, 0);

  const resetAll = () => {
    setStep(0); setFileData(null); setSelectedTypes([]);
    setConflicts({}); setMissingRefs({}); setCounts({});
    setResolutions({}); setImportResults(null);
  };

  return (
    <Card title={<Title level={4} style={{ margin: 0 }}>Import</Title>}>
      <Steps
        current={step}
        items={[
          { title: 'Fájl feltöltése' },
          { title: 'Típusok kiválasztása' },
          { title: 'Ütközések kezelése' },
          { title: 'Import' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {step === 0 && (
        <Card title="Import fájl kiválasztása" bordered={false}>
          <Dragger {...draggerProps} style={{ padding: 16 }}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Húzza ide a JSON export fájlt, vagy kattintson</p>
            <p className="ant-upload-hint">Csak PixiERP export fájl (.json) fogadható el.</p>
          </Dragger>
          {fileData && (
            <div style={{ marginTop: 16 }}>
              <Alert
                type="success"
                message={`Fájl betöltve — ${selectedTypes.length} adattípus található`}
                description={selectedTypes.map(t => DATA_TYPES.find(d => d.key === t)?.label).join(', ')}
              />
              <div style={{ textAlign: 'right', marginTop: 12 }}>
                <Button type="primary" onClick={() => setStep(1)}>Tovább</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 1 && (
        <Card title="Mely adattípusokat importálja?" bordered={false}>
          <Row gutter={[16, 12]}>
            {DATA_TYPES.filter(t => fileData && Array.isArray(fileData[t.key])).map(t => (
              <Col key={t.key} xs={24} sm={12} md={8}>
                <Checkbox
                  checked={selectedTypes.includes(t.key)}
                  onChange={e => {
                    const key = t.key;
                    setSelectedTypes(prev => e.target.checked ? [...prev, key] : prev.filter(x => x !== key));
                  }}
                >
                  {t.label} <Tag style={{ marginLeft: 4 }}>{(fileData?.[t.key] || []).length} db</Tag>
                </Checkbox>
              </Col>
            ))}
          </Row>
          {DATA_TYPES.every(t => !fileData || !Array.isArray(fileData[t.key])) && (
            <Alert type="warning" message="A fájl nem tartalmaz ismert adattípusokat." />
          )}
          <Space style={{ marginTop: 16 }}>
            <Button onClick={() => setStep(0)}>Vissza</Button>
            <Button type="primary" onClick={handleAnalyze} loading={analyzing} disabled={selectedTypes.length === 0}>
              Elemzés és ütközések keresése
            </Button>
          </Space>
        </Card>
      )}

      {step === 2 && (
        <div>
          {totalConflicts === 0 && totalMissing === 0 ? (
            <Alert type="success" message="Nincs ütközés!" description="Minden rekord importálható ütközés nélkül." style={{ marginBottom: 16 }} />
          ) : (
            <>
              <Card size="small" title="Összefoglaló" style={{ marginBottom: 12 }}>
                <Row gutter={[16, 8]}>
                  {selectedTypes.map(t => (
                    <Col key={t} xs={12} sm={8} md={6}>
                      <Space>
                        <Text strong>{LABEL_MAP[t] || t}:</Text>
                        <Tag color="blue">{counts[t] || 0} db</Tag>
                        {conflicts[t] && <Tag color="orange" icon={<WarningOutlined />}>{conflicts[t].length} ütközés</Tag>}
                      </Space>
                    </Col>
                  ))}
                </Row>
              </Card>

              {Object.entries(conflicts).map(([type, entries]) => (
                <Card
                  key={type}
                  size="small"
                  title={
                    <Space>
                      <WarningOutlined style={{ color: '#faad14' }} />
                      <span>{LABEL_MAP[type] || type} – {entries.length} ütközés</span>
                      <Button size="small" onClick={() => setAllResolution(type, 'overwrite')}>Összes felülírása</Button>
                      <Button size="small" onClick={() => setAllResolution(type, 'rename')}>Összes átnevezése</Button>
                      <Button size="small" onClick={() => setAllResolution(type, 'skip')}>Összes kihagyása</Button>
                    </Space>
                  }
                  style={{ marginBottom: 12 }}
                >
                  <Table
                    size="small"
                    dataSource={entries}
                    rowKey="code"
                    pagination={false}
                    columns={[
                      { title: 'Kód / Név', dataIndex: 'code', render: (code: string, row: ConflictEntry) => `${code} — ${row.label}` },
                      {
                        title: 'Megoldás',
                        key: 'resolution',
                        render: (_: any, row: ConflictEntry) => (
                          <Radio.Group
                            value={resolutions[type]?.[row.code] || 'overwrite'}
                            onChange={e => setResolution(type, row.code, e.target.value)}
                            size="small"
                          >
                            <Radio.Button value="overwrite">Felülírás</Radio.Button>
                            <Radio.Button value="rename">Átnevezés</Radio.Button>
                            <Radio.Button value="skip">Kihagyás</Radio.Button>
                          </Radio.Group>
                        ),
                      },
                    ]}
                  />
                </Card>
              ))}

              {totalMissing > 0 && (
                <Card size="small" title={<Space><WarningOutlined style={{ color: '#faad14' }} /><span>Hiányzó kapcsolódó adatok</span></Space>} style={{ marginBottom: 12 }}>
                  <Paragraph>Az alábbi hivatkozott rekordok nem léteznek az adatbázisban:</Paragraph>
                  {Object.entries(missingRefs).map(([type, entries]) => (
                    <div key={type} style={{ marginBottom: 8 }}>
                      <Text strong>{LABEL_MAP[type] || type}:</Text>
                      <ul style={{ margin: '4px 0 0 16px' }}>
                        {entries.map(e => <li key={`${e.ref_type}:${e.name}`}><Tag>{LABEL_MAP[e.ref_type] || e.ref_type}</Tag> {e.name}</li>)}
                      </ul>
                    </div>
                  ))}
                  <Checkbox checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} style={{ marginTop: 8 }}>
                    Hiányzó kapcsolódó adatok automatikus létrehozása
                  </Checkbox>
                </Card>
              )}
            </>
          )}
          <Space>
            <Button onClick={() => setStep(1)}>Vissza</Button>
            <Button type="primary" onClick={handleExecute} loading={executing}>Import végrehajtása</Button>
          </Space>
        </div>
      )}

      {step === 3 && (
        <Card bordered={false}>
          {executing ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin size="large" />
              <Paragraph style={{ marginTop: 16 }}>Import folyamatban...</Paragraph>
            </div>
          ) : importResults ? (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a' }} />
                <Title level={4} style={{ marginTop: 12 }}>Import befejezve!</Title>
              </div>
              <Table
                dataSource={Object.entries(importResults).map(([type, res]: [string, any]) => ({
                  key: type, type: LABEL_MAP[type] || type,
                  created: res.created ?? 0, updated: res.updated ?? 0, skipped: res.skipped ?? 0,
                }))}
                pagination={false}
                size="small"
                columns={[
                  { title: 'Adattípus', dataIndex: 'type' },
                  { title: 'Létrehozva', dataIndex: 'created', render: (v: number) => <Tag color="green">{v}</Tag> },
                  { title: 'Frissítve', dataIndex: 'updated', render: (v: number) => <Tag color="blue">{v}</Tag> },
                  { title: 'Kihagyva', dataIndex: 'skipped', render: (v: number) => <Tag color="default">{v}</Tag> },
                ]}
              />
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Button onClick={resetAll}>Új import</Button>
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </Card>
  );
};

export default ImportPage;
