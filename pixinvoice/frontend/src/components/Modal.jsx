import React from 'react';

export default function Modal({ isOpen, title, children, footer, onClose, width = 640 }) {
  if (!isOpen) return null;
  return (
    <div style={styles.backdrop}>
      <div style={{ ...styles.modal, width: `min(${width}px, 94vw)` }}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Bezárás">×</button>
        </div>
        <div style={styles.content}>{children}</div>
        <div style={styles.footer}>{footer}</div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    overflow: 'hidden',
    // Ne fusson ki a viewportból: a magassága fel van korlátozva, a fejléc és
    // a lábléc (gombok) fixek maradnak, csak a tartalom scrollozódik.
    maxHeight: 'calc(100vh - 48px)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    background: '#fafafa',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  content: {
    padding: 16,
    overflowY: 'auto',
    minHeight: 0,
    overscrollBehavior: 'contain',
  },
  footer: {
    padding: 12,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    borderTop: '1px solid #eee',
    background: '#fafafa',
    flexShrink: 0,
  },
  closeBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: 22,
    lineHeight: 1,
    cursor: 'pointer',
    color: '#666',
  },
};
