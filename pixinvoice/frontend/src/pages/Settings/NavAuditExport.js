import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Download, AlertTriangle, Calendar, FileText } from 'lucide-react';
import api from '../../services/api';
import { toast } from 'react-toastify';

const Container = styled.div`
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
`;

const Title = styled.h2`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  color: #2c3e50;
`;

const Section = styled.div`
  margin-bottom: 32px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
`;

const SectionTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
  
  label {
    display: block;
    margin-bottom: 8px;
    font-weight: 500;
    color: #34495e;
  }
  
  input, select {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    
    &:focus {
      outline: none;
      border-color: #3498db;
    }
  }
`;

const Button = styled.button`
  background: #3498db;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  width: 100%;
  justify-content: center;

  &:hover {
    background: #2980b9;
  }

  &:disabled {
    background: #bdc3c7;
    cursor: not-allowed;
  }
`;

const RadioGroup = styled.div`
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
`;

const RadioLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  
  input {
    width: auto;
  }
`;

const InfoBox = styled.div`
  margin-top: 24px;
  padding: 16px;
  background: #e8f6f3;
  border: 1px solid #d4efdf;
  border-radius: 4px;
  color: #16a085;
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const NavAuditExport = () => {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [mode, setMode] = useState('date'); // 'date' or 'number'
  
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const [invFrom, setInvFrom] = useState('');
  const [invTo, setInvTo] = useState('');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await api.get('/companies/');
      if (response && response.data) {
        let results = [];
        if (Array.isArray(response.data)) {
          results = response.data;
        } else if (response.data.results && Array.isArray(response.data.results)) {
          results = response.data.results;
        }
        
        setCompanies(results);
        
        if (results.length > 0) {
            setSelectedCompanyId(results[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error);
      toast.error('Hiba a cégek betöltésekor');
    }
  };

  const handleExport = async () => {
    if (!selectedCompanyId) {
      toast.error('Kérjük válasszon céget!');
      return;
    }

    if (mode === 'date' && (!dateFrom || !dateTo)) {
      toast.error('Kérjük töltse ki a dátumokat!');
      return;
    }
    
    if (mode === 'number' && (!invFrom || !invTo)) {
      toast.error('Kérjük töltse ki a számlaszámokat!');
      return;
    }

    setLoading(true);
    try {
      const params = {
        company_id: selectedCompanyId,
        date_from: mode === 'date' ? dateFrom : undefined,
        date_to: mode === 'date' ? dateTo : undefined,
        invoice_num_from: mode === 'number' ? invFrom : undefined,
        invoice_num_to: mode === 'number' ? invTo : undefined
      };
      
      const response = await api.get('/nav-audit-export/', {
        params,
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers['content-disposition'];
      let fileName = 'nav_audit_export.xml';
      if (contentDisposition) {
        const matches = /filename="([^"]*)"/.exec(contentDisposition);
        if (matches != null && matches[1]) {
            fileName = matches[1];
        }
      }
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Sikeres exportálás');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Hiba az exportálás során. Ellenőrizze az adatokat!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <Title>
        <FileText size={28} />
        Adóhatósági ellenőrzési adatszolgáltatás
      </Title>
      
      <p style={{ color: '#666', marginBottom: '24px' }}>
        A funkció segítségével a 23/2014. (VI. 30.) NGM rendelet szerinti XML export készíthető az adóhatósági ellenőrzéshez.
      </p>

      <FormGroup>
        <label>Kibocsátó Cég</label>
        <select 
          value={selectedCompanyId} 
          onChange={(e) => setSelectedCompanyId(e.target.value)}
        >
          <option value="">Válasszon céget...</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.tax_number})
            </option>
          ))}
        </select>
      </FormGroup>

      <RadioGroup>
        <RadioLabel>
          <input 
            type="radio" 
            name="mode" 
            checked={mode === 'date'} 
            onChange={() => setMode('date')}
          />
          Kelt dátum szerinti szűrés
        </RadioLabel>
        <RadioLabel>
          <input 
            type="radio" 
            name="mode" 
            checked={mode === 'number'} 
            onChange={() => setMode('number')}
          />
          Számlaszám szerinti szűrés
        </RadioLabel>
      </RadioGroup>

      <Section>
        {mode === 'date' ? (
          <>
            <SectionTitle><Calendar size={18} /> Dátum intervallum</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <FormGroup>
                <label>Kezdő dátum</label>
                <input 
                    type="date" 
                    value={dateFrom} 
                    onChange={(e) => setDateFrom(e.target.value)} 
                />
                </FormGroup>
                <FormGroup>
                <label>Záró dátum</label>
                <input 
                    type="date" 
                    value={dateTo} 
                    onChange={(e) => setDateTo(e.target.value)} 
                />
                </FormGroup>
            </div>
          </>
        ) : (
          <>
            <SectionTitle><FileText size={18} /> Számlaszám intervallum</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <FormGroup>
                <label>Kezdő számlaszám</label>
                <input 
                    type="text" 
                    value={invFrom} 
                    onChange={(e) => setInvFrom(e.target.value)} 
                    placeholder="pl. 2024/00001"
                />
                </FormGroup>
                <FormGroup>
                <label>Záró számlaszám</label>
                <input 
                    type="text" 
                    value={invTo} 
                    onChange={(e) => setInvTo(e.target.value)} 
                    placeholder="pl. 2024/00100"
                />
                </FormGroup>
            </div>
          </>
        )}
      </Section>

      <Button onClick={handleExport} disabled={loading}>
        {loading ? 'Exportálás...' : (
          <>
            <Download size={18} /> Export XML letöltése
          </>
        )}
      </Button>

      <InfoBox>
        <AlertTriangle size={24} style={{ minWidth: '24px' }} />
        <div>
          <strong>Információ:</strong> Az elkészült fájl a NAV által előírt XML szerkezetet követi. 
          A fájlt ellenőrzés céljából kérheti az adóhatóság. A letöltött fájl közvetlenül átadható.
        </div>
      </InfoBox>
    </Container>
  );
};

export default NavAuditExport;
