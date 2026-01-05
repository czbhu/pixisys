import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { ChevronDown, Building2 } from 'lucide-react';
import styled from 'styled-components';
import { companyAPI } from '../services/api';

const CompanySelectorContainer = styled.div`
  padding: 16px;
  border-bottom: 1px solid #ecf0f1;
  background: #f8f9fa;
`;

const SelectorButton = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.1);
  }

  &:focus {
    outline: none;
    border-color: #3498db;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.25);
  }
`;

const CompanyName = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Dropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 16px;
  right: 16px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
`;

const DropdownItem = styled.div`
  padding: 12px 16px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
  border-bottom: 1px solid #f8f9fa;

  &:hover {
    background-color: #f8f9fa;
  }

  &.selected {
    background-color: #e3f2fd;
    color: #1976d2;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const CompanyInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CompanyTitle = styled.div`
  font-weight: 500;
  color: #2c3e50;
`;

const CompanyDetails = styled.div`
  font-size: 12px;
  color: #7f8c8d;
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  color: #7f8c8d;
`;

const ErrorMessage = styled.div`
  padding: 12px 16px;
  color: #e74c3c;
  font-size: 14px;
  text-align: center;
`;

const STORAGE_KEY = 'selectedCompanyId';

const CompanySelector = ({ selectedCompany, onCompanyChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const { data: companies, isLoading, error } = useQuery(
    ['companies'],
    () => companyAPI.getCompanies({ is_active: true }),
    {
      select: (response) => response.data?.results || []
    }
  );

  useEffect(() => {
    if (!companies || companies.length === 0) return;
    // If we already have a selected company, ensure it is persisted
    if (selectedCompany) {
      try { localStorage.setItem(STORAGE_KEY, selectedCompany.id); } catch {}
      return;
    }
    // Try restore from localStorage
    let storedId = null;
    try { storedId = localStorage.getItem(STORAGE_KEY); } catch {}
    const restored = storedId ? companies.find(c => c.id === storedId) : null;
    if (restored) {
      onCompanyChange(restored);
    } else {
      // Fallback to first active company
      onCompanyChange(companies[0]);
    }
  }, [companies, selectedCompany, onCompanyChange]);

  const handleCompanySelect = (company) => {
    onCompanyChange(company);
    try { localStorage.setItem(STORAGE_KEY, company.id); } catch {}
    setIsOpen(false);
  };

  const handleButtonClick = () => {
    setIsOpen(!isOpen);
  };

  const handleBlur = () => {
    // Delay to allow click on dropdown items
    setTimeout(() => setIsOpen(false), 150);
  };

  if (isLoading) {
    return (
      <CompanySelectorContainer>
        <LoadingSpinner>Betöltés...</LoadingSpinner>
      </CompanySelectorContainer>
    );
  }

  if (error) {
    return (
      <CompanySelectorContainer>
        <ErrorMessage>Hiba történt a cégek betöltése során</ErrorMessage>
      </CompanySelectorContainer>
    );
  }

  return (
    <CompanySelectorContainer>
      <div style={{ position: 'relative' }}>
        <SelectorButton
          onClick={handleButtonClick}
          onBlur={handleBlur}
          type="button"
        >
          <Building2 size={16} />
          <CompanyName>
            {selectedCompany ? selectedCompany.name : 'Válasszon céget...'}
          </CompanyName>
          <ChevronDown size={16} />
        </SelectorButton>

        {isOpen && companies && companies.length > 0 && (
          <Dropdown>
            {companies.map((company) => (
              <DropdownItem
                key={company.id}
                onClick={() => handleCompanySelect(company)}
                className={selectedCompany?.id === company.id ? 'selected' : ''}
              >
                <CompanyInfo>
                  <CompanyTitle>{company.name}</CompanyTitle>
                  <CompanyDetails>
                    {company.tax_number} • {company.city}
                  </CompanyDetails>
                </CompanyInfo>
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>
    </CompanySelectorContainer>
  );
};

export default CompanySelector;
