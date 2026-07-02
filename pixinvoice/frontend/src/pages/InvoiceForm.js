import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Calculator,
  FileText,
  Upload,
  HelpCircle,
  X,
  Clock3,
  BookmarkPlus,
  Archive,
  Download,
  Table2
} from 'lucide-react';
import styled from 'styled-components';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import '../print.css';
import { invoiceAPI, customerAPI, invoiceBlockAPI, companyAPI, companyBankAccountAPI, proformaAPI, currencyAPI, companyNAVConfigAPI, emailTemplateAPI, contactAPI } from '../services/api';
import ReactSelect from 'react-select';
import CreatableSelect from 'react-select/creatable';
import VAT_RATES from '../utils/vatRates';
import { vatTypesAPI } from '../services/api';
import api, { utilsAPI } from '../services/api';

const PAYMENT_METHOD_LABELS = {
  transfer: 'Átutalás',
  cash: 'Készpénz',
  card: 'Bankkártya',
  voucher: 'Utalvány',
  cod: 'Utánvét',
  other: 'Egyéb'
};

const FormContainer = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  margin-left: 20px;

  @media (max-width: 768px) {
    padding: 12px;
    margin-left: 0;
    padding-bottom: 92px;
  }
`;

const FormHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ecf0f1;

  @media (max-width: 1100px) {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    margin-bottom: 16px;
  }
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 600;
  margin: 0;
  color: #2c3e50;
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;

  @media (max-width: 1100px) {
    width: 100%;
    justify-content: flex-start;

    > * {
      flex: 1 1 130px;
      justify-content: center;
    }
  }

  @media (max-width: 480px) {
    gap: 6px;

    > * {
      flex: 1 1 100%;
      justify-content: center;
    }
  }
`;

// Header layout additions
const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;

  @media (max-width: 768px) {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
`;

const InlineHeaderGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 768px) {
    flex-wrap: wrap;
    width: 100%;
  }
`;

const CompactField = styled.div`
  min-width: 180px;

  @media (max-width: 768px) {
    min-width: 0;
    width: 100%;
  }
`;

const BankInfoPill = styled.div`
  font-size: 12px;
  color: #2c3e50;
  background: #f8f9fa;
  border: 1px solid #ecf0f1;
  border-radius: 14px;
  padding: 6px 10px;
  white-space: nowrap;

  @media (max-width: 768px) {
    white-space: normal;
  }
`;

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 16px;
`;

const TopLeftGroup = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: 720px;
`;

const InvoiceNumberBox = styled.div`
  min-width: 260px;
`;

const InlineGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background-color: ${props => {
    switch (props.variant) {
      case 'primary': return '#3498db';
      case 'secondary': return '#6c757d';
      case 'success': return '#27ae60';
      case 'danger': return '#e74c3c';
      default: return '#f8f9fa';
    }
  }};
  color: white;

  &:hover {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const FormSection = styled.div`
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #2c3e50;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: #2c3e50;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-height: 80px;
  resize: vertical;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }

  &.error {
    border-color: #e74c3c;
  }
`;

const ErrorMessage = styled.span`
  color: #e74c3c;
  font-size: 12px;
  margin-top: 4px;
  display: block;
`;

const ItemsSection = styled.div`
  margin-top: 24px;
`;

const ItemsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
`;

const ItemsTableWrap = styled.div`
  overflow-x: hidden;
`;

  const ItemsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;

  @media (max-width: 768px) {
    table-layout: fixed;
  }
`;

const TableHeader = styled.thead`
  background-color: #f8f9fa;

  @media (max-width: 768px) {
    display: none;
  }
`;

const TableHeaderCell = styled.th`
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #2c3e50;
  border-bottom: 1px solid #ecf0f1;

  @media (max-width: 768px) {
    padding: 8px 6px;
    font-size: 11px;
    white-space: normal;
    word-break: break-word;
  }
`;

const TableBody = styled.tbody``;

const TableRow = styled.tr`
  &:hover {
    background-color: #f8f9fa;
  }

  @media (max-width: 768px) {
    display: block;
    margin-bottom: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
  }
`;

const TableCell = styled.td`
  padding: 12px;
  border-bottom: 1px solid #ecf0f1;

  @media (max-width: 768px) {
    display: block;
    width: 100%;
    padding: 8px;
    border-bottom: none;
    white-space: normal;
    word-break: break-word;
  }

  @media (max-width: 768px) {
    &[data-label]::before {
      content: attr(data-label);
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 4px;
    }
  }
`;

const ItemInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3498db;
  }

  @media (max-width: 768px) {
    font-size: 12px;
    padding: 6px;
  }
`;

const ItemSelect = styled.select`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;

  &:focus {
    outline: none;
    border-color: #3498db;
  }

  @media (max-width: 768px) {
    font-size: 12px;
    padding: 6px;
  }
`;

  const SmallInput = styled.input`
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 12px;
  `;

const InlineFlex = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 768px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const IconGhostButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid #e1e5e8;
  border-radius: 6px;
  background: #fff;
  color: #6c757d;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
  &:hover { background: #f8f9fa; color: #2c3e50; border-color: #d5dade; }
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalCard = styled.div`
  background: #fff;
  border-radius: 8px;
  width: min(880px, 96vw);
  max-height: 80vh;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #ecf0f1;
  font-weight: 600;
  color: #2c3e50;
`;

const ModalBody = styled.div`
  padding: 16px;
  max-height: 70vh;
  overflow: auto;
`;

const HelpRow = styled.div`
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f4;
`;

const HelpTitle = styled.div`
  font-weight: 600; color: #2c3e50; margin-bottom: 4px;
`;

const HelpMeta = styled.div`
  font-size: 12px; color: #6c757d; margin-bottom: 6px;
`;

const HelpText = styled.div`
  font-size: 14px; color: #34495e; white-space: pre-wrap;
`;

const AddItemButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #27ae60;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #229954;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const CsvImportButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: #2980b9;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #2471a3;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const SampleCsvButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: transparent;
  color: #555;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;

  &:hover {
    background-color: #f0f0f0;
    border-color: #999;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const MobileActionBar = styled.div`
  display: none;

  @media (max-width: 768px) {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.08);
  }
`;

const MobileActionButton = styled(Button)`
  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
    padding: 10px 8px;
    font-size: 13px;
    gap: 6px;
  }
`;

const DeleteButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-color: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #c0392b;
  }
`;

const SummarySection = styled.div`
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-top: 24px;
`;

const VatTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  th, td { border-bottom: 1px solid #ecf0f1; padding: 8px; text-align: left; }
  th { background: #f1f3f5; }
`;

const SummaryRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #ddd;

  &:last-child {
    border-bottom: none;
    font-weight: 600;
    font-size: 16px;
    color: #2c3e50;
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  font-size: 18px;
  color: #7f8c8d;
`;

const TRANSLATIONS = {
    en: {
        'Számla': 'Invoice',
        'Díjbekérő': 'Proforma Invoice',
        'Számlaszám': 'Invoice Number',
        'Díjbekérő száma': 'Proforma Number',
        'Kiállítás dátuma': 'Issue Date',
        'Kibocsátás dátuma': 'Issue Date',
        'Kibocsátás': 'Issue Date',
        'Kelt': 'Date',
        'Teljesítés dátuma': 'Delivery Date',
        'Teljesítés': 'Delivery Date',
        'Fizetési határidő': 'Due Date',
        'Esedékesség dátuma': 'Due Date',
        'Fizetési mód': 'Payment Method',
        'Megrendelésszám': 'Order Reference',
        'Hivatkozási szám': 'Reference Number',
        'Pénznem': 'Currency',
        'Árfolyam': 'Exchange Rate',
        'Vevő': 'Buyer',
        'Ügyfél': 'Buyer',
        'Eladó': 'Seller',
        'Bankszámlák': 'Bank Accounts',
        'Megnevezés': 'Description',
        'Mennyiség': 'Quantity',
        'Menny.': 'Qty.',
        'Egység': 'Unit',
        'Egységár': 'Unit Price',
        'Nettó': 'Net',
        'Nettó összeg': 'Net Amount',
        'ÁFA': 'VAT',
        'ÁFA értéke': 'VAT Value',
        'ÁFA összeg': 'VAT Amount',
        'Bruttó': 'Gross',
        'Bruttó összeg': 'Gross Amount',
        'Kedvezmény': 'Discount',
        'Összesen': 'Total',
        'Kerekítés': 'Rounding',
        'Fizetendő': 'Total Payable',
        'Visszatérítendő': 'Refundable',
        'Lábjegyzék': 'Footer Note',
        'Bankszámla': 'Bank Account',
        'Megjegyzés': 'Comment',
        'bank_transfer': 'Transfer',
        'cash': 'Cash',
        'card': 'Card',
        'voucher': 'Voucher',
        'cod': 'COD',
        'other': 'Other',
        'transfer': 'Transfer',
        'Átutalás': 'Transfer',
        'Készpénz': 'Cash',
        'Bankkártya': 'Card',
        'Utalvány': 'Voucher',
        'Utánvét': 'COD',
        'Egyéb': 'Other',
        'Alapadatok': 'Basic Info',
        'Tételek': 'Items',
        'Bankszámlaszám': 'Bank Account Number',
        'Számlázási cím': 'Billing Address',
        'Adószám': 'Tax Number',
        'EU Adószám': 'EU Tax Number',
        'Kapcsolattartó': 'Contact Person',
        'Email': 'Email',
        'Telefon': 'Phone',
        'Címe': 'Address',
    },
    de: {
        'Számla': 'Rechnung',
        'Díjbekérő': 'Proforma Rechnung',
        'Számlaszám': 'Rechnungsnummer',
        'Díjbekérő száma': 'Proforma Nummer',
        'Kiállítás dátuma': 'Ausstellungsdatum',
        'Kibocsátás dátuma': 'Ausstellungsdatum',
        'Kibocsátás': 'Ausstellungsdatum',
        'Kelt': 'Datum',
        'Teljesítés dátuma': 'Lieferdatum',
        'Teljesítés': 'Lieferdatum',
        'Fizetési határidő': 'Fälligkeitsdatum',
        'Esedékesség dátuma': 'Fälligkeitsdatum',
        'Fizetési mód': 'Zahlungsart',
        'Megrendelésszám': 'Bestellnummer',
        'Hivatkozási szám': 'Referenznummer',
        'Pénznem': 'Währung',
        'Árfolyam': 'Wechselkurs',
        'Vevő': 'Kunde',
        'Ügyfél': 'Kunde',
        'Eladó': 'Verkäufer',
        'Bankszámlák': 'Bankverbindungen',
        'Megnevezés': 'Beschreibung',
        'Mennyiség': 'Menge',
        'Menny.': 'Menge',
        'Egység': 'Einheit',
        'Egységár': 'Einzelpreis',
        'Nettó': 'Netto',
        'Nettó összeg': 'Netto Betrag',
        'ÁFA': 'MwSt',
        'ÁFA értéke': 'MwSt Wert',
        'ÁFA összeg': 'MwSt Betrag',
        'Bruttó': 'Brutto',
        'Bruttó összeg': 'Brutto Betrag',
        'Kedvezmény': 'Rabatt',
        'Összesen': 'Gesamt',
        'Fizetendő': 'Zahlbar',
        'Visszatérítendő': 'Rückerstattbar',
        'Lábjegyzék': 'Fußnote',
        'Bankszámla': 'Bankkonto',
        'Megjegyzés': 'Kommentar',
        'bank_transfer': 'Überweisung',
        'cash': 'Bar',
        'card': 'Karte',
        'voucher': 'Gutschein',
        'cod': 'Nachnahme',
        'other': 'Andere',
        'transfer': 'Überweisung',
        'Átutalás': 'Überweisung',
        'Készpénz': 'Bar',
        'Bankkártya': 'Karte',
        'Utalvány': 'Gutschein',
        'Utánvét': 'Nachnahme',
        'Egyéb': 'Andere',
        'Alapadatok': 'Grunddaten',
        'Tételek': 'Artikel',
        'Bankszámlaszám': 'Kontonummer',
        'Számlázási cím': 'Rechnungsadresse',
        'Adószám': 'Steuernummer',
        'EU Adószám': 'EU Steuernummer',
        'Kapcsolattartó': 'Kontaktperson',
        'Email': 'Email',
        'Telefon': 'Telefon',
        'Címe': 'Adresse',
    }
};

const BilingualLabel = ({ label, translationMap, show, customLabel }) => {
    if (!show || !translationMap) return customLabel || label;
    const translated = translationMap[customLabel || label];
    if(!translated) return customLabel || label;
    
    return (
        <span className="bilingual-label">
            <span className="primary">{customLabel || label}</span>
            <span className="secondary" style={{ color: '#7f8c8d', fontWeight: 'normal', fontSize: '0.85em', marginLeft: '4px' }}> <span className="separator">/</span> {translated}</span>
        </span>
    );
};

const InvoiceForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || '';
  const manualEditId = (params.get('edit_manual_id') || '').trim();
  const isReadOnly = mode === 'view';
  const isProforma = location.pathname.startsWith('/proformas');
  const isIncomingManual = location.pathname.startsWith('/incoming-invoices/new');
  const isIncomingManualEdit = isIncomingManual && !!manualEditId;
  const backListPath = isIncomingManual ? '/incoming-invoices' : (isProforma ? '/proformas' : '/invoices');
  const scheduledEditIdFromQuery = params.get('scheduled_edit') || '';
  const [editingScheduledId, setEditingScheduledId] = useState(scheduledEditIdFromQuery || null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const MANUAL_DRAFTS_KEY = 'pixinvoice_manual_drafts';
  const [draftsModalOpen, setDraftsModalOpen] = useState(false);
  const [manualDrafts, setManualDrafts] = useState([]);
  // Activity log
  const [invoiceLogs, setInvoiceLogs] = useState([]);
  const [invoiceLogsLoading, setInvoiceLogsLoading] = useState(false);
  const [activityLogModalOpen, setActivityLogModalOpen] = useState(false);
  const [currencyConfirm, setCurrencyConfirm] = useState(null); // { newOpt, resolve }
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleTemplateOptions, setScheduleTemplateOptions] = useState([{ value: 'invoice_send', label: 'Számlaküldés' }]);
  const [scheduleContactEmails, setScheduleContactEmails] = useState([]);
  const notesTemplateRef = useRef(null);
  const incomingDocInputRef = useRef(null);
  const csvInputRef = useRef(null);
  const [incomingDocName, setIncomingDocName] = useState('');
  const [incomingDocUrl, setIncomingDocUrl] = useState('');
  const [pendingPrefillJobs, setPendingPrefillJobs] = useState([]);
  const [openingPendingPrefills, setOpeningPendingPrefills] = useState(false);
  const [blockedPrefillTabs, setBlockedPrefillTabs] = useState([]);
  const [showIncomingDocPreview, setShowIncomingDocPreview] = useState(false);
  const incomingManualLoadedRef = useRef(false);
  const [scheduleForm, setScheduleForm] = useState({
    startIssueDate: '',
    scheduleMode: 'interval',
    intervalUnit: 'month',
    intervalValue: 1,
    weekday: 0,
    monthDay: 1,
    monthLastDay: false,
    approvalRequired: false,
    autoSendEmail: false,
    emailTemplateType: 'invoice_send',
    extraEmails: '',
    deliveryMode: 'issue_offset',
    deliveryMonthDay: 1,
    deliveryYearDay: 1,
    notesTemplate: '',
    firstInvoice: false,
  });

  const scheduleDateToStr = (value) => {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    try {
      return new Date(value).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  const scheduleDiffDays = (from, to) => {
    if (!from || !to) return 0;
    const a = new Date(from);
    const b = new Date(to);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    const ms = b0.getTime() - a0.getTime();
    return Math.round(ms / (24 * 3600 * 1000));
  };

  const scheduleFrequencyPreview = () => {
    if (scheduleForm.scheduleMode === 'interval') {
      const val = Math.max(1, Number(scheduleForm.intervalValue || 1));
      const labels = {
        day: 'naponta',
        week: 'hetente',
        month: 'havonta',
        year: 'évente',
      };
      if (val === 1) return `Minden ${labels[scheduleForm.intervalUnit] || 'időszakban'}`;
      return `${val} ${(labels[scheduleForm.intervalUnit] || 'időszakonként')}`;
    }
    if (scheduleForm.scheduleMode === 'weekday') {
      const dayLabels = ['hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap'];
      return `Minden hét ${dayLabels[Number(scheduleForm.weekday || 0)] || 'hétfő'}`;
    }
    if (scheduleForm.scheduleMode === 'monthday') {
      if (scheduleForm.monthLastDay) return 'Minden hónap utolsó napja';
      return `Minden hónap ${Math.max(1, Number(scheduleForm.monthDay || 1))}. napja`;
    }
    return 'Ismeretlen';
  };

  const scheduleResolveNoteTemplate = (template, issueDateLike) => {
    const baseDate = issueDateLike ? new Date(issueDateLike) : new Date();
    if (Number.isNaN(baseDate.getTime())) return String(template || '');

    const monthNamesHu = [
      'január', 'február', 'március', 'április', 'május', 'június',
      'július', 'augusztus', 'szeptember', 'október', 'november', 'december'
    ];

    const currentYearMonth = `${baseDate.getFullYear()}.${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
    const nextMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
    const nextYearMonth = `${nextMonthDate.getFullYear()}.${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const currentYear = String(baseDate.getFullYear());
    const monthName = monthNamesHu[baseDate.getMonth()] || '';
    const nextIssueDateStr = baseDate.toLocaleDateString('hu-HU');
    const monthLastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).toLocaleDateString('hu-HU');
    const nextMonthLastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 2, 0).toLocaleDateString('hu-HU');
    const freq = scheduleFrequencyPreview();

    return String(template || '')
      .replace(/\{év_hónap\]/g, currentYearMonth)
      .replace(/\{év_hónap\}/g, currentYearMonth)
      .replace(/\{év_következő hónap\}/g, nextYearMonth)
      .replace(/\{év\}/g, currentYear)
      .replace(/\{hónap_nev\}/g, monthName)
      .replace(/\{következő_keltezés\}/g, nextIssueDateStr)
      .replace(/\{hónap_utolsó_napja\}/g, monthLastDay)
      .replace(/\{hónap utolsó napja\}/g, monthLastDay)
      .replace(/\{következő_hónap_utolsó_napja\}/g, nextMonthLastDay)
      .replace(/\{következő hónap utolsó napja\}/g, nextMonthLastDay)
      .replace(/\{gyakoriság\}/g, freq);
  };

  const scheduleDeliveryPreviewDate = (issueDateLike) => {
    const issueDate = issueDateLike ? new Date(issueDateLike) : null;
    if (!issueDate || Number.isNaN(issueDate.getTime())) return null;

    if (scheduleForm.deliveryMode === 'next_month_day') {
      const nextMonth = new Date(issueDate.getFullYear(), issueDate.getMonth() + 1, 1);
      const targetDay = Math.max(1, Math.min(31, Number(scheduleForm.deliveryMonthDay || 1)));
      const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
      return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(targetDay, lastDay));
    }

    if (scheduleForm.deliveryMode === 'next_year_day') {
      const target = Math.max(1, Math.min(366, Number(scheduleForm.deliveryYearDay || 1)));
      const year = issueDate.getFullYear() + 1;
      const firstDay = new Date(year, 0, 1);
      firstDay.setDate(firstDay.getDate() + (target - 1));
      return firstDay;
    }

    const issueBase = watch('issue_date');
    const deliveryBase = watch('delivery_date');
    const diff = deliveryBase ? scheduleDiffDays(issueBase, deliveryBase) : 0;
    const out = new Date(issueDate);
    out.setDate(out.getDate() + diff);
    return out;
  };

  const scheduleDuePreviewDate = (issueDateLike) => {
    const issueDate = issueDateLike ? new Date(issueDateLike) : null;
    if (!issueDate || Number.isNaN(issueDate.getTime())) return null;
    const dueDiff = scheduleDiffDays(watch('issue_date'), watch('due_date'));
    const out = new Date(issueDate);
    out.setDate(out.getDate() + dueDiff);
    return out;
  };

  const scheduleInsertVariableAtCursor = (token) => {
    const textarea = notesTemplateRef.current;
    if (!textarea) {
      setScheduleForm((prev) => ({ ...prev, notesTemplate: `${String(prev.notesTemplate || '')}${token}` }));
      return;
    }

    const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : String(scheduleForm.notesTemplate || '').length;
    const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start;

    setScheduleForm((prev) => {
      const currentText = String(prev.notesTemplate || '');
      return {
        ...prev,
        notesTemplate: `${currentText.slice(0, start)}${token}${currentText.slice(end)}`,
      };
    });

    requestAnimationFrame(() => {
      try {
        textarea.focus();
        const cursor = start + token.length;
        textarea.setSelectionRange(cursor, cursor);
      } catch {}
    });
  };
  
  const [exchangeRate, setExchangeRate] = useState(null);
  const [bilingual, setBilingual] = useState(false);
  // Store historical view-only metadata like VAT names and original units to bypass RHF limitations in View Mode
  const [itemMeta, setItemMeta] = useState({});

  // Dynamic print styles for page numbering
  const printPageContent = bilingual 
    ? '"Oldal/Page " counter(page) " / " counter(pages)' 
    : '"Oldal " counter(page) " / " counter(pages)';

  const [secLang, setSecLang] = useState(null);
  const [translations, setTranslations] = useState({});
  const copyFrom = params.get('copy_from') || '';
  const fromProforma = params.get('from_proforma') || '';
  const isAdvanceFromProforma = params.get('advance') === '1';
  const correctFrom = params.get('correct_from') || '';
  const stornoFrom = params.get('storno_from') || '';
  const autoPrint = params.get('print') === '1';
  const isStornoCreation = !isEdit && Boolean(stornoFrom);

  // Initialize form hooks before using watch/setValue anywhere below
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    setError,
    formState: { errors, dirtyFields },
  } = useForm({
    defaultValues: {
      items: [{ description: '', quantity: 1, unit_price: 0, vat_rate: 27, unit_of_measure: 'db' }],
      issue_date: new Date(),
      payment_method: 'transfer',
      invoice_category: 'SIMPLIFIED',
      invoice_appearance: 'ELECTRONIC',
      completeness_indicator: false,
      currency: 'HUF',
      exchange_rate: 1,
    },
  });

  const selectedCompanyId = watch('company_id');
  const sidebarCompanySwitchRef = React.useRef(null);
  const selectedCompanyIdRef = React.useRef(selectedCompanyId);
  const CUSTOMER_USAGE_KEY = 'invoiceCustomerUsage';

  React.useEffect(() => {
    selectedCompanyIdRef.current = selectedCompanyId;
  }, [selectedCompanyId]);

  const { data: customers, isLoading: customersLoading } = useQuery(
    ['customers-all'],
    () => customerAPI.getCustomers({ page_size: 10000 }),
    { select: (res) => res.data }
  );

  const { data: overdueCustomerFlags } = useQuery(
    ['overdue-customer-flags', selectedCompanyId],
    () => invoiceAPI.getOverdueCustomerFlags({ company_id: selectedCompanyId }).then(r => r.data?.results || []),
    { enabled: !!selectedCompanyId, staleTime: 60000 }
  );
  const overdueCustomerMap = React.useMemo(() => {
    const map = {};
    (overdueCustomerFlags || []).forEach(f => { map[f.customer_id] = f.level; });
    return map;
  }, [overdueCustomerFlags]);

  const customerRows = React.useMemo(() => {
    if (Array.isArray(customers?.results)) return customers.results;
    if (Array.isArray(customers)) return customers;
    return [];
  }, [customers]);

  const customerUsage = React.useMemo(() => {
    try {
      const raw = localStorage.getItem(CUSTOMER_USAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  }, [customers]);

  const bumpCustomerUsage = React.useCallback((customerId) => {
    if (!customerId) return;
    try {
      const raw = localStorage.getItem(CUSTOMER_USAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = (parsed && typeof parsed === 'object') ? { ...parsed } : {};
      const key = String(customerId);
      next[key] = Number(next[key] || 0) + 1;
      localStorage.setItem(CUSTOMER_USAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const { data: companies } = useQuery(
    ['companies', { is_active: true }],
    () => companyAPI.getCompanies({ is_active: true }),
    { select: (res) => res.data }
  );

  // Remember last selected company
  React.useEffect(() => {
    const cid = selectedCompanyId;
    try { if (cid) localStorage.setItem('selectedCompanyId', cid); } catch {}
  }, [selectedCompanyId]);

  const { data: invoiceBlocks } = useQuery(
    ['invoice-blocks', { is_active: true, company_id: selectedCompanyId }],
    () => invoiceBlockAPI.getInvoiceBlocks({ is_active: true, company_id: selectedCompanyId }),
    { enabled: !!selectedCompanyId && !isProforma, select: (res) => res.data }
  );

  React.useEffect(() => {
    if (isEdit || isReadOnly || isProforma) return;
    const handleSidebarCompanyChange = () => {
      let nextCompanyId = null;
      try { nextCompanyId = localStorage.getItem('selectedCompanyId'); } catch {}
      if (!nextCompanyId) return;
      if (String(nextCompanyId) === String(selectedCompanyIdRef.current || '')) return;

      const currentBlockId = getValues('invoice_block_id');
      const currentBlock = (invoiceBlocks?.results || []).find((b) => String(b?.id) === String(currentBlockId || ''));
      const preferredCurrency = String(
        getValues('currency') || currentBlock?.currency || currentBlock?.default_currency || 'HUF'
      ).toUpperCase();

      sidebarCompanySwitchRef.current = {
        targetCompanyId: nextCompanyId,
        preferredCurrency,
      };

      setValue('company_id', nextCompanyId, { shouldDirty: true, shouldValidate: true });
    };

    window.addEventListener('companyChanged', handleSidebarCompanyChange);
    return () => window.removeEventListener('companyChanged', handleSidebarCompanyChange);
  }, [isEdit, isReadOnly, isProforma, getValues, setValue, invoiceBlocks]);

  React.useEffect(() => {
    const pending = sidebarCompanySwitchRef.current;
    if (!pending) return;
    if (String(selectedCompanyId || '') !== String(pending.targetCompanyId || '')) return;
    if (!invoiceBlocks) return;

    const blocks = invoiceBlocks?.results || [];
    if (!blocks.length) {
      toast.warning('A kiválasztott céghez nincs aktív számlatömb.');
      sidebarCompanySwitchRef.current = null;
      return;
    }

    const normalizeCurrencyCode = (value) => String(value || '').trim().toUpperCase();
    const wantedCurrency = normalizeCurrencyCode(pending.preferredCurrency || 'HUF');
    const matchedBlock = blocks.find((block) =>
      normalizeCurrencyCode(block?.currency || block?.default_currency) === wantedCurrency
    );

    if (matchedBlock) {
      setValue('invoice_block_id', matchedBlock.id, { shouldDirty: true, shouldValidate: true });
      const matchedCurrency = matchedBlock?.default_currency || matchedBlock?.currency;
      if (matchedCurrency) {
        setValue('currency', matchedCurrency, { shouldDirty: true, shouldValidate: true });
      }
    } else {
      const fallbackBlock = blocks[0];
      setValue('invoice_block_id', fallbackBlock.id, { shouldDirty: true, shouldValidate: true });
      const fallbackCurrency = fallbackBlock?.default_currency || fallbackBlock?.currency || 'HUF';
      setValue('currency', fallbackCurrency, { shouldDirty: true, shouldValidate: true });
      toast.warning(`Nincs ${wantedCurrency} devizájú tömb az új cégnél, az alap tömb lett kiválasztva (${fallbackCurrency}).`);
    }

    sidebarCompanySwitchRef.current = null;
  }, [selectedCompanyId, invoiceBlocks, setValue]);

  const selectedBlockId = watch('invoice_block_id');

  const blockFootnote = React.useMemo(() => {
    const blocks = invoiceBlocks?.results || [];
    const blk = blocks.find((b) => b.id === selectedBlockId);
    return blk?.footer_note || '';
  }, [invoiceBlocks, selectedBlockId]);

  // Fetch primary bank account of selected company for display
  const { data: companyBankAccounts } = useQuery(
    ['company-bank-accounts', { company_id: selectedCompanyId }],
    () => selectedCompanyId ? companyBankAccountAPI.getAccounts({ company_id: selectedCompanyId }) : Promise.resolve({ data: { results: [] } }),
    { enabled: !!selectedCompanyId, select: (res) => res.data?.results || res.data || [] }
  );
  const selectedBankAccountId = watch('company_bank_account_id');
  const primaryCompanyBank = (companyBankAccounts || []).find(a => a.id === selectedBankAccountId) || (companyBankAccounts || []).find(a => a.is_primary) || (companyBankAccounts || [])[0];

  // Default selections for new invoice: use last selected company from localStorage if available,
  // otherwise first active company; then default first active block for that company
  React.useEffect(() => {
    if (isEdit || !companies?.results?.length) return;
    const STORAGE_KEY = 'selectedCompanyId';
    let storedId = null;
    try { storedId = localStorage.getItem(STORAGE_KEY); } catch {}
    if (storedId && companies.results.some(c => c.id === storedId)) {
      if (!selectedCompanyId) setValue('company_id', storedId);
    } else if (!selectedCompanyId) {
      setValue('company_id', companies.results[0].id);
    }
  }, [isEdit, companies, selectedCompanyId, setValue]);

  React.useEffect(() => {
    const currentBlock = watch('invoice_block_id');
    if (!isProforma && !isEdit && invoiceBlocks?.results?.length && !currentBlock) {
      setValue('invoice_block_id', invoiceBlocks.results[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, invoiceBlocks]);

  // Set invoice appearance from selected block
  React.useEffect(() => {
    const currentBlockId = watch('invoice_block_id');
    const blocks = invoiceBlocks?.results || [];
    if (isProforma || !currentBlockId) return;
    const blk = blocks.find(b => b.id === currentBlockId);
    if (blk && blk.invoice_appearance) {
      setValue('invoice_appearance', blk.invoice_appearance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_block_id'), invoiceBlocks]);

  const { data: invoice, isLoading: invoiceLoading } = useQuery(
    ['invoice', id],
    () => invoiceAPI.getInvoice(id),
    {
      enabled: isEdit,
      select: (res) => res.data,
      refetchOnMount: 'always',
      staleTime: 0,
      onSuccess: (inv) => {
        try {
          // In read-only mode always hydrate from server
          if (!isReadOnly && hasDraftRef.current) return;

          // Restore block and bilingual state
          if (inv.invoice_block) {
            const blkId = (typeof inv.invoice_block === 'object') ? inv.invoice_block.id : inv.invoice_block;
            setValue('invoice_block_id', blkId);
          } else if (inv.currency) {
            // Attempt auto-select block by currency if missing
            const bestBlock = (invoiceBlocks?.results || []).find(b => b.currency === inv.currency);
            if (bestBlock) setValue('invoice_block_id', bestBlock.id);
          }

          let isBi = false;
          if (inv.print_snapshot && typeof inv.print_snapshot.bilingual !== 'undefined') {
            isBi = inv.print_snapshot.bilingual;
          } else {
            isBi = (inv.currency && inv.currency !== 'HUF');
          }
          setBilingual(isBi);

          setValue('invoice_number', inv.invoice_number || '');
          if (inv.customer && inv.customer.id) setValue('customer_id', inv.customer.id);
          if (inv.issue_date) setValue('issue_date', new Date(inv.issue_date));
          if (inv.due_date) setValue('due_date', new Date(inv.due_date));
          setValue('delivery_date', inv.delivery_date ? new Date(inv.delivery_date) : null);
          if (inv.currency) setValue('currency', inv.currency);
          if (typeof inv.exchange_rate !== 'undefined') setValue('exchange_rate', inv.exchange_rate);
          if (inv.payment_method) setValue('payment_method', inv.payment_method);
          if (inv.payment_date) setValue('payment_date', new Date(inv.payment_date));
          if (typeof inv.invoice_appearance !== 'undefined') setValue('invoice_appearance', inv.invoice_appearance);
          setValue('notes', inv.notes || null);
          if (inv.invoice_category) setValue('invoice_category', inv.invoice_category);
          if (typeof inv.completeness_indicator !== 'undefined') setValue('completeness_indicator', inv.completeness_indicator);
          setValue('order_reference', inv.order_reference || '');
          
          if (Array.isArray(inv.items) && inv.items.length) {
            const metaMap = {};
            
            const newItems = inv.items.map((item, idx) => {
              const rate = Number(
                item.vat_rate ?? item.vat_percentage ?? item.vat?.percentage ?? item.vat_type?.percentage ?? 0
              );
              const vatTypeId = item.vat_type_id || item.vat_type?.id || item.vat?.id || item.vat_type || undefined;
              
              // Extract VAT name and Unit directly if available or from snapshot
              let vatName = item.vat_type?.name || item.vat?.name || undefined;
              let uom = item.unit_of_measure;

              if (inv.print_snapshot?.items?.[idx]) {
                 const snap = inv.print_snapshot.items[idx];
                 if (!vatName) vatName = snap._vat_name || snap.vat_name || undefined;
                 if (!uom) uom = snap.unit_of_measure || snap.unit || undefined;
              }
              
              metaMap[idx] = { vat_name: vatName, uom: uom || 'db' };

              return {
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                vat_rate: rate,
                unit_of_measure: uom || 'db',
                nature_indicator: item.nature_indicator || 'PRODUCT',
                vat_type_id: vatTypeId,
                _vat_name: vatName
              };
            });
            setValue('items', newItems);
            setItemMeta(metaMap);
          }
        } catch {}
        // Fetch activity log when invoice loads
        if (id) {
          setInvoiceLogsLoading(true);
          invoiceAPI.getTimeline(id)
            .then(res => setInvoiceLogs(Array.isArray(res.data) ? res.data : []))
            .catch(() => setInvoiceLogs([]))
            .finally(() => setInvoiceLogsLoading(false));
        }
      }
    }
  );

  const { data: availableCurrencies } = useQuery(
    ['currencies'],
    () => currencyAPI.getCurrencies().then(res => res.data?.results || [])
  );
  
  const currencyOptions = React.useMemo(() => {
    if (!availableCurrencies || availableCurrencies.length === 0) {
        return [
            { value: 'HUF', label: 'HUF' },
            { value: 'EUR', label: 'EUR' },
            { value: 'USD', label: 'USD' }
        ];
    }
    return availableCurrencies
        .filter(c => c.is_active !== false)
        .map(c => ({ value: c.code, label: `${c.code} - ${c.name}` }));
  }, [availableCurrencies]);

  // Auto-fetch exchange rate when currency or date changes
  React.useEffect(() => {
    const cur = watch('currency');
    const dateVal = watch('issue_date');
    if (!cur || cur === 'HUF') {
        const currentRate = getValues('exchange_rate');
        if (currentRate !== 1) setValue('exchange_rate', 1);
        return;
    }

    // Only fetch if:
    // 1. New invoice (creation)
    // 2. OR User explicitly changed currency/date (dirty)
    // 3. OR Invoice has wrong default rate (1.0) despite being foreign currency
    const isDirty = dirtyFields.currency || dirtyFields.issue_date;
    const currentRate = parseFloat(getValues('exchange_rate') || 0);
    const hasDefaultRate = Math.abs(currentRate - 1) < 0.0001;

    if (!isReadOnly && (isDirty || (!isEdit) || (isEdit && hasDefaultRate))) {
        const dateStr = dateVal ? (dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : dateVal) : new Date().toISOString().split('T')[0];
        
        utilsAPI.getExchangeRate(cur, dateStr)
            .then(res => {
                if (res.data && res.data.rate) {
                    // Update only if rate is different to avoid loops
                    const newRate = parseFloat(res.data.rate);
                    if (Math.abs(newRate - currentRate) > 0.0001) {
                        setValue('exchange_rate', newRate, { shouldValidate: true, shouldDirty: true });
                        // Also update visual state if needed
                        setExchangeRate(newRate);
                        toast.info(`Árfolyam frissítve: 1 ${cur} = ${newRate} HUF (${res.data.date})`, { autoClose: 2000 });
                    }
                }
            })
            .catch(err => {
                console.error("Exchange rate fetch failed", err);
            });
    }
  }, [watch('currency'), watch('issue_date'), isEdit, isReadOnly, dirtyFields]);

  // Fallback: If editing or viewing an invoice with no block saved, try to find a matching block by currency
  React.useEffect(() => {
    if (invoiceLoading || !invoiceBlocks?.results) return;
    
    // Check if we are in a mode where we should have a block (Edit or View)
    if (!isEdit && !isReadOnly) return;

    const currentBlockId = getValues('invoice_block_id');
    const currentCurrency = getValues('currency');
    
    // Only if we have NO block but DO have a currency
    if (!currentBlockId && currentCurrency) {
        const best = invoiceBlocks.results.find(b => b.currency === currentCurrency);
        if (best) {
            setValue('invoice_block_id', best.id);
             // Also force bilingual if block dictates it
            if (best.second_language) {
               setBilingual(true);
            }
        }
    }
  }, [isEdit, invoiceLoading, isReadOnly, invoiceBlocks, watch('invoice_block_id'), watch('currency')]);

  // Sync visual settings (translations) from block in ReadOnly/Edit mode
  // This ensures that when viewing an existing invoice, the correct language resources are loaded
  React.useEffect(() => {
     const currentBlockId = getValues('invoice_block_id');
     if (!invoiceBlocks?.results || !currentBlockId) return;
     
     const blk = invoiceBlocks.results.find(b => b.id === currentBlockId);
     if (blk) {
         // Load translation maps
         if (blk.second_language) {
             setSecLang(blk.second_language);
             setTranslations(TRANSLATIONS[blk.second_language] || {});
             
             // If the block is bilingual, ensure the UI reflects it
             // This fixes cases where the invoice doesn't have 'bilingual' saved in snapshot 
             // but uses a bilingual block.
             if (!bilingual) {
                 setBilingual(true);
             }
         }
     }
  }, [invoiceBlocks, watch('invoice_block_id'), isReadOnly, bilingual]);

  // Set defaults from selected block (currency, bank_account)
  React.useEffect(() => {
    const currentBlockId = watch('invoice_block_id');
    const blocks = invoiceBlocks?.results || [];
    if (isEdit || !currentBlockId) return; 
    
    // Check if user already changed currency manually? 
    // Usually we update on block change regardless, or if currency is not set.
    // Let's force update on block switch.
    
    // Store previous currency/rate for conversion
    const prevCurrency = getValues('currency') || 'HUF';

    const blk = blocks.find(b => b.id === currentBlockId);
    if (blk) {
      // Set language settings
      setBilingual(!!blk.second_language);
      setSecLang(blk.second_language);
      setTranslations(TRANSLATIONS[blk.second_language] || {});

      // If block has no default currency, stick to the current one
      const newCurrency = blk.default_currency || prevCurrency || 'HUF';
      let newRate = 1;
      let oldRate = 1;

      // Only perform logic if currency changed and we have available currencies loaded
      if (newCurrency && availableCurrencies && availableCurrencies.length > 0) {
           const newCurrObj = availableCurrencies.find(c => c.code === newCurrency);
           const oldCurrObj = availableCurrencies.find(c => c.code === prevCurrency);
           
           newRate = parseFloat(newCurrObj?.current_rate || 1);
           oldRate = parseFloat(oldCurrObj?.current_rate || 1);
           
           if (newCurrency !== prevCurrency) {
               // Convert items
               const currentItems = getValues('items') || [];
               if (currentItems.length > 0) {
                   const convertedItems = currentItems.map(item => {
                       // Convert: Value_HUF = Value_Old * OldRate.  Value_New = Value_HUF / NewRate.
                       // Factor = OldRate / NewRate
                       const factor = oldRate / newRate;
                       
                       const newItem = { ...item };
                       if (newItem.unit_price) newItem.unit_price = parseFloat((newItem.unit_price * factor).toFixed(4));
                       if (newItem.net_amount) newItem.net_amount = parseFloat((newItem.net_amount * factor).toFixed(2));
                       if (newItem.gross_amount) newItem.gross_amount = parseFloat((newItem.gross_amount * factor).toFixed(2));
                       if (newItem.vat_amount) newItem.vat_amount = parseFloat((newItem.vat_amount * factor).toFixed(2));
                       return newItem;
                   });
                   setValue('items', convertedItems);
               }
           }
      }

      if (blk.default_currency) setValue('currency', blk.default_currency);
      // Only set bank account if explicitly set on block
      if (blk.default_bank_account) setValue('company_bank_account_id', blk.default_bank_account); 
    }
  }, [watch('invoice_block_id'), invoiceBlocks, isEdit, setValue, availableCurrencies]);

  // Set default currency AND invoice block from customer's default_currency
  React.useEffect(() => {
    const cid = watch('customer_id');
    if (!cid || isEdit) return;
    const customer = customerRows.find(c => c.id === cid);
    if (!customer?.default_currency) return;
    const wantedCurrency = String(customer.default_currency).trim().toUpperCase();
    setValue('currency', wantedCurrency);
    const blocks = invoiceBlocks?.results || [];
    const matchedBlock = blocks.find(
      (b) => String(b?.currency || b?.default_currency || '').trim().toUpperCase() === wantedCurrency
    );
    if (matchedBlock) {
      setValue('invoice_block_id', matchedBlock.id, { shouldDirty: true, shouldValidate: true });
    }
  }, [watch('customer_id'), customerRows, invoiceBlocks, isEdit, setValue]);

  // Calculate exchange rate when currency changes
  const selectedCurrency = watch('currency');
  React.useEffect(() => {
      if(!availableCurrencies) return;
      const curr = availableCurrencies.find(c => c.code === selectedCurrency);
      if(curr) {
          setExchangeRate(curr.current_rate);
          setValue('exchange_rate', curr.current_rate);
      } else {
          setExchangeRate(1);
          setValue('exchange_rate', 1);
      }
  }, [selectedCurrency, availableCurrencies, setValue]);
  useEffect(() => {
    if (!fromProforma || isEdit) return;
    (async () => {
      try {
        const { proformaAPI } = await import('../services/api');
        const res = await proformaAPI.getProforma(fromProforma);
        const pf = res.data;
        if (!pf) return;
        if (pf.company && pf.company.id) setValue('company_id', pf.company.id);
        if (pf.customer && pf.customer.id) setValue('customer_id', pf.customer.id);
        if (pf.issue_date) setValue('issue_date', new Date(pf.issue_date));
        if (pf.due_date) setValue('due_date', new Date(pf.due_date));
        setValue('payment_method', pf.payment_method || 'transfer');
        setValue('invoice_category', isAdvanceFromProforma ? 'ADVANCE' : 'SIMPLIFIED');
        setValue('order_reference', pf.proforma_number);
        if (Array.isArray(pf.items) && pf.items.length) {
          const mapped = pf.items.map(it => {
            const rate = Number(
              it.vat_rate ?? it.vat_percentage ?? it.vat?.percentage ?? it.vat_type?.percentage ?? 0
            );
            const vatTypeId = it.vat_type_id || it.vat_type?.id || it.vat?.id || it.vat_type || undefined;
            return {
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              vat_rate: rate,
              unit_of_measure: it.unit_of_measure || 'db',
              nature_indicator: it.nature_indicator || 'PRODUCT',
              vat_type_id: vatTypeId,
            };
          });
          setValue('items', mapped);
        }
      } catch (e) {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromProforma, isAdvanceFromProforma, isEdit]);

  const { data: baseInvoice } = useQuery(
    ['invoice_base', copyFrom || correctFrom || stornoFrom],
    () => invoiceAPI.getInvoice(copyFrom || correctFrom || stornoFrom),
    {
      enabled: !isEdit && Boolean(copyFrom || correctFrom || stornoFrom),
      select: (res) => res.data,
      refetchOnMount: 'always',
      staleTime: 0,
      onSuccess: (base) => {
        try {
          if (base && base.company && base.company.id) setValue('company_id', base.company.id);
          // Restore invoice block if copying
          if (base && base.invoice_block) {
             const blkId = (typeof base.invoice_block === 'object') ? base.invoice_block.id : base.invoice_block;
             setValue('invoice_block_id', blkId);
          } else if (base && base.currency && invoiceBlocks?.results) {
             // Fallback: try to match block by currency if block ID is missing on source invoice
             const best = invoiceBlocks.results.find(b => b.currency === base.currency);
             if (best) setValue('invoice_block_id', best.id);
          }
          if (base && base.customer && base.customer.id) setValue('customer_id', base.customer.id);
          const today = new Date();
          setValue('issue_date', today);
          if (copyFrom && !correctFrom && !stornoFrom) {
            setValue('delivery_date', base?.delivery_date ? new Date(base.delivery_date) : today);
          } else {
            setValue('delivery_date', today);
          }
          if (base && base.currency) setValue('currency', base.currency);
          if (base && typeof base.exchange_rate !== 'undefined') setValue('exchange_rate', base.exchange_rate);
          if (base && base.payment_method) setValue('payment_method', base.payment_method);
          setValue('invoice_category', correctFrom ? 'CORRECTION' : ((base && base.invoice_category) || 'NORMAL'));
          setValue('order_reference', base?.order_reference || '');
          if (copyFrom && !correctFrom && !stornoFrom) {
            setValue('notes', base?.notes || '');
          }
          let newItems = Array.isArray(base?.items) ? base.items.map((it, idx) => {
            const rate = Number(
              it.vat_rate ?? it.vat_percentage ?? it.vat?.percentage ?? it.vat_type?.percentage ?? 0
            );
            const vatTypeId = it.vat_type_id || it.vat_type?.id || it.vat?.id || it.vat_type || undefined;
            return {
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              vat_rate: rate,
              unit_of_measure: it.unit_of_measure || 'db',
              nature_indicator: it.nature_indicator || 'PRODUCT',
              vat_type_id: vatTypeId,
              original_line_number: idx + 1,
              line_operation: 'CREATE',
            };
          }) : [];
          if (stornoFrom) {
            newItems = newItems.map(it => ({ ...it, quantity: (Number(it.quantity) || 0) * -1 }));
            setValue('notes', `Sztornó számla az alábbi számlára: ${base.invoice_number}`);
            
            // Store original invoice's ERP order IDs for clearing after storno save
            if (base.erp_order_ids && Array.isArray(base.erp_order_ids) && base.erp_order_ids.length > 0) {
              console.log('[STORNO] Storing original invoice ERP order IDs for clearing after save:', base.erp_order_ids);
              erpOrderIdsRef.current = base.erp_order_ids;
            }
          }
          if (correctFrom) {
            setValue('notes', `Helyesbítő számla az alábbi számlára: ${base.invoice_number}`);
          }
          if (newItems.length) setValue('items', newItems);
        } catch {}
      }
    }
  );

  // Draft autosave (persist form across refresh)
  const DRAFT_KEY = React.useMemo(() => (isEdit ? `invoice_form_draft_${id}` : 'invoice_form_draft_new'), [isEdit, id]);
  const KEEP_FLAG_KEY = React.useMemo(() => `${DRAFT_KEY}__keep_on_refresh`, [DRAFT_KEY]);
  const hasDraftRef = React.useRef(false);
  const hasERPDataRef = React.useRef(false);
  const erpOrderIdsRef = React.useRef([]); // Store ERP order IDs for callback

  // Load draft from localStorage on mount (skip for copy/correct/storno flows and ERP data)
  React.useEffect(() => {
    if (!isEdit && (copyFrom || correctFrom || stornoFrom)) return;
    if (hasERPDataRef.current) return; // Skip if ERP data was loaded
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      hasDraftRef.current = true;
      const reviveDate = (v) => {
        if (!v) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
          const [y, mo, d] = String(v).split('-').map(Number);
          return new Date(y, mo - 1, d); // local midnight, avoids UTC-offset shift
        }
        return new Date(v);
      };
      // For new invoices, issue_date is always today (field is disabled); don't load stale draft date
      if (isEdit && parsed.issue_date) setValue('issue_date', reviveDate(parsed.issue_date));
      if (parsed.due_date) setValue('due_date', reviveDate(parsed.due_date));
      if ('delivery_date' in parsed) setValue('delivery_date', reviveDate(parsed.delivery_date));
      [
        'customer_id', 'company_id', 'invoice_block_id', 'currency', 'exchange_rate',
        'payment_method', 'invoice_category', 'invoice_appearance', 'payment_date',
        'completeness_indicator', 'order_reference', 'notes'
      ].forEach((k) => {
        if (k in parsed) setValue(k, parsed[k]);
      });
      if (Array.isArray(parsed.items) && parsed.items.length) {
        setValue('items', parsed.items);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DRAFT_KEY]);

  // When invoice (server) data loads in edit mode, only apply if no draft
  React.useEffect(() => {
    if (!invoice || hasDraftRef.current) return;
    setValue('company_id', invoice.company?.id);
    setValue('invoice_number', invoice.invoice_number);
    setValue('customer_id', invoice.customer.id);
    setValue('issue_date', new Date(invoice.issue_date));
    setValue('due_date', new Date(invoice.due_date));
    setValue('delivery_date', invoice.delivery_date ? new Date(invoice.delivery_date) : null);
    setValue('currency', invoice.currency);
    setValue('exchange_rate', invoice.exchange_rate);
    setValue('notes', invoice.notes);
    if (invoice.items && invoice.items.length > 0) {
      setValue('items', invoice.items.map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate,
        vat_type_id: item.vat_type?.id || undefined,
        unit_of_measure: item.unit_of_measure,
        nature_indicator: item.nature_indicator,
        note: item.note,
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);

  // A baseInvoice betöltését onSuccess-ben végezzük; itt nincs extra teendő

  React.useEffect(() => {
    if (isReadOnly && autoPrint && !invoiceLoading) {
      const t = setTimeout(() => window.print(), 150);
      return () => clearTimeout(t);
    }
  }, [isReadOnly, autoPrint, invoiceLoading]);

  // ESC key closes the tab when viewing an invoice (opened in new tab)
  useEffect(() => {
    if (!isReadOnly) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.close();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isReadOnly]);

  // Set document title so browser print/save suggests invoice-specific filename
  React.useEffect(() => {
    if (!isReadOnly || !invoice) return undefined;
    const prevTitle = document.title;
    const rawTax = invoice.customer?.tax_number || invoice.customer?.full_tax_number || '';
    const taxDigits = (rawTax || '').replace(/\D+/g, '').slice(0, 8);
    const invNo = invoice.invoice_number || 'szamla';
    const title = taxDigits ? `${taxDigits}-${invNo}` : invNo;
    document.title = title;
    return () => { document.title = prevTitle; };
  }, [isReadOnly, invoice]);

  // Subscribe to changes and persist draft (debounced) — skip in read-only/preview mode
  React.useEffect(() => {
    if (isReadOnly) return;
    let t = null;
    const sub = watch((value) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        try {
          const toISO = (d) => {
            if (!d) return null;
            if (d instanceof Date) {
              const y = d.getFullYear();
              const mo = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${mo}-${day}`; // local date, avoids UTC-offset shift
            }
            return d || null;
          };
          const draft = {
            customer_id: value.customer_id || '',
            company_id: value.company_id || '',
            invoice_block_id: value.invoice_block_id || '',
            issue_date: toISO(value.issue_date),
            due_date: toISO(value.due_date),
            delivery_date: toISO(value.delivery_date),
            currency: value.currency || 'HUF',
            exchange_rate: value.exchange_rate ?? 1,
            payment_method: value.payment_method || 'transfer',
            invoice_category: value.invoice_category || 'SIMPLIFIED',
            invoice_appearance: value.invoice_appearance || 'ELECTRONIC',
            payment_date: toISO(value.payment_date),
            completeness_indicator: !!value.completeness_indicator,
            order_reference: value.order_reference || '',
            notes: value.notes || '',
            items: Array.isArray(value.items) ? value.items : [],
          };
          localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {}
      }, 300);
    });
    return () => { sub.unsubscribe(); window.clearTimeout(t); };
  }, [watch, DRAFT_KEY]);

  // Keep draft only on refresh: clear on route leave (unmount) unless beforeunload set the keep flag
  React.useEffect(() => {
    if (isEdit) return; // only for new invoice
    const beforeUnload = () => { try { localStorage.setItem(KEEP_FLAG_KEY, '1'); } catch {} };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      let keep = false;
      try { keep = localStorage.getItem(KEEP_FLAG_KEY) === '1'; } catch {}
      if (!keep) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
      }
      try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
    };
  }, [KEEP_FLAG_KEY, DRAFT_KEY, isEdit]);

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedItems = watch('items');

  // Select-all helper for numeric/text inputs on focus
  const selectAll = (e) => {
    const el = e?.target;
    if (el && typeof el.select === 'function') {
      // use rAF to ensure focus applied first
      requestAnimationFrame(() => {
        try { el.select(); } catch {}
      });
    }
  };

  const createInvoiceMutation = useMutation(
    (data) => (isIncomingManual
      ? (isIncomingManualEdit
        ? invoiceAPI.updateIncomingManual({ ...data, digest_id: manualEditId })
        : invoiceAPI.createIncomingManual(data))
      : (isProforma ? proformaAPI.createProforma(data) : invoiceAPI.createInvoice(data))),
    {
  onSuccess: (res) => {
        if (isIncomingManual) {
          try { queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'incoming' }); } catch {}
          toast.success(isIncomingManualEdit ? 'Bejövő számla frissítve' : 'Bejövő számla rögzítve');
        } else if (isProforma) {
          queryClient.invalidateQueries('proformas');
          toast.success('Díjbekérő létrehozva');
        } else {
          try { queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'invoices' }); } catch { queryClient.invalidateQueries('invoices'); }
          toast.success('Számla létrehozva');
          
          // Handle ERP order IDs callback
          const createdInvoice = res?.data || {};
          const invoiceNumber = createdInvoice.invoice_number;
          const isStorno = stornoFrom && erpOrderIdsRef.current.length > 0;
          
          if (erpOrderIdsRef.current.length > 0) {
            const invoiceNumToSend = isStorno ? null : invoiceNumber;
            const actionMsg = isStorno ? 'Törlés' : 'Frissítés';
            
            console.log(`[ERP Callback] ${actionMsg} - invoice_number to ERP:`, invoiceNumToSend, 'for orders:', erpOrderIdsRef.current);
            
            // Call ERP API for each order
            const updatePromises = erpOrderIdsRef.current.map(async (orderId) => {
              try {
                const erpBaseUrl = process.env.REACT_APP_ERP_API_URL || 'https://e.pixisys.eu/api/v1';
                const response = await fetch(`${erpBaseUrl}/sales/customer-orders/${orderId}/update_invoice_number/`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ invoice_number: invoiceNumToSend }),
                });
                
                if (response.ok) {
                  console.log(`[ERP Callback] Successfully updated order ${orderId}`);
                } else {
                  console.error(`[ERP Callback] Failed to update order ${orderId}:`, response.status);
                }
              } catch (error) {
                console.error(`[ERP Callback] Error updating order ${orderId}:`, error);
              }
            });
            
            Promise.all(updatePromises).then(() => {
              if (isStorno) {
                toast.success('Sztornó számla létrehozva, eredeti megrendelések számlázhatók');
              } else {
                toast.success(`Számlaszám (${invoiceNumber}) visszaküldve az ERP-nek`);
              }
              erpOrderIdsRef.current = []; // Clear after successful callback
            }).catch((err) => {
              console.error('[ERP Callback] Error in callback:', err);
              toast.warning('Számla létrehozva, de nem sikerült értesíteni az ERP-t');
            });
          }
          
          try {
            const inv = res?.data || {};
            const st = inv.status;
            const hasTxn = !!inv.nav_transaction_id;
            if (st === 'nav_processed') {
              toast.success('NAV feldolgozva');
            } else if (st === 'submitted_to_nav' || hasTxn) {
              toast.info('NAV-hoz beküldve, feldolgozás alatt');
            } else if (st === 'nav_rejected') {
              toast.error('NAV elutasította. Újraküldés gomb elérhető a listában.');
            } else {
              toast.info('NAV beküldés nem sikerült. A listában NAV-nak küldés gomb elérhető.');
            }
          } catch {}
        }
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        try { localStorage.removeItem(KEEP_FLAG_KEY); } catch {}
        // Optional quick NAV status poll (best-effort)
        try {
          if (!isProforma && !isIncomingManual) {
            const inv = res?.data || {};
            const idNew = inv?.id;
            if (idNew && (inv.status === 'submitted_to_nav' || inv.nav_transaction_id)) {
              invoiceAPI
                .getNAVStatus(idNew)
                .then((statusRes) => {
                  const body = statusRes?.data || {};
                  const ps = body.processing_status || body.invoice_status;
                  if (ps === 'DONE') toast.success('NAV feldolgozás: DONE');
                  else if (ps === 'PROCESSING' || !ps) toast.info('NAV feldolgozás: folyamatban');
                })
                .catch(() => {});
            }
          }
        } catch {}
        navigate(backListPath);
      },
      onError: (error) => {
        // Próbáljunk a backend hibából első releváns mezőre fókuszálni
        let fieldName = '';
        let message = isIncomingManual
          ? (isIncomingManualEdit ? 'Hiba történt a bejövő számla frissítése során' : 'Hiba történt a bejövő számla rögzítése során')
          : (isProforma ? 'Hiba történt a díjbekérő létrehozása során' : 'Hiba történt a számla létrehozása során');
        const data = error?.response?.data;
        if (data && typeof data === 'object') {
          const keys = Object.keys(data);
          if (keys.length) {
            fieldName = keys[0];
            const raw = data[fieldName];
            const text = Array.isArray(raw) ? raw[0] : (typeof raw === 'string' ? raw : JSON.stringify(raw));
            message = text || message;
          }
        }
        toast.error(message);
        // Térképezzük a szerver kulcsot a form mezőnévre
        const map = {
          company_id: 'company_id',
          invoice_block_id: 'invoice_block_id',
          customer_id: 'customer_id',
          issue_date: 'issue_date',
          due_date: 'due_date',
          delivery_date: 'delivery_date',
          currency: 'currency',
          exchange_rate: 'exchange_rate',
        };
        const target = map[fieldName] || '';
        if (target) {
          // setError a vizuális jelzés miatt, majd fókusz és görgetés
          try { setError(target, { type: 'server', message }); } catch {}
          requestAnimationFrame(() => {
            const el = document.querySelector(`[name="${target}"]`);
            if (el && typeof el.focus === 'function') {
              el.focus();
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        } else if (fieldName === 'items' || (data && data.items)) {
          // Ha tételhiba, görgessünk a tételek szekcióhoz
          const el = document.getElementById('items-section');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }
  );

  const { data: manualIncomingData, isLoading: manualIncomingLoading } = useQuery(
    ['incoming-manual-edit', selectedCompanyId, manualEditId],
    () => invoiceAPI.getIncomingManual(selectedCompanyId, manualEditId),
    {
      enabled: isIncomingManualEdit && !!selectedCompanyId,
      select: (res) => res?.data?.data || null,
    }
  );

  React.useEffect(() => {
    if (!isIncomingManualEdit || !manualIncomingData || incomingManualLoadedRef.current) return;

    const parseNum = (v) => {
      const n = parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const normTax = (v) => String(v || '').replace(/\D+/g, '');
    const normalize = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();

    const supplierTax = normTax(manualIncomingData.supplier_tax_number);
    const supplierName = normalize(manualIncomingData.supplier_name);
    const supplierCandidate = (customerRows || []).find((cust) => {
      const cName = normalize(cust?.name);
      const cTax = normTax(cust?.tax_number || cust?.full_tax_number || cust?.eu_tax_number || cust?.vat_group_member_tax_number);
      const taxMatch = supplierTax && cTax && (supplierTax.startsWith(cTax.slice(0, 8)) || cTax.startsWith(supplierTax.slice(0, 8)));
      const nameMatch = supplierName && cName && (cName.includes(supplierName) || supplierName.includes(cName));
      return Boolean(taxMatch || (nameMatch && supplierName.length >= 4));
    });

    const issueDate = manualIncomingData.issue_date ? new Date(manualIncomingData.issue_date) : new Date();
    const dueDate = manualIncomingData.due_date ? new Date(manualIncomingData.due_date) : new Date();
    const deliveryDate = manualIncomingData.delivery_date ? new Date(manualIncomingData.delivery_date) : null;
    const net = parseNum(manualIncomingData.net_total);
    const vat = parseNum(manualIncomingData.vat_total);
    const vatRate = net > 0 ? Math.round((vat / net) * 10000) / 100 : 0;

    if (manualIncomingData.invoice_number) setValue('invoice_number', manualIncomingData.invoice_number);
    if (supplierCandidate?.id) setValue('customer_id', supplierCandidate.id);
    setValue('issue_date', issueDate);
    setValue('due_date', dueDate);
    setValue('delivery_date', deliveryDate);
    setValue('currency', (manualIncomingData.currency || 'HUF').toUpperCase());
    setValue('exchange_rate', parseNum(manualIncomingData.exchange_rate) || 1);
    if (manualIncomingData.payment_method) setValue('payment_method', String(manualIncomingData.payment_method).toLowerCase());
    if (manualIncomingData.invoice_category) setValue('invoice_category', manualIncomingData.invoice_category);
    setValue('items', [{
      description: `Számla ${manualIncomingData.invoice_number || ''}`.trim(),
      quantity: 1,
      unit_price: Math.round(net * 100) / 100,
      vat_rate: vatRate,
      unit_of_measure: 'db',
      nature_indicator: 'PRODUCT',
    }]);

    incomingManualLoadedRef.current = true;
  }, [customerRows, isIncomingManualEdit, manualIncomingData, setValue]);

  const applyParsedIncomingData = React.useCallback((parsed, warningList = [], { notify = true } = {}) => {
    const parseNum = (value) => {
      const n = parseFloat(String(value ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };

    const setDateIfValid = (fieldName, value) => {
      if (!value) return;
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        setValue(fieldName, d, { shouldDirty: true, shouldValidate: true });
      }
    };

    if (parsed.invoice_number) {
      setValue('invoice_number', parsed.invoice_number, { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.matched_supplier_id) {
      setValue('customer_id', parsed.matched_supplier_id, { shouldDirty: true, shouldValidate: true });
    } else {
      const normalize = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const normTax = (v) => String(v || '').replace(/\D+/g, '');
      const parsedName = normalize(parsed.supplier_name);
      const parsedTax = normTax(parsed.supplier_tax_number);
      if (parsedName || parsedTax) {
        const supplierCandidate = (customerRows || []).find((cust) => {
          const cName = normalize(cust?.name);
          const cTax = normTax(cust?.tax_number || cust?.full_tax_number || cust?.eu_tax_number || cust?.vat_group_member_tax_number);
          const taxMatch = parsedTax && cTax && (parsedTax.startsWith(cTax.slice(0, 8)) || cTax.startsWith(parsedTax.slice(0, 8)));
          const nameMatch = parsedName && cName && (cName.includes(parsedName) || parsedName.includes(cName));
          return Boolean(taxMatch || (nameMatch && parsedName.length >= 4));
        });
        if (supplierCandidate?.id) {
          setValue('customer_id', supplierCandidate.id, { shouldDirty: true, shouldValidate: true });
        }
      }
    }
    setDateIfValid('issue_date', parsed.issue_date);
    setDateIfValid('due_date', parsed.due_date);
    setDateIfValid('delivery_date', parsed.delivery_date);

    if (parsed.currency) {
      setValue('currency', String(parsed.currency).toUpperCase(), { shouldDirty: true, shouldValidate: true });
    }
    if (parsed.payment_method) {
      setValue('payment_method', String(parsed.payment_method).toLowerCase(), { shouldDirty: true, shouldValidate: true });
    }

    const gross = parseNum(parsed.gross_total);
    const net = parseNum(parsed.net_total);
    const vat = parseNum(parsed.vat_total);
    const suggestedRate = Number.isFinite(Number(parsed.suggested_vat_rate)) ? Number(parsed.suggested_vat_rate) : null;
    const parsedItems = Array.isArray(parsed.items) ? parsed.items : [];
    const mappedItems = parsedItems
      .map((it) => {
        const quantity = parseNum(it?.quantity);
        const unitPrice = parseNum(it?.unit_price);
        const vatRate = parseNum(it?.vat_rate);
        const description = String(it?.description || '').trim();
        const uomRaw = String(it?.unit_of_measure || '').trim().toLowerCase();
        const unitOfMeasure = uomRaw || 'db';
        if (!quantity || quantity <= 0 || unitPrice === null || unitPrice < 0) return null;
        return {
          description: description || 'Számlatétel',
          quantity,
          unit_price: Math.round(unitPrice * 100) / 100,
          vat_rate: vatRate !== null && vatRate >= 0 ? vatRate : (suggestedRate ?? 0),
          unit_of_measure: unitOfMeasure,
        };
      })
      .filter(Boolean);

    if (mappedItems.length > 0) {
      setValue('items', mappedItems, { shouldDirty: true, shouldValidate: false });
    }

    const hasAmount = (gross && gross > 0) || (net && net > 0);
    if (hasAmount && mappedItems.length === 0) {
      let vatRate = 0;
      if (suggestedRate !== null && suggestedRate >= 0) {
        vatRate = suggestedRate;
      }

      let baseNet = (net && net > 0) ? net : null;
      if (net && net > 0 && vat && vat >= 0) {
        const rawRate = (vat / net) * 100;
        const knownRates = [0, 5, 18, 20, 27];
        const nearest = knownRates.reduce((best, curr) => (Math.abs(curr - rawRate) < Math.abs(best - rawRate) ? curr : best), knownRates[0]);
        const inferredRate = Math.abs(nearest - rawRate) <= 2 ? nearest : Math.round(rawRate * 100) / 100;
        if (suggestedRate === null || suggestedRate < 0) {
          vatRate = inferredRate;
        }
      }
      if ((baseNet === null || baseNet <= 0) && gross && gross > 0) {
        if (vatRate > 0) baseNet = gross / (1 + (vatRate / 100));
        else baseNet = gross;
      }
      if (baseNet === null || !Number.isFinite(baseNet)) {
        baseNet = gross || 0;
      }

      setValue('items.0.quantity', 1, { shouldDirty: true, shouldValidate: false });
      setValue('items.0.unit_price', Math.round(baseNet * 100) / 100, { shouldDirty: true, shouldValidate: false });
      setValue('items.0.vat_rate', vatRate, { shouldDirty: true, shouldValidate: false });
      if (!String(getValues('items.0.description') || '').trim()) {
        const supplierLabel = String(parsed.supplier_name || parsed.matched_supplier_name || '').trim();
        const desc = `${supplierLabel ? `${supplierLabel} - ` : ''}Számla ${parsed.invoice_number || ''}`.trim();
        setValue('items.0.description', desc, { shouldDirty: true, shouldValidate: false });
      }
    }

    if (notify) {
      if (warningList.length > 0) {
        toast.info('A feldolgozás részben sikerült, néhány mezőt ellenőrizz manuálisan.');
      } else {
        toast.success('A számlakép alapján a mezők kitöltve.');
      }
    }
  }, [customerRows, getValues, setValue]);

  const parseIncomingDocumentMutation = useMutation(
    ({ companyId, file }) => invoiceAPI.parseIncomingDocument(companyId, file),
    {
      onSuccess: (res) => {
        const parsed = res?.data?.data || {};
        const warningList = Array.isArray(res?.data?.extract_warnings) ? res.data.extract_warnings.filter(Boolean) : [];
        applyParsedIncomingData(parsed, warningList, { notify: true });
      },
      onError: (error) => {
        const msg = error?.response?.data?.error || 'Nem sikerült feldolgozni a számlaképet.';
        toast.error(msg);
      }
    }
  );

  React.useEffect(() => {
    const sp = new URLSearchParams(location.search || '');
    const prefillKey = sp.get('incoming_prefill_key');
    if (!prefillKey) return;

    let attempts = 0;
    const maxAttempts = 120;
    const timer = setInterval(() => {
      attempts += 1;
      const raw = localStorage.getItem(prefillKey);
      if (!raw) {
        if (attempts >= maxAttempts) {
          clearInterval(timer);
          toast.error('Nem érkezett meg időben a beolvasás eredménye ehhez a laphoz.');
        }
        return;
      }

      clearInterval(timer);
      localStorage.removeItem(prefillKey);
      try {
        const payload = JSON.parse(raw || '{}');
        if (payload?.docName) {
          setIncomingDocName(String(payload.docName));
          setIncomingDocUrl(String(payload.previewUrl || ''));
        }
        if (payload?.error) {
          toast.error(String(payload.error));
        } else if (payload?.parsed) {
          applyParsedIncomingData(payload.parsed || {}, Array.isArray(payload.warnings) ? payload.warnings : [], { notify: true });
        }
      } catch {
        toast.error('Hibás előfeldolgozott adat érkezett.');
      }

      const next = new URLSearchParams(location.search || '');
      next.delete('incoming_prefill_key');
      const q = next.toString();
      navigate(`${location.pathname}${q ? `?${q}` : ''}`, { replace: true });
    }, 300);

    return () => clearInterval(timer);
  }, [applyParsedIncomingData, location.pathname, location.search, navigate]);

  const handleIncomingDocPick = (event) => {
    const files = Array.from(event?.target?.files || []);
    if (!files.length) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const validFiles = files.filter((file) => {
      const nameLower = String(file.name || '').toLowerCase();
      const extOk = nameLower.endsWith('.pdf') || nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg') || nameLower.endsWith('.png');
      return allowed.includes(String(file.type || '').toLowerCase()) || extOk;
    });

    if (!validFiles.length) {
      toast.error('Csak PDF, JPG vagy PNG fájl tölthető fel.');
      if (event?.target) event.target.value = '';
      return;
    }

    if (validFiles.length !== files.length) {
      toast.warning('Néhány fájl kimaradt, mert nem PDF/JPG/PNG formátumú.');
    }

    if (validFiles.length === 1) {
      const file = validFiles[0];
      setPendingPrefillJobs([]);
      setBlockedPrefillTabs([]);
      setIncomingDocUrl((prev) => {
        if (prev) {
          try { URL.revokeObjectURL(prev); } catch {}
        }
        return URL.createObjectURL(file);
      });
      setIncomingDocName(file.name || '');
      parseIncomingDocumentMutation.mutate({
        companyId: getValues('company_id') || selectedCompanyId,
        file,
      });
      if (event?.target) {
        event.target.value = '';
      }
      return;
    }

    const companyId = getValues('company_id') || selectedCompanyId;
    if (!companyId) {
      toast.error('Több fájl beolvasásához előbb válassz céget.');
      if (event?.target) event.target.value = '';
      return;
    }

    const jobs = validFiles.map((file, idx) => {
      const key = `incoming_prefill_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
      const url = `/incoming-invoices/new?incoming_prefill_key=${encodeURIComponent(key)}`;
      return { file, key, url, companyId };
    });

    setPendingPrefillJobs(jobs);
    setBlockedPrefillTabs([]);
    toast.info(`${validFiles.length} fájl kiválasztva. Kattints az „Összes megnyitása” gombra.`);

    setIncomingDocUrl((prev) => {
      if (prev) {
        try { URL.revokeObjectURL(prev); } catch {}
      }
      return '';
    });
    setIncomingDocName('');
    if (event?.target) {
      event.target.value = '';
    }
  };

  const openAllPendingPrefills = React.useCallback(async () => {
    if (!pendingPrefillJobs.length) return;

    setOpeningPendingPrefills(true);
    const jobs = [...pendingPrefillJobs];
    setPendingPrefillJobs([]);

    const blockedJobs = [];
    jobs.forEach((job) => {
      const opened = window.open(job.url, '_blank');
      if (!opened) {
        blockedJobs.push({ key: job.key, url: job.url, docName: job.file?.name || '' });
      }
    });

    setBlockedPrefillTabs(blockedJobs);
    if (blockedJobs.length > 0) {
      toast.warning(`${blockedJobs.length} lap megnyitását blokkolta a böngésző.`);
    }

    const fileToDataUrl = (file) => new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      } catch {
        resolve('');
      }
    });

    await Promise.allSettled(jobs.map(async ({ file, key, companyId: cid }) => {
      try {
        const [res, previewUrl] = await Promise.all([
          invoiceAPI.parseIncomingDocument(cid, file),
          fileToDataUrl(file),
        ]);
        localStorage.setItem(key, JSON.stringify({
          parsed: res?.data?.data || {},
          warnings: Array.isArray(res?.data?.extract_warnings) ? res.data.extract_warnings.filter(Boolean) : [],
          docName: file.name || '',
          previewUrl,
          ts: Date.now(),
        }));
      } catch (error) {
        const previewUrl = await fileToDataUrl(file);
        const msg = error?.response?.data?.error || 'Nem sikerült feldolgozni a számlaképet.';
        localStorage.setItem(key, JSON.stringify({
          error: msg,
          docName: file.name || '',
          previewUrl,
          ts: Date.now(),
        }));
      }
    }));

    setOpeningPendingPrefills(false);
    toast.info(`${jobs.length} fájl OCR feldolgozása elindult külön lapokra.`);
  }, [pendingPrefillJobs]);

  const retryBlockedPrefillTabs = React.useCallback(() => {
    if (!blockedPrefillTabs.length) return;

    const stillBlocked = [];
    blockedPrefillTabs.forEach((job) => {
      const opened = window.open(job.url, '_blank');
      if (!opened) stillBlocked.push(job);
    });

    setBlockedPrefillTabs(stillBlocked);
    if (stillBlocked.length > 0) {
      toast.warning(`${stillBlocked.length} lapot továbbra is blokkol a böngésző.`);
    } else {
      toast.success('A korábban blokkolt lapok megnyitva.');
    }
  }, [blockedPrefillTabs]);

  const openIncomingDocInNewTab = React.useCallback(() => {
    if (!incomingDocUrl) return;
    window.open(incomingDocUrl, '_blank', 'noopener,noreferrer');
  }, [incomingDocUrl]);

  React.useEffect(() => {
    return () => {
      if (incomingDocUrl) {
        try { URL.revokeObjectURL(incomingDocUrl); } catch {}
      }
    };
  }, [incomingDocUrl]);

  const updateInvoiceMutation = useMutation(
    async (data) => {
      if (isProforma) {
        return proformaAPI.updateProforma(id, data);
      }
      const res = await invoiceAPI.updateInvoice(id, data);
      // Ha NAV-elutasított számla, a tételeket is frissítjük
      if (invoice?.status === 'nav_rejected' && data.items && data.items.length > 0) {
        const itemsWithId = data.items.filter(it => it.id);
        if (itemsWithId.length > 0) {
          try {
            await invoiceAPI.updateRejectedInvoiceItems(id, itemsWithId);
          } catch (e) {
            console.warn('Tételek frissítése részben sikertelen:', e);
          }
        }
      }
      return res;
    },
    {
      onSuccess: () => {
        if (isProforma) {
          queryClient.invalidateQueries('proformas');
          toast.success('Díjbekérő frissítve');
        } else {
          try { queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'invoices' }); } catch { queryClient.invalidateQueries('invoices'); }
          queryClient.invalidateQueries(['invoice', id]);
          toast.success('Számla frissítve');
        }
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        navigate(isProforma ? '/proformas' : '/invoices');
      },
      onError: () => {
        toast.error(isProforma ? 'Hiba történt a díjbekérő frissítése során' : 'Hiba történt a számla frissítése során');
      },
    }
  );

  // (moved) invoice -> form population happens in guarded effect above

  const currencyDecimals = (() => {
    const code = watch('currency') || 'HUF';
    if (code === 'HUF') return 0;
    return (availableCurrencies || []).find(c => c.code === code)?.display_decimals ?? 2;
  })();
  const round = (num) => {
    const factor = Math.pow(10, currencyDecimals);
    return Math.round((Math.abs(Number(num)) + Number.EPSILON) * factor) / factor * (Number(num) < 0 ? -1 : 1);
  };

  const calculateItemTotals = (item) => {
    // Robust parsing handling commas
    const parse = (n) => {
       if (typeof n === 'number') return n;
       if (!n) return 0;
       return parseFloat(n.toString().replace(',', '.')) || 0;
    };

    const quantity = parse(item.quantity);
    const unitPrice = parse(item.unit_price);
    const vatRate = parse(item.vat_rate);
    
    const netAmount = round(quantity * unitPrice);
    const vatAmount = round(netAmount * (vatRate / 100));
    const grossAmount = round(netAmount + vatAmount);
    return { netAmount, vatAmount, grossAmount };
  };

  const calculateTotals = () => {
    const rawTotals = watchedItems.reduce(
      (totals, item) => {
        const { netAmount, vatAmount, grossAmount } = calculateItemTotals(item);
        return {
          netTotal: totals.netTotal + netAmount,
          vatTotal: totals.vatTotal + vatAmount,
          grossTotal: totals.grossTotal + grossAmount,
        };
      },
      { netTotal: 0, vatTotal: 0, grossTotal: 0 }
    );
    return {
      netTotal: round(rawTotals.netTotal),
      vatTotal: round(rawTotals.vatTotal),
      grossTotal: round(rawTotals.grossTotal),
    };
  };

  const vatBreakdown = () => {
    const map = new Map();
    (watchedItems || []).forEach((item) => {
      const rate = Number(item?.vat_rate || 0);
      const { netAmount, vatAmount, grossAmount } = calculateItemTotals(item);
      const key = rate.toFixed(2);
      if (!map.has(key)) map.set(key, { net: 0, vat: 0, gross: 0, names: new Set() });
      const acc = map.get(key);
      acc.net += netAmount;
      acc.vat += vatAmount;
      acc.gross += grossAmount;

      // Collect VAT name
      let vName = '';
      if (item.vat_type_id && vatTypes) {
           const vt = vatTypes.find(v => v.id === item.vat_type_id);
           if (vt) vName = vt.name || vt.code;
      }
      if (vName) acc.names.add(vName);
    });
    const rows = Array.from(map.entries()).map(([rate, v]) => ({
      rate: Number(rate),
      names: Array.from(v.names),
      net: round(v.net),
      vat: round(v.vat),
      gross: round(v.gross),
    })).sort((a,b)=>a.rate-b.rate);
    const rawTotals = rows.reduce((t,r)=>({ net:t.net+r.net, vat:t.vat+r.vat, gross:t.gross+r.gross }), {net:0,vat:0,gross:0});
    return { 
      rows, 
      totals: {
        net: round(rawTotals.net),
        vat: round(rawTotals.vat),
        gross: round(rawTotals.gross)
      } 
    };
  };

  // Open advances (for FINAL invoices)
  const [selectedAdvances, setSelectedAdvances] = useState({});
  const { data: openAdvances } = useQuery(
    ['open-advances', { company_id: watch('company_id'), customer_id: watch('customer_id') }],
    () => invoiceAPI.getOpenAdvances({ company_id: watch('company_id'), customer_id: watch('customer_id') }),
    { enabled: Boolean(watch('company_id') && watch('customer_id')), select: (res) => res.data?.results || [] }
  );

  // VAT types from backend (must be declared before effects that depend on it)
  const { data: vatTypesData } = useQuery(
    ['vat-types', { active: true }],
    () => vatTypesAPI.getVATTypes({ active: true }),
    { select: (res) => res.data }
  );
  const vatTypes = React.useMemo(() => {
    const list = Array.isArray(vatTypesData) ? vatTypesData : (vatTypesData?.results || []);
    return list;
  }, [vatTypesData]);

  const selectedBlockForDefaults = React.useMemo(() => {
    const blockId = selectedBlockId;
    if (!blockId) return null;
    return (invoiceBlocks?.results || []).find((b) => b.id === blockId) || null;
  }, [invoiceBlocks, selectedBlockId]);

  const defaultVatTypeForBlock = React.useMemo(() => {
    const defaultVatTypeId = selectedBlockForDefaults?.default_vat_type;
    if (defaultVatTypeId) {
      const found = (vatTypes || []).find((vatType) => vatType.id === defaultVatTypeId);
      if (found) return found;
    }
    return (vatTypes || [])[0] || null;
  }, [selectedBlockForDefaults, vatTypes]);

  // Dynamically add/update negative lines per selected advance on FINAL invoices
  React.useEffect(() => {
    const invCat = watch('invoice_category');
    const items = watch('items') || [];

    // Remove all auto advance lines if not FINAL
    if (invCat !== 'FINAL') {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i] && items[i].__isAdvanceDeduction) remove(i);
      }
      return;
    }

    // Compute gross total of non-advance items
    const nonAdvGross = items
      .filter(it => !(it && it.__isAdvanceDeduction))
      .reduce((sum, it) => {
        const q = parseFloat(it?.quantity ?? 0) || 0;
        const p = parseFloat(it?.unit_price ?? 0) || 0;
        const r = parseFloat(it?.vat_rate ?? 0) || 0;
        const gross = q * p * (1 + (r / 100));
        return sum + gross;
      }, 0);

    // Selected advances in oldest-first order
    const selectedIds = Object.entries(selectedAdvances).filter(([, v]) => v).map(([k]) => k);
    const selectedList = (openAdvances || [])
      .filter(a => selectedIds.includes(a.id))
      .sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date));

    let remainingToDeduct = Math.max(0, nonAdvGross);

    // Build/update a map: advanceId -> required deduction amount
    const plan = new Map();
    for (const a of selectedList) {
      if (remainingToDeduct <= 0) { plan.set(a.id, 0); continue; }
      const rem = Number(a.remaining) || 0;
      const take = Math.min(rem, remainingToDeduct);
      plan.set(a.id, take);
      remainingToDeduct -= take;
    }

    // Update existing auto lines and collect which advances are present
    const present = new Set();
    const toRemove = [];
    items.forEach((it, idx) => {
      if (!it || !it.__isAdvanceDeduction) return;
      const advId = it.__advanceId;
      const planned = plan.has(advId) ? (plan.get(advId) || 0) : 0;
      if (!advId || !plan.has(advId) || planned <= 0) {
        // this auto line no longer needed, mark for removal
        toRemove.push(idx);
        return;
      }
      present.add(advId);
      const amount = planned;
      const adv = (openAdvances || []).find(a => a.id === advId);
      const advVatRate = adv?.vat_rate ?? 0;
      const vatRate = advVatRate / 100;
      const netDeduct = amount / (1 + vatRate);
      const target = -Math.round(netDeduct * 100) / 100;
      const curPrice = parseFloat(it.unit_price ?? 0) || 0;
      const targetDesc = `Előleg beszámítás — ${(selectedList.find(a => a.id === advId)?.invoice_number) || ''}`.trim();
      if (curPrice !== target || it.description !== targetDesc || it.vat_rate !== advVatRate) {
        setValue(`items.${idx}.description`, targetDesc);
        setValue(`items.${idx}.quantity`, 1);
        setValue(`items.${idx}.unit_price`, target);
        setValue(`items.${idx}.vat_rate`, advVatRate);
        setValue(`items.${idx}.unit_of_measure`, 'db');
        setValue(`items.${idx}.nature_indicator`, 'SERVICE');
        try { items[idx].__isAdvanceDeduction = true; items[idx].__advanceId = advId; } catch {}
      }
    });

    // Remove marked auto lines (from the end to keep indexes valid)
    if (toRemove.length) {
      toRemove.sort((a,b)=>b-a).forEach(i => remove(i));
    }

    // Append missing auto lines for advances in plan but not present
    for (const [advId, amount] of plan.entries()) {
      if (present.has(advId)) continue;
      if (!amount || amount <= 0) continue;
      const adv = (openAdvances || []).find(a => a.id === advId);
      const desc = `Előleg beszámítás — ${adv?.invoice_number || ''}`.trim();
      // Use the VAT rate from the advance invoice if available
      const advVatRate = adv?.vat_rate ?? 0;
      const vatRate = advVatRate / 100;
      const netDeduct = (amount || 0) / (1 + vatRate);
      const unit = -Math.round(netDeduct * 100) / 100;
      const autoItem = {
        description: desc,
        quantity: 1,
        unit_price: unit,
        vat_rate: advVatRate,
        unit_of_measure: 'db',
        nature_indicator: 'SERVICE',
        __isAdvanceDeduction: true,
        __advanceId: advId,
      };
      append(autoItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAdvances, openAdvances, watch('invoice_category'), watch('items')]);

  // Map vat_type_id for items with vat_rate but no vat_type_id (auto advance lines, ERP imports, etc.)
  React.useEffect(() => {
    if (!Array.isArray(vatTypes) || !vatTypes.length) return;
    const sameRate = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) < 0.0001;
    const pickVatTypeByRate = (rate) => {
      const percentExact = vatTypes.find(v => v.category === 'PERCENT' && sameRate(v.percentage, rate));
      if (percentExact) return percentExact;
      if (sameRate(rate, 0)) {
        const zeroAny = vatTypes.find(v => sameRate(v.percentage, 0));
        if (zeroAny) return zeroAny;
      }
      return null;
    };
    const items = watch('items') || [];
    items.forEach((it, idx) => {
      if (!it) return;
      const rate = Number(it?.vat_rate ?? 0);
      const current = it.vat_type_id ? vatTypes.find(v => v.id === it.vat_type_id) : null;
      const currentRate = (current && current.category === 'PERCENT') ? Number(current.percentage || 0) : null;
      if (!current || currentRate === null || !sameRate(currentRate, rate)) {
        const match = pickVatTypeByRate(rate);
        if (match && match.id !== it.vat_type_id) {
          setValue(`items.${idx}.vat_type_id`, match.id, { shouldDirty: true, shouldValidate: false });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatTypes, watch('items')]);

  // For ADVANCE invoices, automatically prefix item descriptions with "Előleg: "
  React.useEffect(() => {
    const invCat = watch('invoice_category');
    if (invCat !== 'ADVANCE') return;
    const items = watch('items') || [];
    const prefix = 'Előleg: ';
    items.forEach((it, idx) => {
      const desc = (it && typeof it.description === 'string') ? it.description : '';
      const trimmed = desc.trimStart();
      if (!trimmed.startsWith('Előleg:')) {
        setValue(`items.${idx}.description`, prefix + desc, { shouldDirty: true, shouldValidate: false });
        // mark as auto-prefixed to allow safe removal when leaving ADVANCE
        try {
          if (items[idx]) {
            items[idx].__autoAdvancePrefix = true;
            items[idx].__advanceBaseDesc = desc; // original content before prefix
          }
        } catch {}
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_category'), watch('items')]);

  // When leaving ADVANCE category, remove the automatic "Előleg: " prefix from item descriptions
  React.useEffect(() => {
    const invCat = watch('invoice_category');
    if (invCat === 'ADVANCE') return;
    const items = watch('items') || [];
    const re = /^\s*Előleg:\s*/;
    items.forEach((it, idx) => {
      const desc = (it && typeof it.description === 'string') ? it.description : '';
      const hadAuto = it && it.__autoAdvancePrefix;
      const base = (it && typeof it.__advanceBaseDesc === 'string') ? it.__advanceBaseDesc : '';
      if (re.test(desc) && hadAuto) {
        // Remove only if not modified beyond the auto prefix
        const after = desc.replace(re, '');
        if (after === base) {
          setValue(`items.${idx}.description`, after, { shouldDirty: true, shouldValidate: false });
        }
      }
      // clear flags regardless to avoid stale state
      try { if (items[idx]) { delete items[idx].__autoAdvancePrefix; delete items[idx].__advanceBaseDesc; } } catch {}
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_category')]);

  const onSubmit = (data) => {
    const round2 = (n) => {
      let x = parseFloat((n ?? '0').toString().replace(',', '.'));
      if (!isFinite(x)) return 0;
      return Math.round((Math.abs(x) + Number.EPSILON) * 100) / 100 * (x < 0 ? -1 : 1);
    };
    const items = data.items.map(item => ({
      description: item.description,
      quantity: round2(item.quantity),
      unit_price: round2(item.unit_price),
      vat_rate: parseFloat(item.vat_rate),
      vat_type_id: item.vat_type_id || undefined,
      vat_reason: item.vat_reason || undefined,
      unit_of_measure: item.unit_of_measure || 'db',
      nature_indicator: item.nature_indicator || 'PRODUCT',
      product_code_category: item.product_code_category || undefined,
      product_code_value: item.product_code_value || undefined,
    }));

    const currency = data.currency || 'HUF';
    const ex = typeof data.exchange_rate === 'number' && isFinite(data.exchange_rate)
      ? data.exchange_rate
      : 1;

    const invoiceData = {
      ...data,
      customer_id: data.customer_id,
      issue_date: data.issue_date ? [data.issue_date.getFullYear(), String(data.issue_date.getMonth()+1).padStart(2,'0'), String(data.issue_date.getDate()).padStart(2,'0')].join('-') : null,
      due_date: data.due_date ? [data.due_date.getFullYear(), String(data.due_date.getMonth()+1).padStart(2,'0'), String(data.due_date.getDate()).padStart(2,'0')].join('-') : null,
      delivery_date: data.delivery_date ? [data.delivery_date.getFullYear(), String(data.delivery_date.getMonth()+1).padStart(2,'0'), String(data.delivery_date.getDate()).padStart(2,'0')].join('-') : null,
      items,
      company_id: data.company_id || undefined,
      currency,
      exchange_rate: ex,
      notes: normalizeNotesHtml(data.notes || ''),
    };

    if (isIncomingManual && !String(data.invoice_number || '').trim()) {
      toast.error('A számlaszám megadása kötelező.');
      return;
    }

    // If creating a new invoice and an invoice block is selected, send it for auto-number generation
    if (!isIncomingManual && !isEdit && data.invoice_block_id) {
      invoiceData.invoice_block_id = data.invoice_block_id;
      // Let backend generate invoice_number; remove any manually set value
      delete invoiceData.invoice_number;
    }

    if (isIncomingManual) {
      const manualData = {
        invoice_number: String(data.invoice_number || '').trim(),
        customer_id: data.customer_id,
        company_id: data.company_id || undefined,
        issue_date: invoiceData.issue_date,
        due_date: invoiceData.due_date,
        delivery_date: invoiceData.delivery_date,
        currency: invoiceData.currency,
        exchange_rate: invoiceData.exchange_rate,
        payment_method: data.payment_method,
        notes: invoiceData.notes || '',
        invoice_category: data.invoice_category || 'NORMAL',
        items: invoiceData.items,
      };
      createInvoiceMutation.mutate(manualData);
    } else if (isProforma) {
      const pfData = {
        proforma_number: data.invoice_number || undefined,
        company_id: invoiceData.company_id,
        customer_id: invoiceData.customer_id,
        issue_date: invoiceData.issue_date,
        due_date: invoiceData.due_date,
        delivery_date: invoiceData.delivery_date,
        currency: invoiceData.currency,
        payment_method: data.payment_method,
        notes: invoiceData.notes || '',
        items: invoiceData.items,
      };
      if (isEdit) updateInvoiceMutation.mutate(pfData); else createInvoiceMutation.mutate(pfData);
    } else {
      if (!isEdit && data.invoice_block_id) {
        invoiceData.invoice_block_id = data.invoice_block_id;
        delete invoiceData.invoice_number;
      }
      if (data.invoice_category === 'FINAL') {
        const ids = Object.entries(selectedAdvances).filter(([,v]) => v).map(([k]) => k);
        if (ids.length) {
          invoiceData.advance_invoice_ids = ids;
        }
      }
      // Include ERP order IDs if available
      if (erpOrderIdsRef.current && erpOrderIdsRef.current.length > 0) {
        invoiceData.erp_order_ids = erpOrderIdsRef.current;
      }
      if (isEdit) updateInvoiceMutation.mutate(invoiceData); else createInvoiceMutation.mutate(invoiceData);
    }
  };

  const buildScheduledTemplatePayload = (noteTemplateOverride = null, deliveryModeOverride = null, deliveryMonthDayOverride = null, deliveryYearDayOverride = null) => {
    const data = getValues();
    const items = (data.items || []).map((item) => ({
      description: item.description,
      quantity: Number(String(item.quantity || 0).replace(',', '.')) || 0,
      unit_price: Number(String(item.unit_price || 0).replace(',', '.')) || 0,
      vat_rate: Number(String(item.vat_rate || 0).replace(',', '.')) || 0,
      vat_type_id: item.vat_type_id || undefined,
      vat_reason: item.vat_reason || undefined,
      unit_of_measure: item.unit_of_measure || 'db',
      nature_indicator: item.nature_indicator || 'PRODUCT',
      product_code_category: item.product_code_category || undefined,
      product_code_value: item.product_code_value || undefined,
    }));

    return {
      customer_id: data.customer_id,
      company_id: data.company_id,
      invoice_block_id: data.invoice_block_id || undefined,
      currency: data.currency || 'HUF',
      exchange_rate: Number(data.exchange_rate || 1) || 1,
      payment_method: data.payment_method,
      invoice_category: data.invoice_category || 'NORMAL',
      invoice_appearance: data.invoice_appearance || 'ELECTRONIC',
      completeness_indicator: !!data.completeness_indicator,
      order_reference: data.order_reference || '',
      notes: noteTemplateOverride !== null ? normalizeNotesHtml(String(noteTemplateOverride || '')) : normalizeNotesHtml(data.notes || ''),
      use_delivery_date: !!data.delivery_date,
      delivery_mode: deliveryModeOverride || scheduleForm.deliveryMode || 'issue_offset',
      delivery_month_day: Number(deliveryMonthDayOverride ?? scheduleForm.deliveryMonthDay ?? 1) || 1,
      delivery_year_day: Number(deliveryYearDayOverride ?? scheduleForm.deliveryYearDay ?? 1) || 1,
      items,
    };
  };

  // Manual draft save/load helpers
  const loadManualDrafts = () => {
    try { return JSON.parse(localStorage.getItem(MANUAL_DRAFTS_KEY) || '[]'); } catch { return []; }
  };

  const saveDraft = () => {
    const values = getValues();
    const blocks = invoiceBlocks?.results || [];
    const block = blocks.find((b) => String(b.id) === String(values.invoice_block_id));
    const customer = customerRows.find((c) => c.id === values.customer_id) || null;
    const items = Array.isArray(values.items) ? values.items : [];
    const totalNet = items.reduce((acc, item) => {
      return acc + (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    }, 0);
    const toISO = (d) => {
      if (!d) return null;
      if (d instanceof Date) {
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`; // local date, avoids UTC-offset shift
      }
      return d || null;
    };
    const draft = {
      id: Date.now(),
      savedAt: new Date().toISOString(),
      customer_name: customer?.name || '—',
      invoice_block_name: block ? `${block.name} (${block.prefix})` : '—',
      currency: values.currency || 'HUF',
      total_net: totalNet,
      formData: {
        customer_id: values.customer_id || '',
        company_id: values.company_id || '',
        invoice_block_id: values.invoice_block_id || '',
        issue_date: toISO(values.issue_date),
        due_date: toISO(values.due_date),
        delivery_date: toISO(values.delivery_date),
        currency: values.currency || 'HUF',
        exchange_rate: values.exchange_rate ?? 1,
        payment_method: values.payment_method || 'transfer',
        invoice_category: values.invoice_category || 'SIMPLIFIED',
        invoice_appearance: values.invoice_appearance || 'ELECTRONIC',
        payment_date: toISO(values.payment_date),
        completeness_indicator: !!values.completeness_indicator,
        order_reference: values.order_reference || '',
        notes: values.notes || '',
        items,
      },
    };
    const existing = loadManualDrafts();
    existing.push(draft);
    try { localStorage.setItem(MANUAL_DRAFTS_KEY, JSON.stringify(existing)); } catch {}
    toast.success('Vázlat elmentve!');
  };

  const openDraftsModal = () => {
    setManualDrafts(loadManualDrafts());
    setDraftsModalOpen(true);
  };

  const loadDraftIntoForm = (draft) => {
    const reviveDate = (v) => {
      if (!v) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        const [y, mo, d] = String(v).split('-').map(Number);
        return new Date(y, mo - 1, d); // local midnight, avoids UTC-offset shift
      }
      return new Date(v);
    };
    const fd = draft.formData;
    if (fd.issue_date) setValue('issue_date', reviveDate(fd.issue_date));
    if (fd.due_date) setValue('due_date', reviveDate(fd.due_date));
    if ('delivery_date' in fd) setValue('delivery_date', reviveDate(fd.delivery_date));
    ['customer_id', 'company_id', 'invoice_block_id', 'currency', 'exchange_rate',
      'payment_method', 'invoice_category', 'invoice_appearance', 'payment_date',
      'completeness_indicator', 'order_reference', 'notes'].forEach((k) => {
      if (k in fd) setValue(k, fd[k]);
    });
    if (Array.isArray(fd.items) && fd.items.length) setValue('items', fd.items);
    setDraftsModalOpen(false);
    toast.success('Vázlat betöltve!');
  };

  const deleteManualDraft = (draftId) => {
    const next = loadManualDrafts().filter((d) => d.id !== draftId);
    try { localStorage.setItem(MANUAL_DRAFTS_KEY, JSON.stringify(next)); } catch {}
    setManualDrafts(next);
  };

  const openScheduleModal = async () => {
    const issueDate = watch('issue_date');
    const dueDate = watch('due_date');
    if (!watch('company_id') || !watch('customer_id') || !issueDate || !dueDate) {
      toast.error('Időzítéshez szükséges: cég, ügyfél, kelt és esedékesség.');
      return;
    }

    try {
      const companyId = watch('company_id');
      const customerId = watch('customer_id');
      const customerObj = customerRows.find((c) => String(c.id) === String(customerId));

      const [tplRes, contactsRes] = await Promise.all([
        emailTemplateAPI.list({ company_id: companyId }),
        contactAPI.getContacts({ customer_id: customerId, is_active: true }),
      ]);

      const templates = Array.isArray(tplRes?.data?.results) ? tplRes.data.results : (Array.isArray(tplRes?.data) ? tplRes.data : []);
      const options = templates.map((t) => ({ value: t.template_type, label: t.name || t.template_type }));
      if (!options.find((o) => o.value === 'invoice_send')) {
        options.unshift({ value: 'invoice_send', label: 'Számlaküldés' });
      }
      setScheduleTemplateOptions(options);

      const contacts = Array.isArray(contactsRes?.data?.results) ? contactsRes.data.results : (Array.isArray(contactsRes?.data) ? contactsRes.data : []);
      const contactEmails = contacts.map((c) => (c.email || '').trim()).filter(Boolean);
      setScheduleContactEmails(contactEmails);

      const defaultEmails = [];
      if (customerObj?.email) defaultEmails.push(customerObj.email.trim());
      contactEmails.forEach((mail) => defaultEmails.push(mail));
      const uniqueEmails = Array.from(new Set(defaultEmails.map((m) => m.toLowerCase()))).map((m) => {
        const original = defaultEmails.find((x) => x.toLowerCase() === m);
        return original || m;
      });

      setScheduleForm((prev) => ({
        ...prev,
        startIssueDate: scheduleDateToStr(issueDate),
        deliveryMode: prev.deliveryMode || 'issue_offset',
        deliveryMonthDay: Number(prev.deliveryMonthDay || 1),
        deliveryYearDay: Number(prev.deliveryYearDay || 1),
        notesTemplate: String(watch('notes') || ''),
        approvalRequired: prev.approvalRequired,
        autoSendEmail: prev.autoSendEmail,
        emailTemplateType: prev.emailTemplateType || 'invoice_send',
        extraEmails: uniqueEmails.join(', '),
      }));
      setScheduleModalOpen(true);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Időzítés modal betöltése sikertelen');
    }
  };

  const saveScheduledInvoice = async () => {
    const issueDate = watch('issue_date');
    const dueDate = watch('due_date');
    const deliveryDate = watch('delivery_date');
    const companyId = watch('company_id');
    const customerId = watch('customer_id');
    if (!companyId || !customerId || !issueDate || !dueDate) {
      toast.error('Hiányzó alapadatok az időzítés mentéséhez.');
      return;
    }

    const payload = {
      company_id: companyId,
      customer_id: customerId,
      invoice_block_id: watch('invoice_block_id') || undefined,
      start_issue_date: scheduleForm.startIssueDate || scheduleDateToStr(issueDate),
      next_issue_date: scheduleForm.startIssueDate || scheduleDateToStr(issueDate),
      schedule_mode: scheduleForm.scheduleMode,
      interval_unit: scheduleForm.intervalUnit,
      interval_value: Number(scheduleForm.intervalValue || 1),
      weekday: scheduleForm.scheduleMode === 'weekday' ? Number(scheduleForm.weekday || 0) : undefined,
      month_day: scheduleForm.scheduleMode === 'monthday' ? Number(scheduleForm.monthDay || 1) : undefined,
      month_last_day: !!scheduleForm.monthLastDay,
      due_offset_days: scheduleDiffDays(issueDate, dueDate),
      delivery_offset_days: deliveryDate ? scheduleDiffDays(issueDate, deliveryDate) : 0,
      approval_required: !!scheduleForm.approvalRequired,
      auto_send_email: !!scheduleForm.autoSendEmail,
      email_template_type: scheduleForm.emailTemplateType || 'invoice_send',
      extra_emails: String(scheduleForm.extraEmails || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      first_invoice: !!scheduleForm.firstInvoice,
      template_payload: buildScheduledTemplatePayload(
        scheduleForm.notesTemplate,
        scheduleForm.deliveryMode,
        scheduleForm.deliveryMonthDay,
        scheduleForm.deliveryYearDay
      ),
      is_active: true,
    };

    setScheduleSaving(true);
    try {
      let res;
      if (editingScheduledId) {
        res = await invoiceAPI.updateScheduledInvoice(editingScheduledId, payload);
      } else {
        res = await invoiceAPI.createScheduledInvoice(payload);
        if (res?.data?.id) setEditingScheduledId(res.data.id);
      }

      const invoiceNo = res?.data?.created_invoice_number;
      if (invoiceNo) toast.success(`Időzítés mentve, első számla kiállítva: ${invoiceNo}`);
      else toast.success('Időzítés mentve');

      setScheduleModalOpen(false);
      setScheduleForm((prev) => ({ ...prev, firstInvoice: false }));
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Időzítés mentése sikertelen');
    } finally {
      setScheduleSaving(false);
    }
  };

  useEffect(() => {
    const loadScheduledTemplate = async () => {
      if (!scheduledEditIdFromQuery || isEdit || isIncomingManual || isProforma) return;
      try {
        const res = await invoiceAPI.getScheduledInvoiceTemplate(scheduledEditIdFromQuery);
        const data = res?.data || {};
        const payload = data.template_payload || {};
        if (payload.company_id) setValue('company_id', payload.company_id);
        if (payload.customer_id) setValue('customer_id', payload.customer_id);
        if (payload.invoice_block_id) setValue('invoice_block_id', payload.invoice_block_id);
        if (payload.currency) setValue('currency', payload.currency);
        if (typeof payload.exchange_rate !== 'undefined') setValue('exchange_rate', payload.exchange_rate);
        if (payload.payment_method) setValue('payment_method', payload.payment_method);
        if (payload.invoice_category) setValue('invoice_category', payload.invoice_category);
        if (payload.invoice_appearance) setValue('invoice_appearance', payload.invoice_appearance);
        if (payload.order_reference) setValue('order_reference', payload.order_reference);
        if (typeof payload.completeness_indicator !== 'undefined') setValue('completeness_indicator', !!payload.completeness_indicator);
        if (payload.notes) setValue('notes', payload.notes);
        if (Array.isArray(payload.items) && payload.items.length) setValue('items', payload.items);

        if (data.next_issue_date) {
          const base = new Date(data.next_issue_date);
          if (!Number.isNaN(base.getTime())) {
            setValue('issue_date', base);
            setValue('due_date', new Date(base.getTime() + Number(data.due_offset_days || 0) * 24 * 3600 * 1000));
            if (payload.use_delivery_date) {
              const mode = payload.delivery_mode || 'issue_offset';
              if (mode === 'next_month_day') {
                const monthDay = Math.max(1, Math.min(31, Number(payload.delivery_month_day || 1)));
                const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
                const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
                setValue('delivery_date', new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(monthDay, lastDay)));
              } else if (mode === 'next_year_day') {
                const yearDay = Math.max(1, Math.min(366, Number(payload.delivery_year_day || 1)));
                const nextYearFirst = new Date(base.getFullYear() + 1, 0, 1);
                nextYearFirst.setDate(nextYearFirst.getDate() + (yearDay - 1));
                setValue('delivery_date', nextYearFirst);
              } else {
                setValue('delivery_date', new Date(base.getTime() + Number(data.delivery_offset_days || 0) * 24 * 3600 * 1000));
              }
            } else {
              setValue('delivery_date', null);
            }
          }
        }

        setScheduleForm((prev) => ({
          ...prev,
          startIssueDate: data.next_issue_date || prev.startIssueDate,
          scheduleMode: data.schedule_mode || prev.scheduleMode,
          intervalUnit: data.interval_unit || prev.intervalUnit,
          intervalValue: Number(data.interval_value || prev.intervalValue || 1),
          weekday: Number(data.weekday ?? prev.weekday ?? 0),
          monthDay: Number(data.month_day ?? prev.monthDay ?? 1),
          monthLastDay: !!data.month_last_day,
          deliveryMode: payload.delivery_mode || prev.deliveryMode || 'issue_offset',
          deliveryMonthDay: Number(payload.delivery_month_day ?? prev.deliveryMonthDay ?? 1),
          deliveryYearDay: Number(payload.delivery_year_day ?? prev.deliveryYearDay ?? 1),
          notesTemplate: String(payload.notes || ''),
          approvalRequired: !!data.approval_required,
          autoSendEmail: !!data.auto_send_email,
          emailTemplateType: data.email_template_type || 'invoice_send',
          extraEmails: Array.isArray(data.extra_emails) ? data.extra_emails.join(', ') : '',
          firstInvoice: false,
        }));
        setEditingScheduledId(data.id || scheduledEditIdFromQuery);
        toast.info('Időzítés szerkesztési mód betöltve');
      } catch (e) {
        toast.error(e?.response?.data?.error || 'Időzített sablon betöltése sikertelen');
      }
    };
    loadScheduledTemplate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduledEditIdFromQuery, isEdit, isIncomingManual, isProforma]);

  const totals = calculateTotals();
  const isSimplified = (watch('invoice_category') || 'SIMPLIFIED') === 'SIMPLIFIED';

  // Normalize decimal separator: allow both "," and "." as input
  const normalizeInput = (e) => {
    if (e && e.target && typeof e.target.value === 'string') {
      e.target.value = e.target.value.replace(',', '.');
    }
  };

  const sanitizeRichTextHtml = (rawValue) => {
    const html = String(rawValue || '');
    if (!html) return '';

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((node) => node.remove());

      doc.querySelectorAll('*').forEach((node) => {
        Array.from(node.attributes || []).forEach((attr) => {
          const attrName = String(attr.name || '').toLowerCase();
          const attrValue = String(attr.value || '').trim().toLowerCase();
          if (attrName.startsWith('on')) {
            node.removeAttribute(attr.name);
            return;
          }
          if ((attrName === 'href' || attrName === 'src') && /^javascript:/i.test(attrValue)) {
            node.removeAttribute(attr.name);
          }
        });
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  };

  const normalizeNotesHtml = (rawValue) => {
    const cleaned = sanitizeRichTextHtml(rawValue);
    if (!cleaned) return '';
    const plain = cleaned
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .trim();
    return plain ? cleaned : '';
  };

  // Helper to get string value for controlled text inputs without forcing Number conversion
  const getItemStr = (idx, key, fallbackNumber) => {
    try {
      const v = watch(`items.${idx}.${key}`);
      if (v !== undefined && v !== null && v !== '') return String(v);
    } catch {}
    if (fallbackNumber === undefined || fallbackNumber === null || Number.isNaN(fallbackNumber)) return '';
    return String(fallbackNumber);
  };

  // Utility for accent-insensitive search in customer selector
  const normalize = (str) => (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const customerOptions = [...customerRows]
    .sort((a, b) => {
      const au = Number(customerUsage[String(a?.id)] || 0);
      const bu = Number(customerUsage[String(b?.id)] || 0);
      if (au !== bu) return bu - au;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'hu-HU', { sensitivity: 'base' });
    })
    .map(c => {
      const overdueLevel = overdueCustomerMap[c.id];
      return {
        value: c.id,
        label: `${c.name} (${c.tax_number})`,
        _norm: normalize(`${c.name} ${c.tax_number}`),
        _usage: Number(customerUsage[String(c?.id)] || 0),
        _overdueLevel: overdueLevel || null,
      };
    });

  const formatCustomerOption = (opt) => {
    if (!opt?._overdueLevel) return <span>{opt.label}</span>;
    if (opt._overdueLevel === 'post_reminder_1') {
      return <span style={{ background: '#1a1a1a', color: '#e53935', padding: '1px 4px', borderRadius: 2 }}>{opt.label}</span>;
    }
    return <span style={{ color: '#e53935' }}>{opt.label}</span>;
  };

  const companyOptions = (companies?.results || []).map(c => ({ value: c.id, label: c.name }));
  const blockOptions = (invoiceBlocks?.results || []).map(b => ({ value: b.id, label: `${b.name} (${b.prefix})` }));
  // VAT types already initialized above

  // Ensure default VAT on new invoice when VAT types are available (from block, fallback: first active VAT type)
  React.useEffect(() => {
    if (isEdit) return;
    if (!defaultVatTypeForBlock) return;
    const items = watch('items') || [];
    let changed = false;
    items.forEach((it, idx) => {
      if (!it?.vat_type_id) {
        setValue(`items.${idx}.vat_type_id`, defaultVatTypeForBlock.id, { shouldValidate: false, shouldDirty: true });
        setValue(`items.${idx}.vat_rate`, Number(defaultVatTypeForBlock.percentage || 0), { shouldValidate: false, shouldDirty: true });
        changed = true;
      }
    });
    if (changed) {
      // trigger recalculation visuals
      try { setTimeout(() => {}, 0); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVatTypeForBlock]);

  // VAT type usage counters for prioritizing Top 5
  const getUsage = () => {
    try { return JSON.parse(localStorage.getItem('vatTypeUsage') || '{}'); } catch { return {}; }
  };
  const bumpUsage = (id) => {
    try {
      const map = getUsage();
      map[id] = (map[id] || 0) + 1;
      localStorage.setItem('vatTypeUsage', JSON.stringify(map));
    } catch {}
  };

  const vatTypeOptions = React.useMemo(() => {
    const all = (vatTypes || []).map(v => ({
      value: v.id,
      label: v.code,
      _code: v.code,
      _name: v.name,
      _full: `${v.code} ${v.name}${v.percentage != null ? ` (${v.percentage}%)` : ''}`
    }));
    if (!all.length) return { groups: [], flat: [] };
    const usage = getUsage();
    const top = [...all].sort((a,b)=> (usage[b.value]||0)-(usage[a.value]||0)).slice(0,5);
    // If no usage yet, prefer common ones by code
    if (!Object.keys(usage).length) {
      const pref = ['27','AAM','TAM','5','0'];
      const seen = new Set();
      const topInit = [];
      pref.forEach(code => { const found = all.find(o=>o._code===code); if (found) { topInit.push(found); seen.add(found.value); } });
      // fill up to 5
      all.forEach(o=> { if (topInit.length<5 && !seen.has(o.value)) topInit.push(o); });
      return { groups: [ { label: 'Gyakori', options: topInit }, { label: 'Összes', options: all } ], flat: all };
    }
    return { groups: [ { label: 'Gyakori', options: top }, { label: 'Összes', options: all } ], flat: all };
  }, [vatTypes]);

  // VAT help modal state and content
  const [showVatHelp, setShowVatHelp] = React.useState(false);
  const vatHelp = [
    { code: 'AAM', ref: 'XIII. fejezet', text: 'A számla kibocsátója alanyi mentességet választott és a mentesség használatára jogosult (nem érte el a jogszabályi értékhatárt).' },
    { code: 'TAM', ref: '85. §, 86. §', text: 'Az értékesítés a tevékenység közérdekű jellegére vagy egyéb sajátos jellegére tekintettel mentes az adó alól. Például adómentes oktatás, egészségügyi szolgáltatás.' },
    { code: 'KBAET', ref: '89. §', text: 'Közösség másik tagállamában regisztrált adóalany számára történt termékértékesítés, amennyiben a termék az adott tagállamba került elszállításra. Új közlekedési eszköz esetén lásd: KBAUK. A vevő közösségi adószáma kötelező a számlán.' },
    { code: 'KBAUK', ref: '89. § (2)', text: 'Új közlekedési eszköz másik tagállamba történő értékesítése. A vevő lehet magánszemély is, ezért közösségi adószám nem feltétlenül jelenik meg. A 259. § 25. pont adatai kötelezők.' },
    { code: 'EAM', ref: '98–109. §', text: 'Belföldön teljesített termékértékesítés, melynek következményeként a terméket kiléptetik harmadik országba (export). Ide tartozhat nemzetközi szerződésen alapuló adómentesség is.' },
    { code: 'NAM', ref: '93–95. §, 110–118. §', text: 'Jogszabály által felsorolt adómentes esetek (pl. adómentes közvetítői tevékenység, nemzetközi forgalomhoz kapcsolódó egyes tevékenységek). NAV Online Számla 123. oldal.' },
    { code: 'ATK', ref: '2–3. §', text: 'Tárgyi hatályon kívüli ügyletekre nem kötelező számlát kiállítani, de számlán lehet ATK tétel (pl. kártérítés, közhatalmi tevékenység, közcélú adomány).' },
    { code: 'EUFAD37', ref: '37. § (1)', text: 'Adóalanynak nyújtott szolgáltatás, ahol a teljesítési hely a vevő letelepedése/lakóhelye szerint más tagállamban van. Kötelező a vevő közösségi adószáma és összesítő nyilatkozat.' },
    { code: 'EUFADE', ref: '—', text: 'Másik tagállamban teljesített fordítottan adózó ügylet, amelynél a teljesítési hely nem a 37. § (1) alapján dől el (pl. szereléshez kötött értékesítés). Magyar bejelentkezés nem szükséges.' },
    { code: 'EUE', ref: '—', text: 'EU‑ban teljesített olyan ügylet, amely után nem a vevő terheli az adófizetés (nem esik EUFAD37/EUFADE alá).' },
    { code: 'HO', ref: '—', text: 'Az Áfa tv. szerinti teljesítési hely EU‑n kívül van (pl. harmadik országban teljesített szolgáltatás, harmadik országbeli ingatlanhoz kapcsolódó ügylet).' },
    { code: 'REFUNDABLE_VAT', ref: '11. §, 14. §', text: 'Ellenérték fejében végzettnek minősülő ingyenes átadás/nyújtás (pl. szállodai szolgáltatás ingyen az ügyvezető családjának). Az adóalanynak fizetendő áfát kell megállapítania.' },
    { code: 'NONREFUNDABLE_VAT', ref: '11. §, 14. §', text: 'Mint a fenti eset, de a kedvezményezett szerződésben vállalja az áfa megtérítését az adóalany felé.' },
  ];

  // If we were redirected back from new customer page with a selected customer, preselect it
  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);
      const cid = sp.get('customer_id');
      if (cid) setValue('customer_id', cid);
    } catch {}
  }, [location.search, setValue]);

  // Load draft data from URL parameter or localStorage if 'erp_data'/'erp_from_storage' is present (ERP integration)
  React.useEffect(() => {
    try {
      const sp = new URLSearchParams(location.search);

      // Prevent double loading
      if (hasERPDataRef.current) return;

      let draft = null;

      // New: localStorage approach (avoids Request-URI Too Long with many items)
      if (sp.get('erp_from_storage') === '1') {
        const raw = localStorage.getItem('erp_invoice_payload');
        if (raw) {
          localStorage.removeItem('erp_invoice_payload');
          draft = JSON.parse(raw);
        }
      } else {
        // Legacy: URL parameter approach
        const erpData = sp.get('erp_data');
        if (!erpData) return;
        draft = JSON.parse(decodeURIComponent(atob(erpData)));
      }

      if (!draft) return;
      hasERPDataRef.current = true;
      
      // Set customer data if provided
      if (draft.customer) {
        console.log('[ERP] Customer data:', draft.customer);
        // Try to find customer by tax_number
        if (draft.customer.tax_number) {
          customerAPI.getCustomers({ page_size: 5000, company_id: selectedCompanyId || undefined }).then(response => {
            console.log('[ERP] Searching for tax_number:', draft.customer.tax_number);
            
            // Normalize tax numbers for comparison (remove dashes and spaces)
            const normalizeTaxNumber = (tax) => (tax || '').replace(/[-\s]/g, '');
            const searchTax = normalizeTaxNumber(draft.customer.tax_number);
            // For domestic customers, use first 8 digits
            const searchTaxTrunk = searchTax.substring(0, 8);
            
            const customer = response.data.results.find(c => {
              const customerTax = normalizeTaxNumber(c.tax_number);
              const customerTaxTrunk = customerTax.substring(0, 8);
              return customerTaxTrunk === searchTaxTrunk;
            });
            
            if (customer) {
              console.log('[ERP] Customer found:', customer);
              setValue('customer_id', customer.id);
            } else {
              console.log('[ERP] Customer NOT found with tax_number:', draft.customer.tax_number);
              console.log('[ERP] Will query NAV and create customer if needed');
              
              // Query NAV for company info
              utilsAPI.queryTaxNumber(searchTaxTrunk).then(navResponse => {
                console.log('[ERP] NAV response:', navResponse);
                if (navResponse.data && navResponse.data.taxpayer) {
                  // Create customer from NAV data
                  const navData = navResponse.data.taxpayer;
                  const newCustomerData = {
                    name: navData.taxpayerName || draft.customer.name,
                    tax_number: navData.taxpayerShortName ? `${searchTaxTrunk}-${navData.taxpayerShortName}` : draft.customer.tax_number,
                    city: navData.taxpayerAddress?.city || draft.customer.city,
                    postal_code: navData.taxpayerAddress?.postalCode || draft.customer.postal_code,
                    address: navData.taxpayerAddress?.streetName ? 
                      `${navData.taxpayerAddress.streetName} ${navData.taxpayerAddress.number || ''}`.trim() : 
                      draft.customer.address,
                  };
                  
                  console.log('[ERP] Creating customer from NAV data:', newCustomerData);
                  customerAPI.createCustomer(newCustomerData).then(createResp => {
                    console.log('[ERP] Customer created:', createResp.data);
                    setValue('customer_id', createResp.data.id);
                  }).catch(createErr => {
                    console.error('[ERP] Error creating customer:', createErr);
                    toast.error('Hiba az ügyfél létrehozásakor');
                  });
                } else {
                  // NAV didn't return data, use ERP data
                  console.log('[ERP] NAV returned no data, using ERP data');
                  const newCustomerData = {
                    name: draft.customer.name,
                    tax_number: draft.customer.tax_number,
                    city: draft.customer.city || '',
                    postal_code: draft.customer.postal_code || '',
                    address: draft.customer.address || '',
                  };
                  
                  console.log('[ERP] Creating customer from ERP data:', newCustomerData);
                  customerAPI.createCustomer(newCustomerData).then(createResp => {
                    console.log('[ERP] Customer created:', createResp.data);
                    setValue('customer_id', createResp.data.id);
                  }).catch(createErr => {
                    console.error('[ERP] Error creating customer:', createErr);
                    toast.error('Hiba az ügyfél létrehozásakor');
                  });
                }
              }).catch(navErr => {
                console.error('[ERP] NAV query error:', navErr);
                // NAV error, use ERP data
                const newCustomerData = {
                  name: draft.customer.name,
                  tax_number: draft.customer.tax_number,
                  city: draft.customer.city || '',
                  postal_code: draft.customer.postal_code || '',
                  address: draft.customer.address || '',
                };
                
                console.log('[ERP] Creating customer from ERP data (NAV failed):', newCustomerData);
                customerAPI.createCustomer(newCustomerData).then(createResp => {
                  console.log('[ERP] Customer created:', createResp.data);
                  setValue('customer_id', createResp.data.id);
                }).catch(createErr => {
                  console.error('[ERP] Error creating customer:', createErr);
                  toast.error('Hiba az ügyfél létrehozásakor');
                });
              });
            }
          }).catch((err) => {
            console.error('[ERP] Error fetching customers:', err);
          });
        }
      }
      
      // Set invoice items
      if (draft.items && Array.isArray(draft.items)) {
        console.log('[ERP] Setting items:', draft.items);
        // Use setTimeout to ensure form is ready, and replace to properly update field array
        setTimeout(() => {
          replace(draft.items);
          console.log('[ERP] Items set successfully with replace()');
        }, 100);
      }
      
      // Set notes
      if (draft.notes) {
        console.log('[ERP] Setting notes:', draft.notes);
        setValue('notes', draft.notes);
      }

      // Set delivery date (teljesítés dátuma) if provided — last delivery date from ERP
      if (draft.delivery_date) {
        console.log('[ERP] Setting delivery_date:', draft.delivery_date);
        const [y, mo, d] = String(draft.delivery_date).split('-').map(Number);
        setValue('delivery_date', new Date(y, mo - 1, d));
      }
      
      // Store ERP order IDs for callback after invoice creation
      if (draft.erp_order_ids && Array.isArray(draft.erp_order_ids)) {
        console.log('[ERP] Storing order IDs for callback:', draft.erp_order_ids);
        erpOrderIdsRef.current = draft.erp_order_ids;
      }
      
      // Always set issue_date to today for new invoices from ERP (draft may have loaded a stale date)
      setValue('issue_date', new Date());
      toast.success('Adatok betöltve az ERP-ből');
    } catch (e) {
      console.error('[ERP] Error loading draft from URL:', e);
      toast.error('Hiba az adatok betöltésekor: ' + e.message);
    }
  }, [location.search, setValue]);


  // Preview next invoice number on block change
  const [invoiceNumberPreview, setInvoiceNumberPreview] = React.useState('');
  React.useEffect(() => {
    const blockId = watch('invoice_block_id');
    if (!blockId) { setInvoiceNumberPreview(''); return; }
    (async () => {
      try {
        const { data } = await invoiceBlockAPI.previewNextNumber(blockId);
        setInvoiceNumberPreview(data.invoice_number || '');
      } catch (e) {
        setInvoiceNumberPreview('');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('invoice_block_id')]);

  // Auto-generate and preview next proforma number for new proformas
  React.useEffect(() => {
    if (!isProforma || isEdit) return;
    (async () => {
      try {
        const { data } = await proformaAPI.getNextNumber();
        const num = data.proforma_number || '';
        setInvoiceNumberPreview(num);
        setValue('invoice_number', num);
      } catch (e) {
        // ignore
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProforma, isEdit]);

  // Sync delivery_date default to issue_date if not set yet
  React.useEffect(() => {
    const issue = watch('issue_date');
    const deliv = watch('delivery_date');
    if (issue && !deliv) setValue('delivery_date', issue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('issue_date')]);

  // Compute due_date based on payment method and selected customer's due days (new invoices only)
  React.useEffect(() => {
    if (isEdit || isReadOnly) return;
    const issue = watch('issue_date');
    const method = watch('payment_method');
    const customerId = watch('customer_id');
    if (!issue) return;
    const issueDate = new Date(issue);
    const customersList = customerRows;
    const customer = customersList.find(c => c.id === customerId);
    if (!dirtyFields?.due_date) {
      if (method === 'transfer') {
        const days = (customer && (customer.payment_due_days ?? 8)) || 8;
        const due = new Date(issueDate);
        due.setDate(due.getDate() + days);
        setValue('due_date', due);
      } else {
        setValue('due_date', issueDate);
      }
    }
    
    // Set default currency from customer if available
    if (!dirtyFields?.currency && customer && customer.default_currency) {
      setValue('currency', customer.default_currency);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, watch('issue_date'), watch('payment_method'), watch('customer_id'), isEdit, isReadOnly, dirtyFields?.due_date, dirtyFields?.currency]);

  if (customersLoading || invoiceLoading) {
    return <LoadingSpinner>Betöltés...</LoadingSpinner>;
  }

  const currentPath = location.pathname + (location.search || '');

  // Data for printable invoice view
  const companiesList = (companies?.results || []);
  const snapshot = invoice?.print_snapshot || null;
  const selectedCompany = companiesList.find(c => c.id === selectedCompanyId) || snapshot?.company || invoice?.company || null;
  const selectedBlockValue = watch('invoice_block_id');
  const selectedBlock = (invoiceBlocks?.results || []).find(b => b.id === selectedBlockValue) || null;
  const customersList = customerRows;
  const selectedCustomerId = watch('customer_id');
  const selectedCustomer = customersList.find(c => c.id === selectedCustomerId) || snapshot?.customer || invoice?.customer || null;
  const invoiceNumberValue = isEdit ? (watch('invoice_number') || invoice?.invoice_number || snapshot?.invoice_number || '') : (invoiceNumberPreview || snapshot?.invoice_number || '');
  const toISODate = (d) => {
    try {
      if (!d) return '';
      const date = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(date.getTime())) return '';
      return date.toISOString().slice(0,10);
    } catch { return ''; }
  };
  const formatDateDisplay = (dateValue) => {
    try {
      if (!dateValue) return '—';
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return String(dateValue);
      return date.toLocaleDateString('hu-HU');
    } catch {
      return String(dateValue || '—');
    }
  };
  const issueDateStr = toISODate(watch('issue_date')) || (invoice?.issue_date || snapshot?.issue_date || '');
  const deliveryDateStr = toISODate(watch('delivery_date')) || (invoice?.delivery_date || snapshot?.delivery_date || issueDateStr || '');
  const dueDateStr = toISODate(watch('due_date')) || (invoice?.due_date || snapshot?.due_date || '');
  const currency = watch('currency') || invoice?.currency || snapshot?.currency || 'HUF';
  const exchangeRateValue = watch('exchange_rate') || invoice?.exchange_rate || snapshot?.exchange_rate || 1;
  const paymentMethod = watch('payment_method') || invoice?.payment_method || snapshot?.payment_method || 'transfer';
  const notesVal = watch('notes') || invoice?.notes || '';
  const notesHtml = normalizeNotesHtml(notesVal);
  
  // Rounding for HUF Cash payments
  let roundingDiff = 0;
  let payableAmount = totals.grossTotal;
  
  if (currency === 'HUF' && (paymentMethod === 'cash' || paymentMethod === 'cod')) {
    // Round to integer first to avoid float errors on .99999
    // Math.round is good for nearest integer for normal numbers.
    const rounded = Math.round(Math.round(payableAmount) / 5) * 5;
    roundingDiff = rounded - payableAmount;
    payableAmount = rounded;
  }

  const isRefund = payableAmount < 0;
  const payLabel = isRefund ? 'Visszatérítendő' : 'Fizetendő';
  const payAmountAbs = Math.abs(payableAmount);
  const paidAmountDisplay = Number(invoice?.amount_paid || snapshot?.amount_paid || 0);
  const settlementTolerance = String(currency || '').toUpperCase() === 'HUF' ? 5 : 0.01;
  const remainingDisplay = Math.max(payAmountAbs - paidAmountDisplay, 0);
  const isSettledDisplay = payAmountAbs > 0 && remainingDisplay < settlementTolerance;

  // Helpers: full tax number formatting
  const formatFullTax = (entity) => {
    if (!entity) return '';
    if (entity.full_tax_number) return entity.full_tax_number;
    if (entity.tax_number && entity.vat_code && entity.county_code) {
      return `${entity.tax_number}-${entity.vat_code}-${entity.county_code}`;
    }
    return entity.tax_number || '';
  };

  const pickPreferredTax = (primaryEntity, fallbackEntity) => {
    const primary = String(formatFullTax(primaryEntity) || '').trim();
    const fallback = String(formatFullTax(fallbackEntity) || '').trim();
    const isFull = (tax) => /^\d{8}-\d-\d{2}$/.test(String(tax || '').trim());
    if (isFull(primary)) return primary;
    if (isFull(fallback)) return fallback;
    return primary || fallback || '';
  };

  const formatTaxDisplay = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{8,9}-\d-\d{2}$/.test(raw)) return raw;
    const digits = raw.replace(/\D+/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 8)}-${digits.slice(8, 9)}-${digits.slice(9, 11)}`;
    }
    if (digits.length === 12) {
      return `${digits.slice(0, 9)}-${digits.slice(9, 10)}-${digits.slice(10, 12)}`;
    }
    return raw;
  };

  // Amount in words (Hungarian) — simplified
  const numberToHungarian = (n) => {
    const ones = ['', 'egy', 'kettő', 'három', 'négy', 'öt', 'hat', 'hét', 'nyolc', 'kilenc'];
    const tens = ['', 'tíz', 'húsz', 'harminc', 'negyven', 'ötven', 'hatvan', 'hetven', 'nyolcvan', 'kilencven'];
    const hundred = 'száz';

    const chunkToWords = (num) => {
      if (!num) return '';
      let s = '';
      const sz = Math.floor(num / 100);
      const t = Math.floor((num % 100) / 10);
      const o = num % 10;
      if (sz > 0) {
        if (sz === 1) s += hundred; // száz
        else if (sz === 2) s += 'kétszáz';
        else s += ones[sz] + hundred; // háromszáz, négyszáz, ...
      }
      if (t === 1) {
        // 10..19
        if (o === 0) s += 'tíz';
        else s += 'tizen' + ones[o];
        return s;
      }
      if (t === 2) {
        // 20..29
        if (o === 0) s += 'húsz';
        else s += 'huszon' + ones[o];
        return s;
      }
      if (t > 2) s += tens[t];
      if (o > 0 && t !== 1 && t !== 2) s += ones[o];
      return s;
    };

    const scaleWord = (count, singular) => {
      if (!count) return '';
      if (singular === 'ezer') {
        if (count === 1) return 'ezer';
        if (count === 2) return 'kétezer';
        return chunkToWords(count) + 'ezer';
      }
      // millió / milliárd
      if (count === 1) return 'egy' + singular; // egymillió / egymilliárd
      if (count === 2) return 'két' + singular; // kétmillió / kétmilliárd
      return chunkToWords(count) + singular;
    };

    if (n === 0) return 'nulla';
    const b = Math.floor(n / 1_000_000_000);
    const m = Math.floor((n % 1_000_000_000) / 1_000_000);
    const e = Math.floor((n % 1_000_000) / 1000);
    const r = n % 1000;
    const parts = [];
    if (b) parts.push(scaleWord(b, 'milliárd'));
    if (m) parts.push(scaleWord(m, 'millió'));
    if (e) parts.push(scaleWord(e, 'ezer'));
    if (r) parts.push(chunkToWords(r));
    // Hyphenate between magnitude groups per Hungarian writing (pl. ötezer-tizenegy)
    return parts.filter(Boolean).join('-');
  };
  const amountToWordsHU = (amount, curr) => {
    const abs = Math.abs(amount || 0);
    const whole = Math.floor(abs);
    const fraction = Math.round((abs - whole) * 100);
    const main = numberToHungarian(whole) + ' ' + (curr === 'HUF' ? 'forint' : curr);
    if (curr === 'HUF') {
      if (fraction > 0) {
        return `azaz ${main} ${numberToHungarian(fraction)} fillér`;
      }
      return `azaz ${main}`;
    }
    if (fraction > 0) {
      return `azaz ${main} és ${fraction} cent`;
    }
    return `azaz ${main}`;
  };

  const handleAddItem = () => {
    const defaultVatType = defaultVatTypeForBlock;
    append({
      description: '',
      quantity: 1,
      unit_price: 0,
      vat_rate: Number(defaultVatType?.percentage || 0),
      unit_of_measure: 'db',
      vat_type_id: defaultVatType ? defaultVatType.id : undefined
    });
  };

  const CSV_SAMPLE_HEADERS = 'Megnevezés,Mennyiség,Me. egység,ÁFA %,Nettó egységár';
  const CSV_SAMPLE_ROWS = [
    'Termék neve,1,db,27,10000',
    'Szolgáltatás,2,óra,27,5000',
    'Anyag,10,m,5,800',
  ];

  const handleDownloadSampleCsv = () => {
    const bom = '\uFEFF';
    const content = bom + [CSV_SAMPLE_HEADERS, ...CSV_SAMPLE_ROWS].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minta_tetelek.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        let text = evt.target.result;
        // Remove BOM if present
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) { toast.error('A CSV fájl legalább egy fejlécsort és egy adatsort kell tartalmazzon.'); return; }

        // Detect delimiter: semicolon or comma
        const delim = lines[0].includes(';') ? ';' : ',';

        // Parse header to find column indices (case-insensitive, accent-insensitive)
        const normalize = (s) => s.toLowerCase().replace(/[áéíóöőúüű]/g, (c) => ({á:'a',é:'e',í:'i',ó:'o',ö:'o',ő:'o',ú:'u',ü:'u',ű:'u'}[c] || c)).trim();
        const headers = lines[0].split(delim).map(normalize);
        const colIdx = {
          description: headers.findIndex(h => h === normalize('Megnevezés') || h === 'megnevezes' || h === 'nev' || h === normalize('Név') || h === 'description' || h === 'name'),
          quantity: headers.findIndex(h => h === normalize('Mennyiség') || h === 'mennyiseg' || h === 'qty' || h === 'quantity'),
          unit: headers.findIndex(h => h === normalize('Me. egység') || h === 'me. egyseg' || h === normalize('Mértékegység') || h === 'mertekegyseg' || h === 'unit' || h === 'unit_of_measure'),
          vat: headers.findIndex(h => h === normalize('ÁFA %') || h === 'afa %' || h === 'afa' || h === 'vat_rate' || h === 'vat' || h === 'afa_kulcs'),
          price: headers.findIndex(h => h === normalize('Nettó egységár') || h === 'netto egysegar' || h === 'egysegar' || h === 'unit_price' || h === 'netto ar' || h === normalize('Ár')),
        };

        if (colIdx.description === -1) { toast.error('A CSV-ben nem található "Megnevezés" oszlop.'); return; }

        const parseNum = (s) => {
          if (!s) return 0;
          // Handle Hungarian number format: 1.000,50 → 1000.50 or 1000,50 → 1000.50
          const cleaned = String(s).replace(/\s/g, '').replace(/\.(?=\d{3}[,\s]|$)/g, '').replace(',', '.');
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        };

        const defaultVatType = defaultVatTypeForBlock;
        let importedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          // Handle quoted fields
          const fields = [];
          let cur = '';
          let inQuote = false;
          for (const ch of lines[i]) {
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === delim && !inQuote) { fields.push(cur.trim()); cur = ''; }
            else { cur += ch; }
          }
          fields.push(cur.trim());

          const description = colIdx.description >= 0 ? (fields[colIdx.description] || '').replace(/^"|"$/g, '') : '';
          if (!description) continue;

          const quantity = colIdx.quantity >= 0 ? parseNum(fields[colIdx.quantity]) || 1 : 1;
          const unit_of_measure = colIdx.unit >= 0 ? (fields[colIdx.unit] || 'db').replace(/^"|"$/g, '') || 'db' : 'db';
          const vatPct = colIdx.vat >= 0 ? parseNum(fields[colIdx.vat]) : Number(defaultVatType?.percentage || 27);
          const unit_price = colIdx.price >= 0 ? parseNum(fields[colIdx.price]) : 0;

          // Find matching vat_type_id
          const matchedVatType = vatTypes?.find(v => Number(v.percentage) === vatPct);
          const vat_type_id = matchedVatType ? matchedVatType.id : (defaultVatType ? defaultVatType.id : undefined);

          append({ description, quantity, unit_price, vat_rate: vatPct, unit_of_measure, vat_type_id });
          importedCount++;
        }

        if (importedCount > 0) {
          toast.success(`${importedCount} tétel importálva a CSV-ből.`);
        } else {
          toast.warning('Nem sikerült tételt importálni. Ellenőrizd a CSV formátumát.');
        }
      } catch (err) {
        console.error('CSV import hiba:', err);
        toast.error('Hiba a CSV feldolgozásakor. Ellenőrizd a fájl formátumát.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  return (
    <>
      <style type="text/css" media="print">
        {`
          @page {
            @bottom-right {
              content: ${printPageContent};
              font-size: 8pt;
              font-family: sans-serif;
            }
          }
        `}
      </style>
      <div className="no-print">
        <FormContainer>
          <FormHeader>
        <HeaderLeft>
          <Title>{isIncomingManual ? (isIncomingManualEdit ? 'Kézi bejövő számla szerkesztése' : 'Új bejövő számla') : (isProforma ? (isEdit ? 'Díjbekérő megnyitása' : 'Új díjbekérő') : (isEdit ? (invoice?.invoice_number ? `Számla — ${invoice.invoice_number}` : 'Számla megnyitása') : 'Új számla'))}</Title>
          {isEdit && invoice?.status === 'nav_rejected' && !isReadOnly && (() => {
            const getNavErrMsg = (response) => {
              if (!response) return null;
              try {
                const match = response.match(/<(?:\w+:)?message>\s*(.*?)\s*<\/(?:\w+:)?message>/);
                if (match && match[1]) return match[1];
                if (response.length < 200) return response;
                return null;
              } catch { return null; }
            };
            const navMsg = getNavErrMsg(invoice.nav_response);
            return (
              <div style={{
                background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6,
                padding: '10px 14px', marginBottom: 8, marginTop: 4, color: '#856404', fontSize: 13
              }}>
                <strong>⚠ NAV elutasítás</strong> – A számla NAV által visszautasítva. Javítsd a hibát, majd küld el újra.
                {navMsg && <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>{navMsg}</div>}
                <div style={{ marginTop: 6, fontSize: 12, color: '#555' }}>
                  Tipp: Ha sortörés van a termék megnevezésben, azt a NAV nem fogadja el.
                  Mentés után az újraküldésnél automatikusan ki lesz javítva.
                </div>
              </div>
            );
          })()}
          {!isEdit && (
            <InlineHeaderGroup>
              {!isProforma && !isIncomingManual && (
                <CompactField>
                  <Controller
                    control={control}
                    name="invoice_block_id"
                    render={({ field }) => (
                      <ReactSelect
                        inputId="invoice_block_id"
                        options={blockOptions}
                        value={blockOptions.find(o => o.value === field.value) || null}
                        onChange={(opt) => field.onChange(opt ? opt.value : '')}
                        placeholder={'Számlatömb'}
                        isDisabled={!selectedCompanyId}
                        isClearable
                        styles={{
                          control: (base) => ({ ...base, minHeight: 32, height: 32 }),
                          valueContainer: (base) => ({ ...base, paddingTop: 0, paddingBottom: 0 }),
                          indicatorsContainer: (base) => ({ ...base, height: 32 }),
                          menu: (base) => ({ ...base, zIndex: 5 })
                        }}
                      />
                    )}
                  />
                </CompactField>
              )}
              <CompactField>
                <Input
                  id="invoice_number"
                  value={isIncomingManual ? (watch('invoice_number') || '') : (isEdit ? (watch('invoice_number') || '') : (invoiceNumberPreview || ''))}
                  disabled={!isIncomingManual && !isProforma}
                  readOnly={!isIncomingManual && !isProforma}
                  onChange={(isIncomingManual || (isProforma && !isEdit)) ? (e) => {
                    setInvoiceNumberPreview(e.target.value);
                    setValue('invoice_number', e.target.value, { shouldDirty: true, shouldValidate: true });
                  } : undefined}
                  placeholder={isIncomingManual ? 'Bejövő számla száma' : (isProforma ? 'Díjbekérő szám' : 'Számlaszám')}
                  title={isProforma && !isEdit ? 'Automatikusan generált szám — szükség esetén módosítható.' : (!isProforma && !isEdit && !isIncomingManual ? 'Előnézet — a végleges számlaszám mentéskor képződik.' : '')}
                  style={{ height: 32, padding: '6px 10px' }}
                />
              </CompactField>
              {selectedCompanyId && primaryCompanyBank && (
                <BankInfoPill title={`${primaryCompanyBank.bank_name || ''} ${primaryCompanyBank.iban || primaryCompanyBank.account_number || ''} ${primaryCompanyBank.swift_bic || ''} [${currency}]`.trim()}>
                  Bankszámla: {primaryCompanyBank.iban || primaryCompanyBank.account_number} [{currency}]
                </BankInfoPill>
              )}
            </InlineHeaderGroup>
          )}
        </HeaderLeft>

          <ButtonGroup>
            {!isProforma && !isEdit && (openAdvances || []).length > 0 && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setValue('invoice_category', 'FINAL');
                  const allSel = {};
                  (openAdvances || []).forEach(a => { allSel[a.id] = true; });
                  setSelectedAdvances(allSel);
                  // Scroll to the advances section
                  requestAnimationFrame(() => {
                    const el = document.getElementById('items-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                title="Végszámla készítése a nyitott előlegek felhasználásával"
              >
                Végszámla készítése
              </Button>
            )}
            {!isIncomingManual && !isProforma && !isEdit && (
              <Button
                variant="secondary"
                type="button"
                onClick={openScheduleModal}
              >
                <Clock3 size={16} />
                Időzítés
              </Button>
            )}
            {isIncomingManual && !isReadOnly && (
              <Button
                variant="secondary"
                type="button"
                onClick={() => incomingDocInputRef.current?.click()}
                disabled={parseIncomingDocumentMutation.isLoading || openingPendingPrefills}
                title="PDF/JPG számlakép feltöltése és mezők automatikus kitöltése"
              >
                <Upload size={16} />
                {parseIncomingDocumentMutation.isLoading || openingPendingPrefills ? 'Feldolgozás...' : 'Számlakép/PDF beolvasás'}
              </Button>
            )}
            {!isEdit && !isProforma && !isIncomingManual && (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={openDraftsModal}
                >
                  <Archive size={16} />
                  Vázlatok
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={saveDraft}
                  style={{ background: '#f59e0b', borderColor: '#d97706', color: '#fff' }}
                >
                  <BookmarkPlus size={16} />
                  Mentés vázlatként
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              onClick={() => navigate(backListPath)}
            >
              <ArrowLeft size={16} />
              Vissza
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => window.print()}
            >
              <FileText size={16} /> Nyomtatási kép
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit(onSubmit)}
              disabled={isReadOnly || createInvoiceMutation.isLoading || updateInvoiceMutation.isLoading || manualIncomingLoading}
            >
              <Save size={16} />
              {(isEdit || isIncomingManualEdit) ? 'Frissítés' : 'Mentés'}
            </Button>
          </ButtonGroup>
        </FormHeader>

        {isIncomingManual && (
          <div style={{ marginBottom: 12, color: '#6b7280', fontSize: 12, position: 'relative' }}>
            {incomingDocName ? (
              <>
                Kiválasztott fájl:{' '}
                {incomingDocUrl ? (
                  <a
                    href={incomingDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseEnter={() => setShowIncomingDocPreview(true)}
                    onMouseLeave={() => setShowIncomingDocPreview(false)}
                  >
                    {incomingDocName}
                  </a>
                ) : incomingDocName}
                {showIncomingDocPreview && incomingDocUrl && (
                  <div
                    style={{ position: 'absolute', zIndex: 20, marginTop: 6, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', cursor: 'zoom-in' }}
                    onMouseEnter={() => setShowIncomingDocPreview(true)}
                    onMouseLeave={() => setShowIncomingDocPreview(false)}
                    onClick={openIncomingDocInNewTab}
                    title="Kattintásra új lapon megnyitás"
                  >
                    {String(incomingDocName || '').toLowerCase().endsWith('.pdf') ? (
                      <iframe title="PDF preview" src={incomingDocUrl} style={{ width: 'min(760px, 70vw)', height: 'min(560px, 70vh)', border: 'none' }} />
                    ) : (
                      <img alt="preview" src={incomingDocUrl} style={{ maxWidth: 'min(760px, 70vw)', maxHeight: 'min(560px, 70vh)', display: 'block' }} />
                    )}
                  </div>
                )}
              </>
            ) : 'Tölts fel PDF vagy JPG számlaképet az automatikus mezőkitöltéshez.'}
            {pendingPrefillJobs.length > 0 && (
              <span style={{ marginLeft: 10 }}>
                ({pendingPrefillJobs.length} fájl várakozik)
                <button
                  type="button"
                  onClick={openAllPendingPrefills}
                  disabled={openingPendingPrefills}
                  style={{ marginLeft: 8, border: 'none', background: 'transparent', color: openingPendingPrefills ? '#9ca3af' : '#2563eb', cursor: openingPendingPrefills ? 'default' : 'pointer', padding: 0 }}
                >
                  Összes megnyitása
                </button>
              </span>
            )}
            {blockedPrefillTabs.length > 0 && (
              <span style={{ marginLeft: 10 }}>
                ({blockedPrefillTabs.length} blokkolt lap)
                <button
                  type="button"
                  onClick={retryBlockedPrefillTabs}
                  style={{ marginLeft: 8, border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer', padding: 0 }}
                >
                  Újrapróba
                </button>
              </span>
            )}
          </div>
        )}


      <form onSubmit={handleSubmit(onSubmit)}>
        <input
          ref={incomingDocInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          style={{ display: 'none' }}
          onChange={handleIncomingDocPick}
        />
        <fieldset disabled={isReadOnly || isStornoCreation} style={{ border: 'none', padding: 0, margin: 0 }}>
          {isStornoCreation && (
            <div style={{
              background: '#fff3cd', border: '1px solid #ffeeba', color: '#856404',
              padding: 10, borderRadius: 6, marginBottom: 12
            }}>
              Sztornó számla készítése — a mezők nem módosíthatók. Mentés után küldhető a NAV‑nak.
            </div>
          )}
        {showVatHelp && (
          <ModalBackdrop onClick={() => setShowVatHelp(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()}>
              <ModalHeader>
                <span>ÁFA típusok – Súgó</span>
                <IconGhostButton onClick={() => setShowVatHelp(false)} aria-label="Bezárás">
                  <X size={18} />
                </IconGhostButton>
              </ModalHeader>
              <ModalBody>
                {vatHelp.map(item => (
                  <HelpRow key={item.code}>
                    <HelpTitle>{item.code}</HelpTitle>
                    <HelpMeta>Áfa tv. hivatkozás: {item.ref || '—'}</HelpMeta>
                    <HelpText>{item.text}</HelpText>
                  </HelpRow>
                ))}
              </ModalBody>
            </ModalCard>
          </ModalBackdrop>
        )}
        {scheduleModalOpen && (
          <ModalBackdrop onClick={() => !scheduleSaving && setScheduleModalOpen(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
              <ModalHeader>
                <span>Időzítés</span>
                <IconGhostButton onClick={() => !scheduleSaving && setScheduleModalOpen(false)} aria-label="Bezárás">
                  <X size={18} />
                </IconGhostButton>
              </ModalHeader>
              <ModalBody>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <Label>Kezdő keltezés</Label>
                    <Input
                      type="date"
                      value={scheduleForm.startIssueDate || ''}
                      onChange={(e) => setScheduleForm((p) => ({ ...p, startIssueDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Gyakoriság</Label>
                    <Select
                      value={scheduleForm.scheduleMode}
                      onChange={(e) => setScheduleForm((p) => ({ ...p, scheduleMode: e.target.value }))}
                    >
                      <option value="interval">Idő alapú</option>
                      <option value="weekday">Minden hét adott napja</option>
                      <option value="monthday">Minden hónap adott napja</option>
                    </Select>
                  </div>

                  {scheduleForm.scheduleMode === 'interval' && (
                    <>
                      <div>
                        <Label>Ismétlés értéke</Label>
                        <Input
                          type="number"
                          min="1"
                          value={scheduleForm.intervalValue}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, intervalValue: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Mértékegység</Label>
                        <Select
                          value={scheduleForm.intervalUnit}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, intervalUnit: e.target.value }))}
                        >
                          <option value="day">naponta</option>
                          <option value="week">hetente</option>
                          <option value="month">havonta</option>
                          <option value="year">évente</option>
                        </Select>
                      </div>
                    </>
                  )}

                  {scheduleForm.scheduleMode === 'weekday' && (
                    <div style={{ gridColumn: '1 / span 2' }}>
                      <Label>Hét napja</Label>
                      <Select
                        value={scheduleForm.weekday}
                        onChange={(e) => setScheduleForm((p) => ({ ...p, weekday: Number(e.target.value) }))}
                      >
                        <option value={0}>Hétfő</option>
                        <option value={1}>Kedd</option>
                        <option value={2}>Szerda</option>
                        <option value={3}>Csütörtök</option>
                        <option value={4}>Péntek</option>
                        <option value={5}>Szombat</option>
                        <option value={6}>Vasárnap</option>
                      </Select>
                    </div>
                  )}

                  {scheduleForm.scheduleMode === 'monthday' && (
                    <>
                      <div>
                        <Label>Hónap napja</Label>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          disabled={scheduleForm.monthLastDay}
                          value={scheduleForm.monthDay}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, monthDay: e.target.value }))}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={!!scheduleForm.monthLastDay}
                            onChange={(e) => setScheduleForm((p) => ({ ...p, monthLastDay: e.target.checked }))}
                          />
                          Utolsó nap
                        </label>
                      </div>
                    </>
                  )}

                  <div style={{ gridColumn: '1 / span 2', borderTop: '1px solid #ecf0f1', paddingTop: 10, marginTop: 4 }}>
                    <Label>Teljesítés ütemezése</Label>
                    <Select
                      value={scheduleForm.deliveryMode || 'issue_offset'}
                      onChange={(e) => setScheduleForm((p) => ({ ...p, deliveryMode: e.target.value }))}
                    >
                      <option value="issue_offset">Igazodjon a keltezéshez (a számlán beállított teljesítés-keltezést veszi alapul)</option>
                      <option value="next_month_day">Naptári nap alapú: következő hónap X. napja</option>
                      <option value="next_year_day">Naptári nap alapú: következő év X. napja</option>
                    </Select>

                    {scheduleForm.deliveryMode === 'next_month_day' && (
                      <div style={{ marginTop: 8, maxWidth: 280 }}>
                        <Label style={{ marginBottom: 6 }}>Következő hónap napja (1-31)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="31"
                          value={scheduleForm.deliveryMonthDay}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, deliveryMonthDay: e.target.value }))}
                        />
                      </div>
                    )}

                    {scheduleForm.deliveryMode === 'next_year_day' && (
                      <div style={{ marginTop: 8, maxWidth: 280 }}>
                        <Label style={{ marginBottom: 6 }}>Következő év napja (1-366)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="366"
                          value={scheduleForm.deliveryYearDay}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, deliveryYearDay: e.target.value }))}
                        />
                      </div>
                    )}

                    <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                      Teljesítés előnézet (következő keltezéshez): {(() => {
                        const d = scheduleDeliveryPreviewDate(scheduleForm.startIssueDate || watch('issue_date'));
                        return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('hu-HU') : '—';
                      })()}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 12, color: '#6b7280' }}>
                      Esedékesség előnézet: {(() => {
                        const due = scheduleDuePreviewDate(scheduleForm.startIssueDate || watch('issue_date'));
                        return due && !Number.isNaN(due.getTime()) ? due.toLocaleDateString('hu-HU') : '—';
                      })()}
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / span 2', borderTop: '1px solid #ecf0f1', paddingTop: 10, marginTop: 4 }}>
                    <Label>Megjegyzés sablon (változókkal)</Label>
                    <TextArea
                      ref={notesTemplateRef}
                      rows={3}
                      value={scheduleForm.notesTemplate || ''}
                      onChange={(e) => setScheduleForm((p) => ({ ...p, notesTemplate: e.target.value }))}
                      placeholder="Példa: {év_hónap} havi díj - {gyakoriság}"
                    />
                    <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                      Változók: {'{év_hónap}'}, {'{év_következő hónap}'}, {'{gyakoriság}'}, {'{év}'}, {'{hónap_nev}'}, {'{következő_keltezés}'}, {'{hónap_utolsó_napja}'}, {'{következő_hónap_utolsó_napja}'}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[ 
                        '{év_hónap}',
                        '{év_következő hónap}',
                        '{gyakoriság}',
                        '{év}',
                        '{hónap_nev}',
                        '{következő_keltezés}',
                        '{hónap_utolsó_napja}',
                        '{következő_hónap_utolsó_napja}',
                      ].map((token) => (
                        <button
                          key={token}
                          type="button"
                          onDoubleClick={() => scheduleInsertVariableAtCursor(token)}
                          style={{
                            border: '1px solid #d1d5db',
                            borderRadius: 12,
                            background: '#fff',
                            color: '#374151',
                            fontSize: 12,
                            padding: '4px 8px',
                            cursor: 'pointer',
                          }}
                          title="Dupla kattintás: beszúrás a kurzor helyére"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                      Tipp: dupla kattintás egy változón = beszúrás a kurzor helyére.
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: '#34495e', background: '#f8f9fa', border: '1px solid #ecf0f1', borderRadius: 4, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
                      Előnézet: {scheduleResolveNoteTemplate(scheduleForm.notesTemplate || '', scheduleForm.startIssueDate || watch('issue_date')) || '—'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!scheduleForm.approvalRequired}
                      onChange={(e) => setScheduleForm((p) => ({ ...p, approvalRequired: e.target.checked }))}
                    />
                    Jóváhagyással (ha nincs bepipálva: automatikusan)
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!scheduleForm.autoSendEmail}
                      onChange={(e) => setScheduleForm((p) => ({ ...p, autoSendEmail: e.target.checked }))}
                    />
                    E-mailben küldjük a számlát
                  </label>

                  {scheduleForm.autoSendEmail && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <Label>E-mail sablon</Label>
                        <Select
                          value={scheduleForm.emailTemplateType}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, emailTemplateType: e.target.value }))}
                        >
                          {scheduleTemplateOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Extra e-mailek (vesszővel)</Label>
                        <Input
                          value={scheduleForm.extraEmails}
                          onChange={(e) => setScheduleForm((p) => ({ ...p, extraEmails: e.target.value }))}
                          placeholder="email1@pelda.hu, email2@pelda.hu"
                        />
                        {scheduleContactEmails.length > 0 && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                            Kapcsolattartói e-mailek: {scheduleContactEmails.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!scheduleForm.firstInvoice}
                      onChange={(e) => setScheduleForm((p) => ({ ...p, firstInvoice: e.target.checked }))}
                    />
                    Ez az első számla
                  </label>
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button variant="secondary" type="button" disabled={scheduleSaving} onClick={() => setScheduleModalOpen(false)}>
                    Mégse
                  </Button>
                  <Button variant="primary" type="button" disabled={scheduleSaving} onClick={saveScheduledInvoice}>
                    <Save size={16} /> {scheduleSaving ? 'Mentés...' : 'Időzítés mentése'}
                  </Button>
                </div>
              </ModalBody>
            </ModalCard>
          </ModalBackdrop>
        )}
        {currencyConfirm && (
          <ModalBackdrop onClick={() => { currencyConfirm.resolve(false); setCurrencyConfirm(null); }}>
            <ModalCard onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <ModalHeader>
                <span>Pénznem váltás</span>
                <IconGhostButton onClick={() => { currencyConfirm.resolve(false); setCurrencyConfirm(null); }} aria-label="Bezárás">
                  <X size={18} />
                </IconGhostButton>
              </ModalHeader>
              <ModalBody>
                <p style={{ marginBottom: 12 }}>
                  Biztosan átváltod a pénznemet <strong>{getValues('currency') || 'HUF'}</strong> → <strong>{currencyConfirm.newOpt?.value}</strong> devizára?
                </p>
                <p style={{ marginBottom: 20, color: '#6b7280', fontSize: 13 }}>
                  Tipp: ha általában {currencyConfirm.newOpt?.value} devizában számlázol ennek az ügyfélnek, inkább válassz {currencyConfirm.newOpt?.value} pénznemű <strong>számlatömböt</strong> — ekkor automatikusan a megfelelő deviza lesz aktív.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button variant="secondary" type="button" onClick={() => { currencyConfirm.resolve(false); setCurrencyConfirm(null); }}>
                    Mégse
                  </Button>
                  <Button variant="primary" type="button" onClick={() => { currencyConfirm.resolve(true); setCurrencyConfirm(null); }}>
                    Igen, váltom
                  </Button>
                </div>
              </ModalBody>
            </ModalCard>
          </ModalBackdrop>
        )}
        {draftsModalOpen && (
          <ModalBackdrop onClick={() => setDraftsModalOpen(false)}>
            <ModalCard onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
              <ModalHeader>
                <span>Vázlatok</span>
                <IconGhostButton onClick={() => setDraftsModalOpen(false)} aria-label="Bezárás">
                  <X size={18} />
                </IconGhostButton>
              </ModalHeader>
              <ModalBody>
                {manualDrafts.length === 0 ? (
                  <p style={{ color: '#6b7280', textAlign: 'center', padding: '24px 0' }}>Nincsenek mentett vázlatok.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Ügyfél</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Mentés dátuma</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Számlatömb</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Nettó összeg</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Műveletek</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualDrafts.slice().reverse().map((d) => (
                          <tr key={d.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '8px 12px' }}>{d.customer_name}</td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                              {new Date(d.savedAt).toLocaleString('hu-HU')}
                            </td>
                            <td style={{ padding: '8px 12px' }}>{d.invoice_block_name}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {d.total_net.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {d.currency}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <Button
                                variant="secondary"
                                type="button"
                                style={{ marginRight: 6, padding: '4px 10px', fontSize: 13 }}
                                onClick={() => loadDraftIntoForm(d)}
                              >
                                Betölt
                              </Button>
                              <Button
                                variant="danger"
                                type="button"
                                style={{ padding: '4px 10px', fontSize: 13 }}
                                onClick={() => deleteManualDraft(d.id)}
                              >
                                Töröl
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </ModalBody>
            </ModalCard>
          </ModalBackdrop>
        )}
        <FormGrid>
          <FormSection>
            <SectionTitle>Alapadatok</SectionTitle>
            
            <FormGroup>
              <Label htmlFor="customer_id">
                <BilingualLabel label={isIncomingManual ? 'Szállító' : 'Ügyfél'} translationMap={translations} show={bilingual} /> *
              </Label>
              <Controller
                control={control}
                name="customer_id"
                rules={{ required: 'Ügyfél kiválasztása kötelező' }}
                render={({ field }) => (
                  <InlineGroup>
                    <div style={{ flex: 1 }}>
                      <ReactSelect
                        inputId="customer_id"
                        options={customerOptions}
                        value={customerOptions.find(o => o.value === field.value) || null}
                        onChange={(opt) => {
                          field.onChange(opt ? opt.value : '');
                          if (opt?.value) bumpCustomerUsage(opt.value);
                        }}
                        placeholder="Keresés név vagy adószám alapján..."
                        isClearable
                        noOptionsMessage={() => customersLoading ? 'Ügyfelek betöltése...' : 'Nincs találat'}
                        filterOption={(option, rawInput) => {
                          const term = normalize(rawInput);
                          if (!term) return true;
                          return option.data._norm.includes(term);
                        }}
                        formatOptionLabel={formatCustomerOption}
                        styles={{ container: (base) => ({ ...base, zIndex: 10 }) }}
                        isDisabled={isReadOnly}
                      />
                    </div>
                    {!isEdit && !isReadOnly && (
                      <Button type="button" variant="secondary" onClick={() => navigate(`/customers/new?return=${encodeURIComponent(currentPath || '/invoices/new')}`)}>
                        + Új
                      </Button>
                    )}
                  </InlineGroup>
                )}
              />
              {errors.customer_id && (<ErrorMessage>{errors.customer_id.message}</ErrorMessage>)}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="issue_date">
                <BilingualLabel label="Kibocsátás dátuma" translationMap={translations} show={bilingual} /> *
              </Label>
              <DatePicker
                id="issue_date"
                name="issue_date"
                selected={watch('issue_date')}
                onChange={(date) => setValue('issue_date', date)}
                dateFormat="yyyy-MM-dd"
                className="form-control"
                wrapperClassName="w-100"
                disabled={!isEdit || isReadOnly}
              />
              {errors.issue_date && (
                <ErrorMessage>{errors.issue_date.message}</ErrorMessage>
              )}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="due_date">
                <BilingualLabel label="Esedékesség dátuma" translationMap={translations} show={bilingual} /> *
              </Label>
              <DatePicker
                id="due_date"
                name="due_date"
                selected={watch('due_date')}
                onChange={(date) => setValue('due_date', date)}
                dateFormat="yyyy-MM-dd"
                className="form-control"
                wrapperClassName="w-100"
              />
              {errors.due_date && (
                <ErrorMessage>{errors.due_date.message}</ErrorMessage>
              )}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="delivery_date">
                <BilingualLabel label="Teljesítés dátuma" translationMap={translations} show={bilingual} />
              </Label>
              <DatePicker
                id="delivery_date"
                name="delivery_date"
                selected={watch('delivery_date')}
                onChange={(date) => setValue('delivery_date', date)}
                dateFormat="yyyy-MM-dd"
                className="form-control"
                wrapperClassName="w-100"
                isClearable
              />
            </FormGroup>
          </FormSection>

          <FormSection>
            <SectionTitle>Pénzügyi adatok</SectionTitle>
            
            {!isProforma && (
              <FormGroup>
                <Label htmlFor="invoice_category">Számla típusa</Label>
                <Select id="invoice_category" {...register('invoice_category')}>
                  <option value="SIMPLIFIED">Egyszerűsített</option>
                  <option value="NORMAL">Normál</option>
                  <option value="AGGREGATE">Gyűjtőszámla</option>
                  <option value="ADVANCE">Előlegszámla</option>
                  <option value="FINAL">Végszámla</option>
                  <option value="CORRECTION">Helyesbítő</option>
                </Select>
              </FormGroup>
            )}

            {watch('invoice_category') === 'FINAL' && (
              <FormGroup>
                <Label>Nyitott előleg számlák</Label>
                <div style={{ border:'1px solid #ecf0f1', borderRadius:6, padding:10 }}>
                  {(!openAdvances || openAdvances.length === 0) ? (
                    <div style={{ color:'#6c757d' }}>Nincs nyitott előleg számla ehhez az ügyfélhez.</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {openAdvances.map(a => (
                        <label key={a.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <input type="checkbox" checked={!!selectedAdvances[a.id]} onChange={(e)=> setSelectedAdvances(prev => ({ ...prev, [a.id]: e.target.checked }))} />
                          <span style={{ fontWeight:600 }}>{a.invoice_number}</span>
                          <span style={{ color:'#6c757d' }}>(Kiállítva: {a.issue_date})</span>
                          <span style={{ marginLeft:'auto' }}>Hátralévő előleg: {Number(a.remaining).toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} HUF</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </FormGroup>
            )}

            {false && (
              <FormGroup>
                <Label htmlFor="payment_date">Fizetés dátuma</Label>
                <DatePicker
                  selected={watch('payment_date')}
                  onChange={(date) => setValue('payment_date', date)}
                  dateFormat="yyyy-MM-dd"
                  className="form-control"
                  wrapperClassName="w-100"
                  isClearable
                />
              </FormGroup>
            )}

            <FormGroup>
              <Label htmlFor="order_reference">Rendelésszám / hivatkozás</Label>
              <Input id="order_reference" {...register('order_reference')} placeholder="Pl. Megrendelés szám: 12345678/2021" />
            </FormGroup>

            {!isSimplified && (
              <FormGroup>
                <Label>
                  <input type="checkbox" {...register('completeness_indicator')} style={{ marginRight: 8 }} />
                  Teljességi jelző (minden tétel részletezve)
                </Label>
              </FormGroup>
            )}

            <FormGroup>
              <Label htmlFor="payment_method">
                <BilingualLabel label="Fizetési mód" translationMap={translations} show={bilingual} /> *
              </Label>
              <Select id="payment_method" {...register('payment_method', { required: 'Fizetési mód kötelező' })}>
                <option value="transfer">Átutalás</option>
                <option value="cash">Készpénz</option>
                <option value="card">Bankkártya</option>
                <option value="voucher">Utalvány</option>
                <option value="cod">Utánvét</option>
                <option value="other">Egyéb</option>
              </Select>
              {errors.payment_method && (<ErrorMessage>{errors.payment_method.message}</ErrorMessage>)}
              {paidAmountDisplay > 0 && (
                isSettledDisplay ? (
                  <div style={{ fontSize: 12, color: '#1e824c', marginTop: 6 }}>
                    Rendezve: {invoice?.payment_date ? formatDateDisplay(invoice.payment_date) : '—'}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#b42318', marginTop: 6 }}>
                    Hátralék: {remainingDisplay.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}
                  </div>
                )
              )}
            </FormGroup>

            <FormGroup>
              <Label htmlFor="currency">
                <BilingualLabel label="Pénznem" translationMap={translations} show={bilingual} />
              </Label>
              <ReactSelect
                inputId="currency"
                isDisabled={isReadOnly}
                options={currencyOptions}
                value={{ value: watch('currency') || 'HUF', label: watch('currency') || 'HUF' }}
                onChange={async (opt) => {
                  const val = opt ? opt.value : 'HUF';
                  const oldVal = getValues('currency') || 'HUF';
                  if (val !== oldVal && !isEdit) {
                    const confirmed = await new Promise((resolve) => setCurrencyConfirm({ newOpt: opt, resolve }));
                    if (!confirmed) return;
                  }
                  const oldRate = Number(getValues('exchange_rate')) || 1;

                  setValue('currency', val);
                  
                  let newRate = 1;
                  if (val !== 'HUF') {
                      const found = availableCurrencies?.find(c => c.code === val);
                      if (found && found.current_rate) {
                          newRate = Number(found.current_rate);
                      } else {
                        try {
                          const res = await utilsAPI.getExchangeRate(val);
                          if (res.data && res.data.rate) newRate = Number(res.data.rate);
                        } catch (e) { /* noop */ }
                      }
                  }
                  
                  setValue('exchange_rate', newRate);

                  if (val !== oldVal && newRate > 0) {
                      const currentItems = getValues('items') || [];
                      if (currentItems.length > 0) {
                          const factor = oldRate / newRate;
                          const newItems = currentItems.map(item => ({
                              ...item,
                              unit_price: Number((item.unit_price * factor).toFixed(2))
                          }));
                          setValue('items', newItems);
                          toast.info(`Tételek árai konvertálva (${val})`);
                      }
                  }
                }}
                isClearable={false}
                isSearchable
              />
            </FormGroup>

              <FormGroup>
                <Label htmlFor="exchange_rate">
                  <BilingualLabel label="Árfolyam" translationMap={translations} show={bilingual} />
                  {watch('currency') !== 'HUF' && (
                     <span style={{ marginLeft: '10px', fontSize: '0.9em', color: '#666' }}>
                        (1 {watch('currency')} = {watch('exchange_rate')} HUF)
                     </span>
                  )}
                </Label>
                <Input
                  id="exchange_rate"
                  type="number"
                  step="0.0001"
                  onInput={normalizeInput}
                  {...register('exchange_rate', { valueAsNumber: true })}
                />
              </FormGroup>

            <FormGroup>
              <Label htmlFor="notes">Megjegyzések</Label>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <ReactQuill
                    theme="snow"
                    value={field.value || ''}
                    onChange={(value) => field.onChange(value)}
                  />
                )}
              />
            </FormGroup>
          </FormSection>
        </FormGrid>

        <ItemsSection id="items-section">
          <ItemsHeader>
            <SectionTitle>
              <BilingualLabel label="Tételek" translationMap={translations} show={bilingual} />
            </SectionTitle>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {!isReadOnly && (
                <>
                  <SampleCsvButton type="button" onClick={handleDownloadSampleCsv} title="Minta CSV letöltése">
                    <Download size={14} />
                    Minta CSV
                  </SampleCsvButton>
                  <CsvImportButton type="button" onClick={() => csvInputRef.current?.click()} title="Tételek importálása CSV fájlból">
                    <Table2 size={16} />
                    CSV import
                  </CsvImportButton>
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: 'none' }}
                    onChange={handleCsvFileChange}
                  />
                </>
              )}
              <AddItemButton
                type="button"
                onClick={handleAddItem}
              >
                <Plus size={16} />
                Tétel hozzáadása
              </AddItemButton>
            </div>
          </ItemsHeader>

          <ItemsTableWrap>
          <ItemsTable>
            <TableHeader>
              <tr>
                <TableHeaderCell style={{ minWidth: 220 }}>Név</TableHeaderCell>
                {isSimplified && <TableHeaderCell>Cikkszám</TableHeaderCell>}
                <TableHeaderCell>Mennyiség</TableHeaderCell>
                <TableHeaderCell style={{ minWidth: 109 }}>Me. egység</TableHeaderCell>
                <TableHeaderCell style={{ minWidth: 134 }}>
                  <InlineGroup>
                    <span>ÁFA %</span>
                    <IconGhostButton type="button" onClick={() => setShowVatHelp(true)} title="ÁFA típus súgó">
                      <HelpCircle size={16} />
                    </IconGhostButton>
                  </InlineGroup>
                </TableHeaderCell>
                <TableHeaderCell>Nettó egységár</TableHeaderCell>
                <TableHeaderCell>Bruttó egységár</TableHeaderCell>
                {!isSimplified && (
                  <>
                    <TableHeaderCell>Típus</TableHeaderCell>
                    <TableHeaderCell>Kód típusa</TableHeaderCell>
                    <TableHeaderCell>Kód értéke</TableHeaderCell>
                  </>
                )}
                <TableHeaderCell>Nettó összeg</TableHeaderCell>
                <TableHeaderCell>ÁFA összeg</TableHeaderCell>
                <TableHeaderCell>Bruttó összeg</TableHeaderCell>
                <TableHeaderCell>Műveletek</TableHeaderCell>
              </tr>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => {
                const item = watchedItems[index];
                const isAutoAdvance = !!(item && item.__isAdvanceDeduction);
                const { netAmount, vatAmount, grossAmount } = calculateItemTotals(item);
                
                return (
                  <TableRow key={field.id}>
                    <TableCell data-label="Név">
                      <input type="hidden" {...register(`items.${index}._vat_name`)} />
                      <TextArea
                        {...register(`items.${index}.description`, { required: 'Leírás kötelező' })}
                        placeholder="Tétel neve / leírása"
                        style={{ minHeight: 40, minWidth: 0 }}
                        readOnly={isReadOnly || isAutoAdvance}
                        disabled={isReadOnly || isAutoAdvance}
                      />
                    </TableCell>
                    {isSimplified && (
                      <TableCell data-label="Cikkszám">
                        <SmallInput {...register(`items.${index}.product_code_value`)} placeholder="Cikkszám (opcionális)" />
                      </TableCell>
                    )}
                    <TableCell data-label="Mennyiség">
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        readOnly={isReadOnly || isStornoCreation || isAutoAdvance}
                        disabled={isReadOnly || isStornoCreation || isAutoAdvance}
                        {...register(`items.${index}.quantity`, { 
                          required: 'Mennyiség kötelező',
                          valueAsNumber: true,
                          ...(isStornoCreation ? {} : { min: { value: 0.01, message: 'Mennyiség nagyobb kell legyen 0-nál' } }),
                          onChange: () => {
                            setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                          }
                        })}
                      />
                    </TableCell>
                    <TableCell data-label="Me. egység">
                      {isReadOnly ? (
                          <div style={{ padding: '8px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '4px' }}>
                              {itemMeta[index]?.uom || watch(`items.${index}.unit_of_measure`) || 'db'}
                          </div>
                      ) : (
                      <CreatableSelect
                        inputId={`uom_${index}`}
                        styles={{
                          container: base => ({ ...base, minWidth: 0, width: '100%' }),
                          menuPortal: base => ({ ...base, zIndex: 9999 }),
                        }}
                        components={{ DropdownIndicator: () => null, ClearIndicator: () => null, IndicatorSeparator: () => null }}
                        menuPortalTarget={document.body}
                        menuPosition="fixed"
                        isDisabled={isReadOnly || isStornoCreation || isAutoAdvance}
                        options={[
                          { value: 'db', label: 'db' },
                          { value: 'l', label: 'l' },
                          { value: 'mm', label: 'mm' },
                          { value: 'cm', label: 'cm' },
                          { value: 'm', label: 'm' },
                          { value: 'm2', label: 'm2' },
                          { value: 'm3', label: 'm3' },
                          { value: 'g', label: 'g' },
                          { value: 'kg', label: 'kg' },
                          { value: 't', label: 't' },
                        ]}
                        value={watch(`items.${index}.unit_of_measure`) ? { value: watch(`items.${index}.unit_of_measure`), label: watch(`items.${index}.unit_of_measure`) } : null}
                        onChange={(opt) => setValue(`items.${index}.unit_of_measure`, opt ? opt.value : '')}
                        placeholder="egység"
                      />
                      )}
                    </TableCell>
                    <TableCell data-label="ÁFA %">
                      {isReadOnly ? (
                         <div style={{ padding: '8px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '4px', minWidth: 0 }}>
                            {itemMeta[index]?.vat_name || item._vat_name || (()=> {
                                 const id = watch(`items.${index}.vat_type_id`);
                                 const found = vatTypeOptions?.flat?.find(o=>o.value===id);
                                 return found?.label || '-';
                            })()}
                         </div>
                      ) : (
                      vatTypes && vatTypes.length > 0 ? (
                        <InlineFlex>
                          <ReactSelect
                            inputId={`vat_type_${index}`}
                            options={vatTypeOptions.groups}
                            value={(() => {
                              const id = watch(`items.${index}.vat_type_id`) || '';
                              const found = vatTypeOptions.flat.find(o=>o.value===id);
                              if (found) return found;
                              // Fallback support for displaying stored VAT name if ID is not in active list (View Mode)
                              const storedName = item._vat_name;
                              if (isReadOnly && id && storedName) {
                                  return { value: id, label: storedName };
                              }
                              return null;
                            })()}
                            isDisabled={isReadOnly || isStornoCreation || isAutoAdvance}
                            onChange={(opt) => {
                              const id = opt ? opt.value : '';
                              setValue(`items.${index}.vat_type_id`, id);
                              const vt = (vatTypes||[]).find(v => v.id === id);
                              if (vt) {
                                bumpUsage(id);
                                if (vt.category === 'PERCENT' && vt.percentage != null) {
                                  setValue(`items.${index}.vat_rate`, Number(vt.percentage));
                                } else {
                                  setValue(`items.${index}.vat_rate`, 0);
                                }
                              }
                              // Clear derived totals on VAT change
                              setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                              setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                            }}
                            styles={{ container: (base) => ({ ...base, minWidth: 0, width: '100%' }), menuPortal: base => ({ ...base, zIndex: 9999 }) }}
                            components={{ DropdownIndicator: () => null, ClearIndicator: () => null, IndicatorSeparator: () => null }}
                            menuPortalTarget={document.body}
                            isSearchable
                            filterOption={(option, raw) => {
                              const norm = (s)=> (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
                              const hay = `${option.label} ${option.data?._full || ''}`;
                              return norm(hay).includes(norm(raw));
                            }}
                          />
                          {(() => { const id = watch(`items.${index}.vat_type_id`); const vt = (vatTypes||[]).find(v => v.id === id); return (
                            vt && vt.category !== 'PERCENT' ? (
                              <SmallInput style={{ marginTop: 6 }} placeholder="ÁFA indok (pl. AAM/TAM részletezés)"
                                disabled={isReadOnly || isStornoCreation || isAutoAdvance}
                                {...register(`items.${index}.vat_reason`)} />
                            ) : null
                          ); })()}
                        </InlineFlex>
                      ) : (
                        <ItemSelect
                          disabled={isReadOnly || isStornoCreation || isAutoAdvance}
                          {...register(`items.${index}.vat_rate`, { 
                              required: 'ÁFA kulcs kötelező',
                              valueAsNumber: true,
                              onChange: () => {
                                setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                                setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                              }
                            })}
                        >
                          {VAT_RATES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </ItemSelect>
                      ))}
                    </TableCell>
                    <TableCell data-label="Nettó egységár">
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onDoubleClick={selectAll}
                        readOnly={isReadOnly || isStornoCreation || isAutoAdvance}
                        disabled={isReadOnly || isStornoCreation || isAutoAdvance}
                        value={getItemStr(index, 'unit_price_str', item?.unit_price)}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.unit_price_str`, str, { shouldValidate: false, shouldDirty: true });
                          const val = parseFloat(str.replace(',', '.'));
                          if (!Number.isNaN(val)) {
                            setValue(`items.${index}.unit_price`, val, { shouldValidate: false, shouldDirty: true });
                          }
                          setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                          setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                        placeholder="Nettó egységár"
                      />
                    </TableCell>
                    <TableCell data-label="Bruttó egységár">
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        readOnly={isReadOnly || isStornoCreation || isAutoAdvance}
                        disabled={isReadOnly || isStornoCreation || isAutoAdvance}
                        value={getItemStr(index, 'gross_unit_price_str', ((item?.unit_price || 0) * (1 + (item?.vat_rate || 0)/100)).toFixed(currencyDecimals))}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.gross_unit_price_str`, str, { shouldValidate: false, shouldDirty: true });
                          const gross = parseFloat(str.replace(',', '.'));
                          const net = (gross) / (1 + (Number(item?.vat_rate || 0)/100));
                          if (Number.isFinite(net)) {
                            const net2 = Number(net.toFixed(currencyDecimals));
                            setValue(`items.${index}.unit_price`, net2, { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.unit_price_str`, String(net2), { shouldValidate: false, shouldDirty: true });
                          }
                          setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                          setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                        placeholder="Bruttó egységár"
                      />
                    </TableCell>
                    {!isSimplified && (
                      <>
                        <TableCell data-label="Típus">
                          <ItemSelect
                            disabled={isReadOnly}
                            {...register(`items.${index}.nature_indicator`)}>
                            <option value="PRODUCT">Termék</option>Note: The tool call failed because the `newString` contained `Note: ...` which probably wasn't intended. The thought process continues below.
                            <option value="SERVICE">Szolgáltatás</option>
                            <option value="OTHER">Egyéb</option>
                          </ItemSelect>
                        </TableCell>
                        <TableCell data-label="Kód típusa">
                          <ItemSelect
                            disabled={isReadOnly}
                            {...register(`items.${index}.product_code_category`)}>
                            <option value="">—</option>
                            <option value="VTSZ">VTSZ</option>
                            <option value="SZJ">SZJ</option>
                            <option value="KN">KN</option>
                            <option value="OTHER">Egyéb</option>
                          </ItemSelect>
                        </TableCell>
                        <TableCell data-label="Kód értéke">
                          <SmallInput
                            disabled={isReadOnly}
                            {...register(`items.${index}.product_code_value`)}
                            placeholder="Kód érték"
                          />
                        </TableCell>
                      </>
                    )}
                    <TableCell data-label="Nettó összeg">
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onFocus={selectAll}
                        readOnly={isAutoAdvance}
                        disabled={isAutoAdvance}
                        value={getItemStr(index, 'net_total_str', netAmount.toFixed(currencyDecimals))}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.net_total_str`, str, { shouldValidate: false, shouldDirty: true });
                          const netTotal = parseFloat(str.replace(',', '.'));
                          const qty = Number(item?.quantity || 0) || 1;
                          const newUnit = netTotal / qty;
                          if (Number.isFinite(newUnit)) {
                            const nu2 = Number((newUnit||0).toFixed(currencyDecimals));
                            setValue(`items.${index}.unit_price`, nu2, { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.unit_price_str`, String(nu2), { shouldValidate: false, shouldDirty: true });
                          }
                          // invalidate opposite editable display so it recalculates from model
                          setValue(`items.${index}.gross_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                      />
                    </TableCell>
                    <TableCell data-label="ÁFA összeg">
                      <ItemInput
                        type="number"
                        step="0.01"
                        value={Number(vatAmount.toFixed(currencyDecimals))}
                        disabled
                        readOnly
                      />
                    </TableCell>
                    <TableCell data-label="Bruttó összeg">
                      <ItemInput
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        onInput={normalizeInput}
                        onDoubleClick={selectAll}
                        readOnly={isAutoAdvance}
                        disabled={isAutoAdvance}
                        value={getItemStr(index, 'gross_total_str', grossAmount.toFixed(currencyDecimals))}
                        onChange={(e) => {
                          const str = (e.target.value ?? '').toString();
                          setValue(`items.${index}.gross_total_str`, str, { shouldValidate: false, shouldDirty: true });
                          const gross = parseFloat(str.replace(',', '.'));
                          const rate = 1 + Number(item?.vat_rate || 0)/100;
                          const netTotal = gross / (rate || 1);
                          const qty = Number(item?.quantity || 0) || 1;
                          const newUnit = netTotal / qty;
                          if (Number.isFinite(newUnit)) {
                            const nu2 = Number((newUnit||0).toFixed(currencyDecimals));
                            setValue(`items.${index}.unit_price`, nu2, { shouldValidate: false, shouldDirty: true });
                            setValue(`items.${index}.unit_price_str`, String(nu2), { shouldValidate: false, shouldDirty: true });
                          }
                          // invalidate opposite editable display so it recalculates from model
                          setValue(`items.${index}.net_total_str`, '', { shouldValidate: false, shouldDirty: true });
                        }}
                      />
                    </TableCell>
                    <TableCell data-label="Műveletek">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <DeleteButton
                          type="button"
                          onClick={() => remove(index)}
                          disabled={isStornoCreation || fields.length === 1 || isAutoAdvance}
                          title="Tétel törlése"
                        >
                          <Trash2 size={16} />
                        </DeleteButton>
                        <DeleteButton
                          type="button"
                          onClick={() => {
                            const list = [...(watch('items')||[])];
                            const clone = { ...list[index] };
                            list.splice(index+1, 0, clone);
                            setValue('items', list, { shouldValidate: false, shouldDirty: true });
                          }}
                          title="Tétel duplikálása"
                          style={{ backgroundColor: '#6c757d' }}
                          disabled={isStornoCreation || isAutoAdvance}
                        >
                          +
                        </DeleteButton>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </ItemsTable>
          </ItemsTableWrap>
        </ItemsSection>

        <SummarySection>
          <SectionTitle>Összesítés</SectionTitle>
          <SummaryRow>
            <span>Nettó összeg:</span>
            <span>{totals.netTotal.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</span>
          </SummaryRow>
          <SummaryRow>
            <span>ÁFA összeg:</span>
            <span>{totals.vatTotal.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</span>
          </SummaryRow>
          <SummaryRow>
            <span>Bruttó összeg:</span>
            <span>{totals.grossTotal.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</span>
          </SummaryRow>

          {/* ÁFA részletező */}
          {(() => { const vb = vatBreakdown(); return (
            <>
              <SectionTitle>ÁFA részletező</SectionTitle>
              <VatTable>
                <thead>
                  <tr>
                    <th>ÁFA kulcs</th>
                    <th>Nettó összeg</th>
                    <th>ÁFA összeg</th>
                    <th>Bruttó összeg</th>
                  </tr>
                </thead>
                <tbody>
                  {vb.rows.map(r => (
                    <tr key={r.rate}>
                      <td>{r.names && r.names.length > 0 ? r.names.join(', ') : `${r.rate.toLocaleString('hu-HU')}%`}</td>
                      <td>{r.net.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</td>
                      <td>{r.vat.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</td>
                      <td>{r.gross.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</td>
                    </tr>
                  ))}
                  <tr>
                    <th><BilingualLabel label="Összesen" translationMap={translations} show={bilingual} /></th>
                    <th>{vb.totals.net.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</th>
                    <th>{vb.totals.vat.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</th>
                    <th>{vb.totals.gross.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</th>
                  </tr>
                </tbody>
              </VatTable>

              <SectionTitle style={{ marginTop: 16 }}>Kiegyenlítések részletező</SectionTitle>
              <VatTable>
                <thead>
                  <tr>
                    <th>Dátum</th>
                    <th>Összeg</th>
                    <th>Bankszámla száma</th>
                    <th>Bankkivonat száma / Kassza neve</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(invoice?.settlement_details) && invoice.settlement_details.length > 0) ? (
                    invoice.settlement_details.map((row, idx) => (
                      <tr key={`settlement-${idx}`}>
                        <td>{row?.date || '-'}</td>
                        <td>{Number(row?.amount || 0).toLocaleString('hu-HU', { minimumFractionDigits: 2 })} {row?.currency || currency}</td>
                        <td>{row?.bank_account_number || '-'}</td>
                        <td>
                          {row?.source_type === 'bank_statement' && row?.source_id
                            ? <a href={`/bank-statements/${row.source_id}/edit`} target="_blank" rel="noopener noreferrer" style={{ color: '#2980b9', textDecoration: 'underline', cursor: 'pointer' }}>{row?.source_label || '-'}</a>
                            : (row?.source_label || (row?.source_type === 'cash' ? 'Készpénz' : '-'))
                          }
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ textAlign:'center', color:'#7f8c8d' }}>Nincs kiegyenlítés rögzítve</td>
                    </tr>
                  )}
                </tbody>
              </VatTable>

              {/* Behajtási napló */}
              {(Array.isArray(invoice?.arrears_log) && invoice.arrears_log.length > 0) && (
                <>
                  <SectionTitle style={{ marginTop: 16 }}>Behajtási napló</SectionTitle>
                  <VatTable>
                    <thead>
                      <tr>
                        <th>Dátum / Időpont</th>
                        <th>Értesítő típusa</th>
                        <th>E-mail kiküldve</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.arrears_log.map((entry, idx) => {
                        const ts = entry?.timestamp ? new Date(entry.timestamp) : null;
                        const dateStr = ts ? ts.toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' }) : '-';
                        return (
                          <tr key={`arrears-log-${idx}`}>
                            <td>{dateStr}</td>
                            <td>{entry?.status_label || entry?.status || '-'}</td>
                            <td>{entry?.email_sent ? '✓ Igen' : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </VatTable>
                </>
              )}

              {/* ── Számla eseménynapló ─────────────────────────────── */}
              {isEdit && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 6 }}>
                    <SectionTitle style={{ margin: 0 }}>Naplózás {invoiceLogs.length > 0 ? `(${invoiceLogs.length})` : ''}</SectionTitle>
                    <button
                      type="button"
                      onClick={() => setActivityLogModalOpen(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', fontSize: 12, border: '1px solid #d0d0d0', borderRadius: 4, background: '#f8f9fa', cursor: 'pointer', color: '#555' }}
                    >
                      <Clock3 size={13} />
                      Aktivitás napló
                    </button>
                  </div>
                  {invoiceLogsLoading ? (
                    <div style={{ padding: '12px 0', color: '#999', fontSize: 13 }}>Betöltés…</div>
                  ) : invoiceLogs.length === 0 ? (
                    <div style={{ padding: '8px 0', color: '#bbb', fontSize: 12 }}>Nincs naplóbejegyzés.</div>
                  ) : (
                    <VatTable>
                      <thead>
                        <tr>
                          <th style={{ width: 140 }}>Dátum</th>
                          <th style={{ width: 140 }}>Felhasználó</th>
                          <th>Művelet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceLogs.slice(0, 5).map((entry, idx) => {
                          const ts = entry?.timestamp ? new Date(entry.timestamp) : null;
                          const dateStr = ts ? ts.toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' }) : '-';
                          return (
                            <tr key={`inv-log-${idx}`}>
                              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{dateStr}</td>
                              <td style={{ fontSize: 12, color: '#555' }}>{entry?.who_name || '—'}</td>
                              <td style={{ fontSize: 12 }}>{entry?.what || '—'}</td>
                            </tr>
                          );
                        })}
                        {invoiceLogs.length > 5 && (
                          <tr>
                            <td colSpan={3} style={{ textAlign: 'center', fontSize: 11, color: '#999', padding: '6px 0' }}>
                              + {invoiceLogs.length - 5} további bejegyzés —&nbsp;
                              <span
                                style={{ color: '#2980b9', cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={() => setActivityLogModalOpen(true)}
                              >
                                Mind mutatása
                              </span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </VatTable>
                  )}
                </>
              )}
            </>
          ); })()}
        </SummarySection>
        </fieldset>
      </form>

      {/* ── Aktivitás napló modal ──────────────────────────────────── */}
      {activityLogModalOpen && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setActivityLogModalOpen(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.2)', width: '90%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #ecf0f1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 15 }}>Aktivitás napló</strong>
              <button type="button" onClick={() => setActivityLogModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: '#888' }}>×</button>
            </div>
            <div style={{ overflow: 'auto', padding: '12px 20px 20px' }}>
              {invoiceLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#bbb' }}>Nincs naplóbejegyzés.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #ecf0f1', width: 155, fontWeight: 600, color: '#555' }}>Dátum</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #ecf0f1', width: 160, fontWeight: 600, color: '#555' }}>Felhasználó</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #ecf0f1', fontWeight: 600, color: '#555' }}>Művelet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceLogs.map((entry, idx) => {
                      const ts = entry?.timestamp ? new Date(entry.timestamp) : null;
                      const dateStr = ts ? ts.toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' }) : '-';
                      const categoryColors = { create: '#52c41a', nav: '#722ed1', payment: '#1677ff', arrears: '#fa8c16', email: '#0958d9', log: '#8c8c8c' };
                      const cat = entry?.category || 'log';
                      const catColor = categoryColors[cat] || '#8c8c8c';
                      return (
                        <tr key={`modal-log-${idx}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#555' }}>{dateStr}</td>
                          <td style={{ padding: '7px 10px', color: '#555' }}>{entry?.who_name || '—'}</td>
                          <td style={{ padding: '7px 10px' }}>
                            <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 10, fontSize: 11, marginRight: 8, background: catColor + '1a', color: catColor, border: `1px solid ${catColor}40` }}>
                              {cat === 'create' ? 'Létrehozás' : cat === 'nav' ? 'NAV' : cat === 'payment' ? 'Kiegyenlítés' : cat === 'arrears' ? 'Behajtás' : cat === 'email' ? 'E-mail' : 'Napló'}
                            </span>
                            {entry?.what || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      <MobileActionBar>
        <MobileActionButton
          variant="secondary"
          type="button"
          onClick={() => navigate(backListPath)}
        >
          <ArrowLeft size={14} />
          Vissza
        </MobileActionButton>
        <MobileActionButton
          variant="success"
          type="button"
          onClick={handleAddItem}
          disabled={isReadOnly}
        >
          <Plus size={14} />
          Tétel
        </MobileActionButton>
        <MobileActionButton
          variant="primary"
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={isReadOnly || createInvoiceMutation.isLoading || updateInvoiceMutation.isLoading || manualIncomingLoading}
        >
          <Save size={14} />
          Mentés
        </MobileActionButton>
        {!isEdit && !isProforma && !isIncomingManual && (
          <MobileActionButton
            variant="secondary"
            type="button"
            onClick={saveDraft}
          >
            <BookmarkPlus size={14} />
            Vázlat
          </MobileActionButton>
        )}
      </MobileActionBar>

        </FormContainer>
      </div>

      {/* Printable Invoice Layout - v3 Simplified thead */}
      {createPortal((
      <div className="print-invoice print-only">
        <table className="inv-main-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
            {/* v5 - SINGLE ROW REPEATING HEADER - only essential info */}
            <tr style={{ borderBottom: '2px solid #000' }}>
              <td colSpan="2" style={{ padding: '2mm', border: 'none' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: '35%', border: 'none', padding: 0, fontSize: '9pt', verticalAlign: 'top' }}>
                        <strong>{selectedCompany?.name || '—'}</strong><br/>
                        {formatFullTax(selectedCompany)}
                      </td>
                      <td style={{ width: '30%', border: 'none', padding: 0, fontSize: '9pt', verticalAlign: 'top', textAlign: 'center' }}>
                        <strong style={{ fontSize: '11pt' }}>{invoiceNumberValue || '—'}</strong><br/>
                        Kelt: {issueDateStr || '—'}
                      </td>
                      <td style={{ width: '35%', border: 'none', padding: 0, fontSize: '9pt', verticalAlign: 'top', textAlign: 'right' }}>
                        <strong>{selectedCustomer?.name || '—'}</strong><br/>
                        Fizetendő: <strong>{payAmountAbs.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </thead>
            <tbody>
              {/* Full detailed header - only on first page */}
              <tr>
                <td colSpan="2" style={{ border: 'none', padding: 0 }}>
                  <div className="inv-header-wrapper inv-header-first-page">
                    <div className="inv-header">
                    {/* LEFT COLUMN: Seller */}
                    <div className="inv-col-left">
                      <div className="inv-seller">
                        <div className="inv-block-title" style={{ marginBottom: '1mm', fontSize: '0.9em', color:'#666' }}>
                          <BilingualLabel label="Eladó" translationMap={translations} show={bilingual} />:
                        </div>
                        <div className="inv-seller-name">{selectedCompany?.name || '—'}</div>
                        {pickPreferredTax(selectedBlock?.nav_configuration, selectedCompany) && (
                          <div>Adószám: {pickPreferredTax(selectedBlock?.nav_configuration, selectedCompany)}</div>
                        )}
                        {selectedCompany?.eu_tax_number && (
                          <div>EU adószám: {selectedCompany.eu_tax_number}</div>
                        )}
                        {selectedCompany?.vat_group_id && (
                          <div>Csoport adószám: {formatTaxDisplay(selectedCompany.vat_group_id)}</div>
                        )}
                        {selectedCompany?.vat_group_member_tax_number && (
                          <div>Csoport tag adószám: {formatTaxDisplay(selectedCompany.vat_group_member_tax_number)}</div>
                        )}
                        {(selectedCompany?.postal_code || selectedCompany?.city) && (
                          <div>{(selectedCompany?.postal_code || '')} {selectedCompany?.city || ''}</div>
                        )}
                        {(() => { const s = (selectedCompany && (selectedCompany.address || (([selectedCompany.street_name, selectedCompany.public_place_category, selectedCompany.street_number].filter(Boolean).join(' ') + ([selectedCompany.building, selectedCompany.staircase, selectedCompany.floor, selectedCompany.door].filter(Boolean).join(' ') ? (', ' + [selectedCompany.building, selectedCompany.staircase, selectedCompany.floor, selectedCompany.door].filter(Boolean).join(' ')) : '')))) || ''); return s ? (<div>{s}</div>) : null; })()}
                        {selectedCompany?.country && (<div>{selectedCompany.country}</div>)}
                        {(selectedCompany?.email || selectedCompany?.phone) && (
                          <div style={{ marginTop: '1mm' }}>
                            {selectedCompany?.email && (<div>E-mail: {selectedCompany.email}</div>)}
                            {selectedCompany?.phone && (<div>Telefon: {selectedCompany.phone}</div>)}
                          </div>
                        )}
                        {(() => {
                          let list = (companyBankAccounts && companyBankAccounts.length ? companyBankAccounts : (invoice?.company?.bank_accounts || []));
                          if (selectedBlock?.default_bank_account) {
                              const specific = list.find(a => a.id === selectedBlock.default_bank_account);
                              if (specific) list = [specific];
                          }
                          const want = String(currency || '').toUpperCase();
                          const filtered = list.filter(acc => String(acc?.currency || '').toUpperCase() === want);
                          if (!filtered.length) return null;
                          return (
                            <div style={{ marginTop: '2mm' }}>
                              <div style={{ fontWeight: 600 }}>
                                <BilingualLabel label="Bankszámlák" translationMap={translations} show={bilingual} />
                              </div>
                              {filtered.map((acc, i) => (
                                <div key={acc.id || i}>
                                  {acc.account_number && (<span>{(acc.currency || want)}: {acc.account_number} </span>)}
                                  {acc.iban && (<span>IBAN: {acc.iban} </span>)}
                                  {acc.swift_bic && (<span>SWIFT/BIC: {acc.swift_bic} </span>)}
                                  {acc.bank_name && (<span>({acc.bank_name})</span>)}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Invoice Number, Buyer, Payment Info */}
                    <div className="inv-col-right">
                        <div className="inv-title">
                          {isProforma ? 
                            <BilingualLabel label="Díjbekérő" translationMap={translations} show={bilingual} /> : 
                            <BilingualLabel label="Számla" translationMap={translations} show={bilingual} />
                          }
                        </div>
                        <div className="inv-number">
                          {isProforma ? 
                            <BilingualLabel label="Díjbekérő száma" translationMap={translations} show={bilingual} /> : 
                            <BilingualLabel label="Számlaszám" translationMap={translations} show={bilingual} />
                          }: {invoiceNumberValue || '—'}
                        </div>
                        {watch('order_reference') && (
                            <div className="inv-number" style={{ marginTop: '1mm', fontSize: '9pt', fontWeight: 'normal' }}>
                                <BilingualLabel label="Hivatkozási szám" translationMap={translations} show={bilingual} />: {watch('order_reference')}
                            </div>
                        )}

                        <div className="inv-buyer-sm" style={{ marginTop: '4mm' }}>
                          <div className="inv-block-title">
                            <BilingualLabel label="Vevő" translationMap={translations} show={bilingual} />
                          </div>
                          <div className="inv-buyer-name">{selectedCustomer?.name || '—'}</div>
                            {(selectedCustomer?.tax_number || selectedCustomer?.full_tax_number) && (
                              <div>Adószám: {formatFullTax(selectedCustomer)}</div>
                            )}
                            {selectedCustomer?.eu_tax_number && (<div>EU adószám: {selectedCustomer.eu_tax_number}</div>)}
                            {(selectedCustomer?.group_tax_number || selectedCustomer?.vat_group_id) && (
                              <>
                                <div>Csoport adószám: {formatTaxDisplay(selectedCustomer?.group_tax_number || selectedCustomer?.vat_group_id)}</div>
                                {selectedCustomer?.vat_group_member_tax_number && (<div>Csoport tag adószám: {formatTaxDisplay(selectedCustomer.vat_group_member_tax_number)}</div>)}
                              </>
                            )}
                            {(selectedCustomer?.postal_code || selectedCustomer?.city) && (
                              <div>{(selectedCustomer?.postal_code || '')} {selectedCustomer?.city || ''}</div>
                            )}
                            {selectedCustomer?.address ? (
                              <div>{selectedCustomer.address}</div>
                            ) : (
                              <div>
                                {(selectedCustomer?.street_name || '')}
                                {selectedCustomer?.public_place_category ? ` ${selectedCustomer.public_place_category}` : ''}
                                {selectedCustomer?.street_number ? ` ${selectedCustomer.street_number}` : ''}
                                {selectedCustomer?.building ? ` ${selectedCustomer.building}` : ''}
                                {selectedCustomer?.staircase ? ` ${selectedCustomer.staircase}` : ''}
                                {selectedCustomer?.floor ? ` ${selectedCustomer.floor}` : ''}
                                {selectedCustomer?.door ? ` ${selectedCustomer.door}` : ''}
                              </div>
                            )}
                            {selectedCustomer?.country && (
                              <div style={{ marginTop: '1mm' }}>{selectedCustomer.country}</div>
                            )}
                        </div>

                        <div className="inv-highlight" style={{ marginTop: '4mm' }}>
                          <div className="inv-amount">
                            <span className="label"><BilingualLabel label={payLabel} translationMap={translations} show={bilingual} /></span>
                            <span className="value">{payAmountAbs.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</span>
                          </div>
                          
                          <div className="inv-deadline">
                            <span className="muted"><BilingualLabel label="Fizetési határidő" translationMap={translations} show={bilingual} /></span>
                            <span className="date-pill">{dueDateStr || '—'}</span>
                          </div>
                        </div>
                    </div>
                  </div>

                  {/* META ROW */}
                  <div className="inv-meta-row" style={{ marginTop: 0, paddingTop: '4mm' }}>
                      <div>
                        <div className="muted"><BilingualLabel label="Kelt" translationMap={translations} show={bilingual} /></div>
                        <div>{issueDateStr || '—'}</div>
                      </div>
                      <div>
                        <div className="muted"><BilingualLabel label="Teljesítés" translationMap={translations} show={bilingual} /></div>
                        <div>{deliveryDateStr || issueDateStr || '—'}</div>
                      </div>
                      <div>
                        <div className="muted"><BilingualLabel label="Pénznem" translationMap={translations} show={bilingual} /></div>
                        <div>{currency}</div>
                      </div>
                      {(exchangeRateValue > 0 && String(currency) !== 'HUF') && (
                          <div>
                            <div className="muted"><BilingualLabel label="Árfolyam" translationMap={translations} show={bilingual} /></div>
                            <div>{Number(exchangeRateValue).toLocaleString('hu-HU', { maximumFractionDigits: 4 })} HUF/{currency}</div>
                          </div>
                      )}
                      <div>
                        <div className="muted"><BilingualLabel label="Fizetési mód" translationMap={translations} show={bilingual} /></div>
                        <div><BilingualLabel label={PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod} translationMap={translations} show={bilingual} /></div>
                        {paidAmountDisplay > 0 && (
                          isSettledDisplay ? (
                            <div style={{ fontSize: '0.85em', color: '#1e824c', marginTop: 2 }}>
                              Rendezve: {invoice?.payment_date ? formatDateDisplay(invoice.payment_date) : '—'}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.85em', color: '#b42318', marginTop: 2 }}>
                              Hátralék: {remainingDisplay.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}
                            </div>
                          )
                        )}
                      </div>
                  </div>
                  </div>
                </td>
              </tr>

              {/* Items table */}
              <tr>
                <td colSpan="2" style={{ border: 'none', padding: 0 }}>
        
                  {/* Items Table */}
                  <table className="inv-items" style={{ width: '100%', marginTop: '4mm' }}>
            <thead>
              <tr className="inv-items-header-row">
                <th className="col-desc"><BilingualLabel label="Megnevezés" translationMap={translations} show={bilingual} separator=" / " /></th>
                <th className="cen col-qty"><BilingualLabel label="Menny." translationMap={translations} show={bilingual} separator="/" /></th>
                <th className="cen col-unit"><BilingualLabel label="Egység" translationMap={translations} show={bilingual} separator="/" /></th>
                <th className="num col-unitnet">
                   <BilingualLabel label="Egységár" translationMap={translations} show={bilingual} separator="/" />
                   <div className="muted" style={{ fontSize: '0.8em', fontWeight: 'normal' }}>
                      <BilingualLabel label="(Nettó)" translationMap={translations} show={bilingual} separator="/" />
                   </div>
                </th>
                <th className="cen col-vatrate"><BilingualLabel label="ÁFA" translationMap={translations} show={bilingual} separator="/" /></th>
                <th className="num col-net"><BilingualLabel label="Nettó" translationMap={translations} show={bilingual} separator="/" /></th>
                <th className="num col-vat"><BilingualLabel label="ÁFA értéke" translationMap={translations} show={bilingual} separator="/" /></th>
                <th className="num col-gross"><BilingualLabel label="Bruttó" translationMap={translations} show={bilingual} separator="/" /></th>
              </tr>
            </thead>
            <tbody>
              {(watchedItems || []).map((it, idx) => {
                const qty = Number(it?.quantity || 0) || 0;
                // Prefer historical metadata or direct item value
                const unit = (itemMeta[idx]?.uom || it?.unit_of_measure || it?.unit || 'db');
                const unitPrice = Number(it?.unit_price || 0) || 0;
                
                // Use the shared calculation logic to ensure consistent rounding
                const { netAmount, vatAmount, grossAmount } = calculateItemTotals(it);
                
                let vatLabel = `${Number(it?.vat_rate || 0).toLocaleString('hu-HU')}%`;
                // Prefer historical VAT name
                if (itemMeta[idx]?.vat_name) {
                   vatLabel = itemMeta[idx].vat_name;
                } else if (it._vat_name) {
                   vatLabel = it._vat_name;
                } else if (it.vat_type_id && vatTypes) {
                   const vt = vatTypes.find(v => v.id === it.vat_type_id);
                   if (vt) {
                       vatLabel = vt.name || vt.code || vatLabel;
                   }
                }
                
                // Dynamic font class for long VAT labels
                let vatClass = "cen col-vatrate vat-rate-cell";
                if (vatLabel.length > 40) {
                    vatClass += " vat-extra-long";
                } else if (vatLabel.length > 15) {
                    vatClass += " vat-long";
                }
                
                return (
                  <tr key={idx}>
                    <td className="col-desc">{it?.description || ''}</td>
                    <td className="cen col-qty">{qty.toLocaleString('hu-HU')}</td>
                    <td className="cen col-unit">{unit}</td>
                    <td className="num col-unitnet">{unitPrice.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                    <td className={vatClass}>{vatLabel}</td>
                    <td className="num col-net">{netAmount.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                    <td className="num col-vat">{vatAmount.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                    <td className="num col-gross">{grossAmount.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                  </tr>
                );
              })}
            </tbody>
        </table>
        
        {/* Summary Section */}
        <div style={{ pageBreakInside: 'avoid', marginTop: '4mm' }}>
                    {(() => { const vb = vatBreakdown(); return (
                      <table className="inv-items vat-summary-table" style={{ marginTop: '2mm', width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                        <colgroup>
                          <col style={{ width: '20%' }} />
                          <col style={{ width: '26%' }} />
                          <col style={{ width: '27%' }} />
                          <col style={{ width: '27%' }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th className="cen"><BilingualLabel label="ÁFA" translationMap={translations} show={bilingual} separator="/" /></th>
                            <th className="num"><BilingualLabel label="Nettó összeg" translationMap={translations} show={bilingual} separator="/" /></th>
                            <th className="num"><BilingualLabel label="ÁFA összeg" translationMap={translations} show={bilingual} separator="/" /></th>
                            <th className="num"><BilingualLabel label="Bruttó összeg" translationMap={translations} show={bilingual} separator="/" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {vb.rows.map(r => (
                            <tr key={r.rate}>
                              <td className="cen vat-desc-col">
                                  {r.names && r.names.length > 0 ? r.names.join(', ') : `${r.rate.toLocaleString('hu-HU')}%`}
                              </td>
                              <td className="num">{r.net.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                              <td className="num">{r.vat.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                              <td className="num">{r.gross.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                            </tr>
                          ))}
                          {Math.abs(roundingDiff) > 0.001 && (
                            <tr>
                              <td className="cen"><BilingualLabel label="Kerekítés" translationMap={translations} show={bilingual} /></td>
                              <td className="num"></td>
                              <td className="num"></td>
                              <td className="num">{roundingDiff.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</td>
                            </tr>
                          )}
                          <tr>
                            <th><BilingualLabel label="Összesen" translationMap={translations} show={bilingual} separator="/" /> ({currency})</th>
                            <th className="num">{vb.totals.net.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</th>
                            <th className="num">{vb.totals.vat.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</th>
                            <th className="num inv-gross-total">{payableAmount.toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })}</th>
                          </tr>
                          
                          {/* Dual Language Native Currency Summary */}
                          {(bilingual && currency !== 'HUF') && (() => {
                              const exRate = Number(exchangeRateValue) || 1;
                              const hufNet = vb.totals.net * exRate;
                              const hufVat = vb.totals.vat * exRate;
                              const hufGross = vb.totals.gross * exRate;
                              return (
                                  <tr style={{ borderTop: '2px solid #000' }}>
                                    <th><BilingualLabel label="Összesen" translationMap={translations} show={bilingual} separator="/" /> (HUF)</th>
                                    <th className="num">{hufNet.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</th>
                                    <th className="num">{hufVat.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</th>
                                    <th className="num inv-gross-total">{hufGross.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} HUF</th>
                                  </tr>
                              );
                          })()}
                        </tbody>
                      </table>
                    ); })()}
            
                    {(() => {
                      const advs = snapshot?.advances_used || [];
                      if (!Array.isArray(advs) || !advs.length) return null;
                      return (
                        <div className="inv-notes" style={{ marginTop: '4mm' }}>
                          <div className="inv-block-title">Felhasznált előlegek</div>
                          <ul style={{ margin: 0, paddingLeft: '5mm' }}>
                            {advs.map((a, i) => (
                              <li key={i}>Előleg számla: {a.invoice_number} — felhasználva: {Number(a.amount||0).toLocaleString('hu-HU', { minimumFractionDigits: currencyDecimals, maximumFractionDigits: currencyDecimals })} {currency}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
            
                    <div className="inv-words" style={{ marginTop: '4mm' }}>
                      {amountToWordsHU(payableAmount, currency)}
                    </div>
            
                    {notesHtml && (
                      <div className="inv-notes">
                        <div className="inv-block-title">Megjegyzés</div>
                        <div dangerouslySetInnerHTML={{ __html: notesHtml }} />
                      </div>
                    )}
            
                    {blockFootnote && (
                      <div className="inv-notes">
                        <div>{blockFootnote}</div>
                      </div>
                    )}
                </div>
            
            {/* Footer */}
            <div className="inv-footer" style={{ marginTop: '5mm' }}>
              <div>
                {paymentMethod === 'transfer' ? 'Kérjük az összeget átutalással rendezni a fenti bankszámlára.' : 'Köszönjük a fizetést.'}
              </div>
              <div className="inv-fineprint">Ez a számla elektronikus úton készült és aláírás nélkül is érvényes.</div>
            </div>
                </td>
              </tr>
            </tbody>
        </table>
      </div>
      ),
      document.body
      )}
    </>
  );
};

export default InvoiceForm;
