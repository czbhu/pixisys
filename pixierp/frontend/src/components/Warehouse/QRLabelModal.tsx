import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, InputNumber, Space, Typography, message } from 'antd';
import NumInput from '../NumInput';
import { DownloadOutlined } from '@ant-design/icons';
import { QRCodeCanvas } from 'qrcode.react';
import jsPDF from 'jspdf';

interface QRLabelModalProps {
    visible: boolean;
    onClose: () => void;
    data: {
        qrValue: string; // The content of the QR code (URL)
        displayCode: string; // The human readable code to print
        title: string;
        subtitle?: string;
    } | null;
    zIndex?: number;
}

const QRLabelModal: React.FC<QRLabelModalProps> = ({ visible, onClose, data, zIndex }) => {
    const [width, setWidth] = useState<number>(5);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const savedWidth = localStorage.getItem('qr_label_width');
        if (savedWidth) {
            setWidth(parseFloat(savedWidth));
        }
    }, []);

    const handleWidthChange = (value: number | null) => {
        if (value) {
            setWidth(value);
            localStorage.setItem('qr_label_width', value.toString());
        }
    };

    const handleDownload = () => {
        if (!data) return;

        try {
            // Label dimensions in mm (width comes from user input in cm, so * 10)
            const labelWidthMm = width * 10;
            // Estimate height: QR (square) + Title + Subtitle. 
            // Let's say QR is 80% of width, plus margins.
            // A logical height might be roughly same as width or slightly more.
            // Let's calculate a reasonable height: 
            // 5mm margin top, QR = width-10mm, 5mm gap, Text ~15mm, 5mm margin bottom.
            const margin = 2; // mm
            const qrSize = labelWidthMm - (margin * 2);
            const textHeight = 15;
            const labelHeightMm = labelWidthMm + textHeight; 

            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [labelWidthMm, labelHeightMm]
            });

            // Get canvas data from high-res source
            const canvas = document.getElementById('qr-canvas-high-res') as HTMLCanvasElement || document.getElementById('qr-canvas-preview') as HTMLCanvasElement;
            if (canvas) {
                const imgData = canvas.toDataURL('image/png');
                doc.addImage(imgData, 'PNG', margin, margin, qrSize, qrSize);
            }

            // Add Text
            doc.setFontSize(14); // Adjust based on width?
            doc.setFont("helvetica", "bold");
            
            // Centered text
            const title = data.title;
            const splitTitle = doc.splitTextToSize(title, labelWidthMm - (margin * 2));
            doc.text(splitTitle, labelWidthMm / 2, margin + qrSize + 5, { align: 'center' });

            const titleDim = doc.getTextDimensions(splitTitle);
            let currentY = margin + qrSize + 5 + titleDim.h + 2;

            // Add Code
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(data.displayCode, labelWidthMm / 2, currentY, { align: 'center' });
            currentY += 5; // Spacing

            if (data.subtitle) {
                doc.setFontSize(8);
                doc.setFont("helvetica", "normal");
                const subtitle = data.subtitle;
                const splitSubtitle = doc.splitTextToSize(subtitle, labelWidthMm - (margin * 2));
                doc.text(splitSubtitle, labelWidthMm / 2, currentY, { align: 'center' });
            }
            
            doc.save(`${data.displayCode}_label.pdf`);
            message.success('PDF letöltve');
        } catch (error) {
            console.error(error);
            message.error('Hiba a PDF generálásakor');
        }
    };

    if (!data) return null;

    return (
        <Modal
            title="QR Kód Nyomtatása"
            open={visible}
            onCancel={onClose}
            zIndex={zIndex}
            footer={[
                <Button key="close" onClick={onClose}>
                    Bezárás
                </Button>,
                <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
                    PDF Letöltése
                </Button>
            ]}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ 
                    border: '1px solid #eee', 
                    padding: 16, 
                    borderRadius: 8, 
                    textAlign: 'center',
                    background: 'white'
                }}>
                    <QRCodeCanvas
                        id="qr-canvas-preview"
                        value={data.qrValue}
                        size={256}
                        level="H"
                        includeMargin={true}
                    />
                    {/* Hidden high-res canvas for PDF generation */}
                    <div style={{ display: 'none' }}>
                        <QRCodeCanvas
                            id="qr-canvas-high-res"
                            value={data.qrValue}
                            size={1024}
                            level="H"
                            includeMargin={true}
                        />
                    </div>
                    <Typography.Title level={4} style={{ marginTop: 16, marginBottom: 4 }}>
                        {data.title}
                    </Typography.Title>
                    <Typography.Text strong style={{ fontSize: '16px', display: 'block', marginBottom: 4 }}>
                        {data.displayCode}
                    </Typography.Text>
                    {data.subtitle && (
                        <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                            {data.subtitle}
                        </Typography.Text>
                    )}
                </div>

                <Space align="center">
                    <span>PDF Szélesség (cm):</span>
                    <NumInput
                        min={2}
                        max={21}
                        step={0.1}
                        value={width}
                        onChange={handleWidthChange}
                    />
                </Space>
            </div>
        </Modal>
    );
};

export default QRLabelModal;
