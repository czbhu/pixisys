import React from 'react';
import { Modal, Button } from 'antd';
import { openPdfPreview } from '../utils/pdfPreview';

const isPdfUrl = (url: string) => /\.pdf(\?|$)/i.test(url || '');
const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url || '');

interface Props {
  open: boolean;
  title: string;
  url: string | null;
  onClose: () => void;
}

const AttachmentPreviewModal: React.FC<Props> = ({ open, title, url, onClose }) => (
  <Modal
    title={title || 'Előnézet'}
    open={open}
    onCancel={onClose}
    footer={null}
    width={960}
    destroyOnClose
  >
    {url ? (
      isPdfUrl(url) ? (
        <div>
          <iframe title="preview" src={url} style={{ width: '100%', height: '70vh', border: 0 }} />
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <Button type="primary" onClick={() => openPdfPreview(url)}>
              Megnyitás Print Preview-ban
            </Button>
          </div>
        </div>
      ) : isImageUrl(url) ? (
        <img alt={title} src={url} style={{ maxWidth: '100%', maxHeight: '75vh', display: 'block', margin: '0 auto' }} />
      ) : (
        <div style={{ padding: '32px 0', textAlign: 'center' }}>
          <p style={{ marginBottom: 16 }}>Ez a fájltípus nem jeleníthető meg közvetlenül.</p>
          <Button type="primary" href={url} target="_blank" rel="noopener noreferrer">Megnyitás / Letöltés</Button>
        </div>
      )
    ) : (
      <div>Nincs előnézet</div>
    )}
  </Modal>
);

export default AttachmentPreviewModal;
