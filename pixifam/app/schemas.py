from pydantic import BaseModel
from typing import Optional, List


class OpenCloseDayRequest(BaseModel):
    systemId: str


class TelemetryHelloRequest(BaseModel):
    systemId: str


class QueryTaxpayerRequest(BaseModel):
    systemId: str
    taxpayerId: str


class EcrEventRequest(BaseModel):
    systemId: str
    ecrEventType: str
    ecrEventValue: Optional[str] = None


class CurrencyPayload(BaseModel):
    currencyCode: str
    conversionValue: str
    displayPrecision: int = 0
    isNative: bool = False
    symbol: str = ''


class PaymentMethodPayload(BaseModel):
    id: Optional[int] = None
    systemId: str
    displayName: str
    moneyCat: str
    moneySubCat: Optional[str] = None
    currency: str
    sortKey: str


class TaxNumberOut(BaseModel):
    taxpayerId: str
    vatCode: str
    countyCode: str


class TaxpayerAddressOut(BaseModel):
    countryCode: str = 'HU'
    postalCode: str = ''
    city: str = ''
    streetName: str = ''
    streetType: str = ''
    number: str = ''
    building: Optional[str] = None
    staircase: Optional[str] = None
    floor: Optional[str] = None
    door: Optional[str] = None


class TaxpayerDataOut(BaseModel):
    taxpayerName: str
    taxpayerShortName: str
    taxNumber: TaxNumberOut
    taxpayerAddressList: List[dict]


class NavConfigPayload(BaseModel):
    mode: str = 'mock'
    env: str = 'sandbox'
    connector: str = 'cloud_fam'
    base_url: str = ''
    api_key: str = ''
    live_submit_path: str = '/api/customers/submit_document/'
    live_taxpayer_path: str = '/api/customers/lookup_taxpayer/'
    hepg_base_url: str = ''
    hepg_submit_path: str = '/api/v1/receipt'
    hepg_api_key: str = ''
    hepg_device_id: str = ''
    tech_user: str = ''
    tech_password: str = ''
    signing_key_ref: str = ''
    exchange_key_ref: str = ''
    invoice_enabled: bool = False
    ereceipt_enabled: bool = False
    timeout_sec: int = 20
    retry_limit: int = 3


class DocumentSubmitPayload(BaseModel):
    systemId: str
    documentType: str  # receipt | invoice
    source: str = 'manual'
    externalId: str
    payload: dict
