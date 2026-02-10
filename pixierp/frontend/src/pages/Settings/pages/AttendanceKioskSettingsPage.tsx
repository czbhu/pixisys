import React, { useEffect, useState } from 'react';
import { Card, Form, InputNumber, Button, Upload, Typography, message, Select } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { settingsService } from '../../../services/settingsService';
import AttendanceKiosk from '../AttendanceKiosk'; 

const { Text } = Typography;
const { Option } = Select;

const AttendanceKioskSettingsPage: React.FC = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [restartLoading, setRestartLoading] = useState(false);
    const [config, setConfig] = useState<any>(null);
    const [fileList, setFileList] = useState<any[]>([]);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await settingsService.getAttendanceKioskConfig();
            setConfig(data);
            form.setFieldsValue({
                qr_validity_seconds: data.qr_validity_seconds,
                kiosk_mode: data.kiosk_mode
            });
            if (data.kiosk_logo) {
                setFileList([{
                    uid: '-1',
                    name: 'logo',
                    status: 'done',
                    url: data.kiosk_logo
                }]);
            }
        } catch (error) {
            message.error('Hiba a beállítások betöltésekor');
        } finally {
            setLoading(false);
        }
    };

    const handleRestart = async () => {
        setRestartLoading(true);
        try {
            await settingsService.restartKiosks();
            message.success('Újraindítási parancs elküldve minden Kioszknak');
        } catch (error) {
            message.error('Hiba az újraindítás parancs küldésekor');
        } finally {
            setRestartLoading(false);
        }
    };

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('qr_validity_seconds', values.qr_validity_seconds);
            formData.append('kiosk_mode', values.kiosk_mode);
            
            if (fileList.length > 0 && fileList[0].originFileObj) {
                formData.append('kiosk_logo', fileList[0].originFileObj);
            } 

            if (config && config.id) {
                await settingsService.updateAttendanceKioskConfig(config.id, formData);
                message.success('Beállítások mentve');
                loadConfig();
            }
        } catch (error) {
            message.error('Hiba a mentés során');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card title="Jelenlét Kioszk Beállítások">
            <Form 
                form={form} 
                layout="vertical" 
                onFinish={onFinish}
                style={{ maxWidth: 600 }}
            >
                <Form.Item 
                    label="Működési mód" 
                    name="kiosk_mode"
                    initialValue="phone_qr"
                >
                    <Select>
                        <Select.Option value="phone_qr">A opció: QR a telefonon (Kioszk olvas)</Select.Option>
                        <Select.Option value="kiosk_qr">B opció: QR a Kioszkon (Telefon olvas)</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item 
                    label="QR kód érvényességi ideje (másodperc)" 
                    name="qr_validity_seconds"
                    rules={[{ required: true, message: 'Kötelező mező' }]}
                >
                    <InputNumber min={5} max={60} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item label="Kioszk Logó">
                     <Upload
                        listType="picture-card"
                        fileList={fileList}
                        onChange={({ fileList }) => setFileList(fileList)}
                        beforeUpload={() => false} // Don't upload immediately
                        maxCount={1}
                        onPreview={async (file) => {
                            let src = file.url as string;
                            if (!src) {
                                src = await new Promise((resolve) => {
                                    const reader = new FileReader();
                                    reader.readAsDataURL(file.originFileObj as File);
                                    reader.onload = () => resolve(reader.result as string);
                                });
                            }
                            const imgWindow = window.open(src);
                            imgWindow?.document.write(`<img src="${src}" />`);
                        }}
                     >
                        {fileList.length < 1 && (
                            <div>
                                <UploadOutlined />
                                <div style={{ marginTop: 8 }}>Feltöltés</div>
                            </div>
                        )}
                    </Upload>
                    <Text type="secondary" style={{ fontSize: 12 }}>Javasolt méret: 300x100px. Ha nincs feltöltve, az alapértelmezett PixiSys felirat jelenik meg.</Text>
                </Form.Item>

                <Form.Item>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <Button type="primary" htmlType="submit" loading={loading}>
                            Mentés
                        </Button>
                        <Button 
                            danger // Red color to verify caution, or maybe default? Danger implies destructive. Reloading is annoying but not destructive.
                            // Let's use 'default' but with specific text. Or 'dashed'.
                            // User asked specifically so make it visible.
                            onClick={handleRestart} 
                            loading={restartLoading}
                        >
                            Kioszkoldalak Távoli Frissítése (Reload)
                        </Button>
                    </div>
                </Form.Item>
            </Form>
            
            <div style={{ marginTop: 24 }}>
                <AttendanceKiosk />
            </div>
        </Card>
    );
};

export default AttendanceKioskSettingsPage;
