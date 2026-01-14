import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'react-query';
import { toast } from 'react-toastify';
import styled from 'styled-components';
import { Upload, Download, FileText, Users, UserPlus, CheckCircle, AlertCircle, X, Loader } from 'lucide-react';
import { importAPI, companyAPI } from '../services/api';

// [STYLED COMPONENTS REMAIN THE SAME - Keeping existing styles]
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 1.875rem;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  color: #6b7280;
  font-size: 1rem;
`;

const TabContainer = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  border-bottom: 2px solid #e5e7eb;
`;

const Tab = styled.button`
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: ${props => props.active ? '#2563eb' : '#6b7280'};
  background: none;
  border: none;
  border-bottom: 2px solid ${props => props.active ? '#2563eb' : 'transparent'};
  margin-bottom: -2px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    color: #2563eb;
  }
`;

const Card = styled.div`
  background: white;
  border-radius: 0.75rem;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  margin-bottom: 2rem;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const UploadArea = styled.div`
  border: 2px dashed ${props => props.isDragging ? '#2563eb' : '#d1d5db'};
  border-radius: 0.5rem;
  padding: 3rem 2rem;
  text-align: center;
  background: ${props => props.isDragging ? '#eff6ff' : '#f9fafb'};
  transition: all 0.2s;
  cursor: pointer;
  margin-bottom: 1.5rem;

  &:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }
`;

const UploadIcon = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
  color: #6b7280;
`;

const UploadText = styled.p`
  color: #374151;
  font-weight: 500;
  margin-bottom: 0.5rem;
`;

const UploadSubtext = styled.p`
  color: #6b7280;
  font-size: 0.875rem;
`;

const FileInput = styled.input`
  display: none;
`;

const FileName = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #f3f4f6;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #374151;
`;

const CheckboxGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  padding: 0.75rem;
  border-radius: 0.5rem;
  transition: background 0.2s;

  &:hover {
    background: #f3f4f6;
  }
`;

const Checkbox = styled.input`
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
  flex-shrink: 0;
  margin: 0;
  accent-color: #2563eb;
  
  &:hover {
    cursor: pointer;
  }
  
  &:focus {
    outline: 2px solid #2563eb;
    outline-offset: 2px;
  }
`;

const CheckboxText = styled.span`
  color: #374151;
  font-size: 0.938rem;
  user-select: none;
`;

const SelectGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 0.938rem;
  color: #374151;
  background: white;

  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  font-weight: 600;
  font-size: 0.938rem;
  cursor: pointer;
  transition: all 0.2s;
  
  ${props => props.variant === 'primary' && `
    background: #2563eb;
    color: white;
    
    &:hover:not(:disabled) {
      background: #1d4ed8;
    }
    
    &:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
  `}
  
  ${props => props.variant === 'secondary' && `
    background: white;
    color: #2563eb;
    border: 1px solid #2563eb;
    
    &:hover {
      background: #eff6ff;
    }
  `}
`;

// Progress Modal Styles
const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const ModalTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  
  &:hover {
    color: #1f2937;
  }
`;

const ProgressSection = styled.div`
  margin-bottom: 1.5rem;
`;

const ProgressItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
`;

const ProgressLabel = styled.span`
  font-weight: 600;
  color: #374151;
  font-size: 0.938rem;
`;

const ProgressValue = styled.span`
  font-size: 1.125rem;
  font-weight: 700;
  color: #2563eb;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: #e5e7eb;
  border-radius: 1rem;
  overflow: hidden;
  margin-top: 0.5rem;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #2563eb, #3b82f6);
  transition: width 0.3s ease;
  width: ${props => props.percent}%;
`;

const CurrentItemText = styled.p`
  color: #6b7280;
  font-size: 0.875rem;
  margin: 0.5rem 0;
  font-style: italic;
`;

const SpinnerContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #2563eb;
  margin-top: 1rem;
  
  svg {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const ResultCard = styled.div`
  background: ${props => props.type === 'success' ? '#ecfdf5' : '#fef2f2'};
  border: 1px solid ${props => props.type === 'success' ? '#10b981' : '#ef4444'};
  border-radius: 0.5rem;
  padding: 1rem;
  margin-top: 1rem;
`;

const ResultTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: ${props => props.type === 'success' ? '#065f46' : '#991b1b'};
  margin-bottom: 0.5rem;
`;

const ResultText = styled.p`
  color: ${props => {
    if (props.type === 'success') return '#047857';
    if (props.type === 'error') return '#b91c1c';
    if (props.type === 'warning') return '#d97706';
    if (props.type === 'info') return '#0369a1';
    return '#374151';
  }};
  font-size: 0.875rem;
  margin: 0.25rem 0;
`;

const ErrorList = styled.ul`
  margin: 0.5rem 0 0 1.5rem;
  color: #b91c1c;
  font-size: 0.813rem;
`;

const DataImport = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('customers');
  const [customerFile, setCustomerFile] = useState(null);
  const [contactFile, setContactFile] = useState(null);
  const [navValidation, setNavValidation] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Progress tracking state
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState({
    total: 0,
    imported: 0,
    nav_queries: 0,
    updated: 0,
    created: 0,
    current_tax_number: ''
  });
  const eventSourceRef = useRef(null);

  // Fetch companies for NAV validation
  const { data: companies } = useQuery('companies', companyAPI.getCompanies, {
    select: (response) => response.data.results || []
  });

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.csv')) {
        if (type === 'customers') {
          setCustomerFile(file);
        } else {
          setContactFile(file);
        }
      } else {
        toast.error('Csak CSV fájl tölthető fel');
      }
    }
  };

  const handleFileSelect = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (type === 'customers') {
        setCustomerFile(file);
      } else {
        setContactFile(file);
      }
    }
  };

  const handleDownloadSample = async (type) => {
    try {
      const response = type === 'customers'
        ? await importAPI.downloadCustomerSample()
        : await importAPI.downloadContactSample();
      
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = type === 'customers' ? 'ugyfel_minta.csv' : 'kapcsolattarto_minta.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Minta CSV letöltve');
    } catch (error) {
      console.error('Error downloading sample:', error);
      toast.error('Hiba a minta letöltése során');
    }
  };

  const handleImportWithProgress = async () => {
    const file = activeTab === 'customers' ? customerFile : contactFile;
    
    if (!file) {
      toast.error('Válassz ki egy CSV fájlt');
      return;
    }

    if (activeTab === 'customers' && navValidation && !selectedCompany) {
      toast.error('Válassz ki egy céget a NAV validáláshoz');
      return;
    }

    setImporting(true);
    setImportResult(null);
    setShowProgress(true);
    setProgress({ total: 0, imported: 0, nav_queries: 0, updated: 0, created: 0, current_tax_number: '' });

    try {
      if (activeTab === 'customers') {
        // Create FormData and convert to URL parameters for SSE
        const params = new URLSearchParams();
        params.append('nav_validation', navValidation ? 'true' : 'false');
        if (navValidation && selectedCompany) {
          params.append('company_id', selectedCompany);
        }

        // Use FormData to send file
        const formData = new FormData();
        formData.append('file', file);
        formData.append('nav_validation', navValidation ? 'true' : 'false');
        if (navValidation && selectedCompany) {
          formData.append('company_id', selectedCompany);
        }

        // Create URL with file upload via fetch for SSE
        const baseURL = process.env.REACT_APP_API_URL || 
          (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4001');
        
        // Use fetch to upload and stream
        const response = await fetch(`${baseURL}/api/import/customers/streaming/`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Import failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'progress') {
                setProgress(data);
              } else if (data.type === 'complete') {
                setImportResult(data);
                setShowProgress(false);
                
                let successMsg = `${data.total} cég importálva`;
                if (data.nav_found > 0) {
                  successMsg += `, ebből ${data.nav_found} NAV-ból frissítve`;
                }
                toast.success(successMsg);
                
                // Clear file
                setCustomerFile(null);
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            }
          }
        }
      } else {
        // For contacts, use the regular non-streaming import
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await importAPI.importContacts(formData);
        setImportResult(response.data);
        setShowProgress(false);
        toast.success(`Importálás sikeres: ${response.data.created} új, ${response.data.updated} frissített`);
        setContactFile(null);
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error.response?.data?.error || error.message || 'Hiba az importálás során');
      setImportResult({
        success: false,
        error: error.response?.data?.error || error.message || 'Ismeretlen hiba'
      });
      setShowProgress(false);
    } finally {
      setImporting(false);
    }
  };

  const closeProgressModal = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setShowProgress(false);
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.imported / progress.total) * 100) : 0;

  return (
    <Container>
      <Header>
        <Title>Adat Import</Title>
        <Subtitle>Tömeges ügyfél és kapcsolattartó importálás CSV fájlból</Subtitle>
      </Header>

      <TabContainer>
        <Tab active={activeTab === 'customers'} onClick={() => { setActiveTab('customers'); setImportResult(null); }}>
          <Users size={20} />
          Ügyfelek
        </Tab>
        <Tab active={activeTab === 'contacts'} onClick={() => { setActiveTab('contacts'); setImportResult(null); }}>
          <UserPlus size={20} />
          Kapcsolattartók
        </Tab>
      </TabContainer>

      {activeTab === 'customers' && (
        <Card>
          <SectionTitle>
            <Users size={24} />
            Ügyfél Import
          </SectionTitle>

          <UploadArea
            isDragging={isDragging}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'customers')}
            onClick={() => document.getElementById('customer-file-input').click()}
          >
            <UploadIcon>
              <Upload size={48} />
            </UploadIcon>
            <UploadText>Kattints vagy húzd ide a CSV fájlt</UploadText>
            <UploadSubtext>Csak .csv formátum támogatott</UploadSubtext>
          </UploadArea>

          <FileInput
            id="customer-file-input"
            type="file"
            accept=".csv"
            onChange={(e) => handleFileSelect(e, 'customers')}
          />

          {customerFile && (
            <FileName>
              <FileText size={16} />
              {customerFile.name}
            </FileName>
          )}

          <CheckboxGroup>
            <CheckboxLabel>
              <Checkbox
                type="checkbox"
                checked={navValidation}
                onChange={(e) => setNavValidation(e.target.checked)}
              />
              <CheckboxText>
                Automatikus NAV API ellenőrzés (adószámok validálása és adatok frissítése)
              </CheckboxText>
            </CheckboxLabel>
          </CheckboxGroup>

          {navValidation && (
            <SelectGroup>
              <Label>Cég kiválasztása a NAV konfigurációhoz</Label>
              <Select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
                <option value="">Válassz céget...</option>
                {companies?.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name} ({company.tax_number})
                  </option>
                ))}
              </Select>
            </SelectGroup>
          )}

          <ButtonGroup>
            <Button variant="primary" onClick={handleImportWithProgress} disabled={importing || !customerFile}>
              <Upload size={18} />
              {importing ? 'Importálás folyamatban...' : 'Importálás'}
            </Button>
            <Button variant="secondary" onClick={() => handleDownloadSample('customers')}>
              <Download size={18} />
              Minta CSV letöltése
            </Button>
          </ButtonGroup>

          {importResult && !showProgress && (
            <ResultCard type={importResult.success ? 'success' : 'error'}>
              <ResultTitle type={importResult.success ? 'success' : 'error'}>
                {importResult.success ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                {importResult.success ? 'Importálás befejezve' : 'Hiba történt'}
              </ResultTitle>
              {importResult.success && (
                <>
                  <ResultText type="success">Létrehozott: {importResult.created} db</ResultText>
                  <ResultText type="success">Frissített: {importResult.updated} db</ResultText>
                  {importResult.nav_found !== undefined && (
                    <>
                      <ResultText type="info">NAV API-ból frissítve: {importResult.nav_found} db</ResultText>
                      {importResult.nav_not_found && importResult.nav_not_found.length > 0 && (
                        <>
                          <ResultText type="warning">
                            NAV-ban nem található ({importResult.nav_not_found_count} db):
                          </ResultText>
                          <ErrorList>
                            {importResult.nav_not_found.map((company, idx) => (
                              <li key={idx}>
                                {company.name} (Adószám: {company.tax_number})
                              </li>
                            ))}
                          </ErrorList>
                        </>
                      )}
                    </>
                  )}
                  {importResult.errors > 0 && (
                    <>
                      <ResultText type="error">Hibák: {importResult.errors} db</ResultText>
                      {importResult.error_details && importResult.error_details.length > 0 && (
                        <ErrorList>
                          {importResult.error_details.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ErrorList>
                      )}
                    </>
                  )}
                </>
              )}
              {!importResult.success && (
                <ResultText type="error">{importResult.error}</ResultText>
              )}
            </ResultCard>
          )}
        </Card>
      )}

      {activeTab === 'contacts' && (
        <Card>
          <SectionTitle>
            <UserPlus size={24} />
            Kapcsolattartó Import
          </SectionTitle>

          <UploadArea
            isDragging={isDragging}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, 'contacts')}
            onClick={() => document.getElementById('contact-file-input').click()}
          >
            <UploadIcon>
              <Upload size={48} />
            </UploadIcon>
            <UploadText>Kattints vagy húzd ide a CSV fájlt</UploadText>
            <UploadSubtext>Csak .csv formátum támogatott</UploadSubtext>
          </UploadArea>

          <FileInput
            id="contact-file-input"
            type="file"
            accept=".csv"
            onChange={(e) => handleFileSelect(e, 'contacts')}
          />

          {contactFile && (
            <FileName>
              <FileText size={16} />
              {contactFile.name}
            </FileName>
          )}

          <div style={{ padding: '1rem', background: '#eff6ff', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
            <p style={{ color: '#1e40af', fontSize: '0.875rem', margin: 0 }}>
              <strong>Automatikus céghez kapcsolás:</strong><br/>
              • Ha van adószám: automatikusan hozzákapcsolódik a megfelelő ügyfélhez<br/>
              • Ha nincs adószám: magánszemély kapcsolattartó<br/>
              • Ha nincs az adószám az ügyfelek között: kihagyásra kerül
            </p>
          </div>

          <ButtonGroup>
            <Button variant="primary" onClick={handleImportWithProgress} disabled={importing || !contactFile}>
              <Upload size={18} />
              {importing ? 'Importálás folyamatban...' : 'Importálás'}
            </Button>
            <Button variant="secondary" onClick={() => handleDownloadSample('contacts')}>
              <Download size={18} />
              Minta CSV letöltése
            </Button>
          </ButtonGroup>

          {importResult && !showProgress && (
            <ResultCard type={importResult.success ? 'success' : 'error'}>
              <ResultTitle type={importResult.success ? 'success' : 'error'}>
                {importResult.success ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                {importResult.success ? 'Importálás befejezve' : 'Hiba történt'}
              </ResultTitle>
              {importResult.success && (
                <>
                  <ResultText type="success">Létrehozott: {importResult.created} db</ResultText>
                  <ResultText type="success">Frissített: {importResult.updated} db</ResultText>
                  {importResult.skipped > 0 && (
                    <ResultText type="error">Kihagyott (nincs ügyfél): {importResult.skipped} db</ResultText>
                  )}
                  {importResult.errors > 0 && (
                    <>
                      <ResultText type="error">Hibák: {importResult.errors} db</ResultText>
                      {importResult.error_details && importResult.error_details.length > 0 && (
                        <ErrorList>
                          {importResult.error_details.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ErrorList>
                      )}
                    </>
                  )}
                </>
              )}
              {!importResult.success && (
                <ResultText type="error">{importResult.error}</ResultText>
              )}
            </ResultCard>
          )}
        </Card>
      )}

      {/* Progress Modal */}
      {showProgress && (
        <ModalOverlay onClick={(e) => e.target === e.currentTarget && closeProgressModal()}>
          <ModalContainer>
            <ModalHeader>
              <ModalTitle>Importálás folyamatban</ModalTitle>
              <CloseButton onClick={closeProgressModal} disabled={importing}>
                <X size={20} />
              </CloseButton>
            </ModalHeader>

            <ProgressSection>
              <ProgressItem>
                <ProgressLabel>Összesen Cég:</ProgressLabel>
                <ProgressValue>{progress.total}</ProgressValue>
              </ProgressItem>

              <ProgressItem>
                <ProgressLabel>Importált:</ProgressLabel>
                <ProgressValue>{progress.imported}</ProgressValue>
              </ProgressItem>

              {navValidation && (
                <ProgressItem>
                  <ProgressLabel>NAV Lekérdezés:</ProgressLabel>
                  <ProgressValue>{progress.nav_queries}</ProgressValue>
                </ProgressItem>
              )}

              <ProgressItem>
                <ProgressLabel>Felülírás:</ProgressLabel>
                <ProgressValue>{progress.updated}</ProgressValue>
              </ProgressItem>

              <ProgressItem>
                <ProgressLabel>Új létrehozva:</ProgressLabel>
                <ProgressValue>{progress.created}</ProgressValue>
              </ProgressItem>
            </ProgressSection>

            <ProgressBar>
              <ProgressFill percent={progressPercent} />
            </ProgressBar>

            {progress.current_tax_number && (
              <CurrentItemText>
                Feldolgozás: {progress.current_tax_number}
              </CurrentItemText>
            )}

            <SpinnerContainer>
              <Loader size={20} />
              <span>{progressPercent}% kész</span>
            </SpinnerContainer>
          </ModalContainer>
        </ModalOverlay>
      )}
    </Container>
  );
};

export default DataImport;
