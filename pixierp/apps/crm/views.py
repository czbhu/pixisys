from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.db import models
from .models import Company, Contact
from .serializers import CompanySerializer, ContactSerializer, ContactCreateSerializer
import os
import requests
from decouple import config as dconfig
from apps.finance.views import PixinvoiceClient

class CompanyViewSet(viewsets.ModelViewSet):
    """Cég ViewSet"""
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        """Cég queryset szűrése is_customer és is_supplier alapján"""
        queryset = Company.objects.all()
        
        # Szűrés ügyfél vagy beszállító szerepre
        is_customer = self.request.query_params.get('is_customer')
        is_supplier = self.request.query_params.get('is_supplier')
        
        if is_customer is not None:
            queryset = queryset.filter(is_customer=is_customer.lower() == 'true')
        
        if is_supplier is not None:
            queryset = queryset.filter(is_supplier=is_supplier.lower() == 'true')
        
        # Backward compatibility - company_type paraméter támogatása
        company_type = self.request.query_params.get('company_type')
        if company_type == 'customer':
            queryset = queryset.filter(is_customer=True)
        elif company_type == 'supplier':
            queryset = queryset.filter(is_supplier=True)
        
        return queryset
    
    def perform_create(self, serializer):
        """Cég létrehozásakor beállítjuk a létrehozót"""
        if self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()
    
    def perform_update(self, serializer):
        """Cég módosításakor beállítjuk a létrehozót"""
        if self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()
    
    def destroy(self, request, *args, **kwargs):
        """Cég törlése összes adat kezelésével"""
        instance = self.get_object()
        action = request.query_params.get('action', 'delete_all')
        reassign_to = request.query_params.get('reassign_to')
        
        if action == 'delete_all':
            # Összes adat törlése
            Contact.objects.filter(company=instance).delete()
            # Itt később hozzáadhatjuk a többi modul adatainak törlését is
            # pl. Order.objects.filter(company=instance).delete()
            # pl. Quote.objects.filter(company=instance).delete()
        elif action == 'reassign_all' and reassign_to:
            # Összes adat áthelyezése másik céghez
            try:
                new_company = Company.objects.get(id=reassign_to)
                Contact.objects.filter(company=instance).update(company=new_company)
                # Itt később hozzáadhatjuk a többi modul adatainak áthelyezését is
                # pl. Order.objects.filter(company=instance).update(company=new_company)
                # pl. Quote.objects.filter(company=instance).update(company=new_company)
            except Company.DoesNotExist:
                return Response({'error': 'Célcég nem található'}, status=status.HTTP_400_BAD_REQUEST)
        elif action == 'keep_data':
            # Adatok megtartása cég nélkül
            Contact.objects.filter(company=instance).update(company=None)
            # Itt később hozzáadhatjuk a többi modul adatainak kezelését is
            # pl. Order.objects.filter(company=instance).update(company=None)
            # pl. Quote.objects.filter(company=instance).update(company=None)
        
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """Cég keresése név vagy adószám alapján"""
        query = request.query_params.get('q', '')
        if query:
            companies = Company.objects.filter(
                models.Q(name__icontains=query) | 
                models.Q(tax_number__icontains=query) |
                models.Q(group_tax_number__icontains=query) |
                models.Q(eu_tax_number__icontains=query)
            )
        else:
            companies = Company.objects.all()
        
        serializer = self.get_serializer(companies, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='nav_lookup')
    def nav_lookup(self, request):
        """NAV cégadat lekérdezés PIXINVOICE API-val adószám első 8 karakter (törzsszám) alapján.

        Query params:
        - tax8: kötelező, az adószám első 8 számjegye
        - tax: opcionális, teljes adószám (számjegyekre tisztítva). Ha megadott, ezt küldjük a lookup_taxpayer-nek.
        - country: opcionális, default 'HU'
        """
        raw_tax8 = (request.query_params.get('tax8') or '').strip()
        tax_full = (request.query_params.get('tax') or '').strip()
        # Tisztítás csak számjegyekre
        tax_full_digits = ''.join(ch for ch in tax_full if ch.isdigit()) if tax_full else ''
        tax8 = ''.join(ch for ch in raw_tax8 if ch.isdigit()) if raw_tax8 else (tax_full_digits[:8] if tax_full_digits else '')
        country = (request.query_params.get('country') or 'HU').upper()
        if not tax8 or not tax8.isdigit() or len(tax8) != 8:
            return Response({'error': 'Érvénytelen adószám törzsszám (8 számjegy szükséges).'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            # Használjuk az aktív PixInvoice konfigurációt a kliensen keresztül
            client = PixinvoiceClient()
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            # A lookup_taxpayer a 'tax_number' mezőt várja; ha van teljes szám, azt használjuk, különben a törzsszámot
            tax_for_lookup = tax_full_digits if tax_full_digits else tax8
            debug_enabled = str(request.query_params.get('debug') or '').lower() in ('1', 'true', 'yes')
            debug_info = {
                'requested': {'tax8': tax8, 'tax_full': tax_full_digits, 'used_tax': tax_for_lookup},
                'client': {'base': getattr(client, 'base', ''), 'has_company_id': bool(getattr(client, 'company_id', ''))},
            }

            data = None
            primary_error = None
            try:
                payload = client.lookup_taxpayer(tax_for_lookup)
                data = payload.get('data') if isinstance(payload, dict) and 'data' in payload else payload
                if debug_enabled:
                    debug_info['primary'] = {'data': data}
            except requests.exceptions.RequestException as e:
                primary_error = str(e)
                if debug_enabled:
                    debug_info['primary'] = {'error': primary_error}

            # Ha nincs érdemi adat, próbáljunk meg visszaesni a publikus PixInvoice companies API-ra (ha van kulcs)
            def normalize(d: dict):
                d = d or {}
                # 1) NAV taxpayer formátum kezelése
                if d.get('taxpayer_name') or d.get('taxpayer_address_list'):
                    name = d.get('taxpayer_short_name') or d.get('taxpayer_name') or ''
                    tdet = d.get('tax_number_detail') or {}
                    tpid = tdet.get('taxpayerId') or d.get('taxpayerId') or ''
                    vatc = str(tdet.get('vatCode') or '').strip()
                    ctyc = str(tdet.get('countyCode') or '').strip()
                    if tpid and vatc and ctyc:
                        tax_number = f"{tpid}-{vatc}-{ctyc}"
                    else:
                        tax_number = tpid or ''
                    eu_tax_number = f"HU{tpid}" if tpid else ''
                    addr_list = d.get('taxpayer_address_list') or []
                    addr = None
                    # Preferáljuk a HQ címet
                    for a in addr_list:
                        if (a or {}).get('taxpayerAddressType') == 'HQ':
                            addr = a
                            break
                    if not addr and addr_list:
                        addr = addr_list[0]
                    country_code = (addr or {}).get('countryCode') or 'HU'
                    country_name = 'Magyarország' if country_code == 'HU' else country_code
                    postal_code = (addr or {}).get('postalCode') or ''
                    city = (addr or {}).get('city') or ''
                    street_name = (addr or {}).get('streetName') or (addr or {}).get('street') or ''
                    street_type = (addr or {}).get('publicPlaceCategory') or (addr or {}).get('streetType') or 'utca'
                    if street_type and street_type.upper() == 'N/A':
                        street_type = 'utca'
                    house_number = (addr or {}).get('number') or (addr or {}).get('houseNumber') or ''
                    parts = [p for p in [postal_code, city, street_name, street_type, house_number] if p]
                    full_address = ' '.join(parts)
                    return {
                        'name': name,
                        'company_type': 'customer',
                        'tax_number': tax_number or f"{tax8}--",
                        'group_tax_number': '',
                        'eu_tax_number': eu_tax_number,
                        'country': country_name or 'Magyarország',
                        'postal_code': postal_code,
                        'city': city,
                        'street_name': street_name,
                        'street_type': street_type or 'utca',
                        'house_number': house_number,
                        'full_address': full_address,
                    }
                # 2) Vállalati companies API formátum
                name = d.get('name') or d.get('companyName') or ''
                tax_number = d.get('taxNumber') or d.get('tax_number') or ''
                group_tax_number = d.get('groupTaxNumber') or d.get('group_tax_number') or ''
                eu_tax_number = d.get('euTaxNumber') or d.get('eu_tax_number') or ''
                addr = d.get('address') or {}
                country_name = addr.get('country') or 'Magyarország'
                postal_code = addr.get('postalCode') or addr.get('zip') or ''
                city = addr.get('city') or ''
                street_name = addr.get('street') or addr.get('streetName') or ''
                street_type = addr.get('streetType') or 'utca'
                house_number = addr.get('houseNumber') or addr.get('number') or ''
                full_address = addr.get('full') or ''
                return {
                    'name': name,
                    'company_type': 'customer',
                    'tax_number': tax_number or f"{tax8}--",
                    'group_tax_number': group_tax_number or '',
                    'eu_tax_number': eu_tax_number or '',
                    'country': country_name or 'Magyarország',
                    'postal_code': postal_code,
                    'city': city,
                    'street_name': street_name,
                    'street_type': street_type or 'utca',
                    'house_number': house_number,
                    'full_address': full_address,
                }

            normalized = normalize(data or {})
            if normalized is None:
                normalized = {}

            if not normalized.get('name') and not any([normalized.get('postal_code'), normalized.get('city'), normalized.get('street_name')]):
                # Fallback: publikus companies API
                public_base = dconfig('PIXINVOICE_API_BASE', default=os.getenv('PIXINVOICE_API_BASE', 'https://api.pixinvoice.hu'))
                public_key = dconfig('PIXINVOICE_API_KEY', default=os.getenv('PIXINVOICE_API_KEY'))
                # Fallback: használjuk a nyilvános bázist, és lehetőség szerint az aktív kliens kulcsát
                fb_base = dconfig('PIXINVOICE_API_BASE', default=os.getenv('PIXINVOICE_API_BASE', 'https://api.pixinvoice.hu'))
                fb_key = getattr(client, 'key', None) or dconfig('PIXINVOICE_API_KEY', default=os.getenv('PIXINVOICE_API_KEY'))
                if fb_key:
                    url = f"{fb_base.rstrip('/')}/v1/companies/hu/{tax8}"
                    headers = {'Authorization': f'Bearer {fb_key}', 'Accept': 'application/json'}
                    try:
                        resp = requests.get(url, headers=headers, timeout=10)
                        if resp.status_code == 404:
                            out = {'found': False}
                            if debug_enabled:
                                debug_info['fallback'] = {'status': 404, 'body': None}
                                out['debug'] = debug_info
                            return Response(out, status=status.HTTP_200_OK)
                        resp.raise_for_status()
                        fb_json = resp.json() or {}
                        normalized = normalize(fb_json)
                        if debug_enabled:
                            debug_info['fallback'] = {'status': resp.status_code, 'body': fb_json}
                    except requests.exceptions.RequestException as fe:
                        # Hálózati/DNS hiba esetén se dőljünk el, jelezzük found:false-t
                        out = {'found': False}
                        if debug_enabled:
                            debug_info['fallback'] = {'error': str(fe), 'url': url}
                            out['debug'] = debug_info
                        return Response(out, status=status.HTTP_200_OK)

            # Ha továbbra sincs hasznos adat, jelezzük
            if not normalized.get('name') and not any([normalized.get('postal_code'), normalized.get('city'), normalized.get('street_name')]):
                out = {'found': False}
                if debug_enabled:
                    out['debug'] = debug_info
                # Ha a primer hívás is hibára futott és fallback sem hozott adatot, de nincs más lehetőség, adjunk 200-at found:false-szal
                return Response(out, status=status.HTTP_200_OK)

            normalized['found'] = True
            if debug_enabled:
                normalized['debug'] = debug_info
            return Response(normalized, status=status.HTTP_200_OK)
        except requests.exceptions.RequestException as e:
            # Ha idáig jutottunk, sem primer, sem fallback nem sikerült
            return Response({'error': 'NAV/PIXINVOICE lekérdezés sikertelen', 'details': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

class ContactViewSet(viewsets.ModelViewSet):
    """Kapcsolattartó ViewSet"""
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer
    permission_classes = [AllowAny]
    
    def get_serializer_class(self):
        """Létrehozáskor külön serializer használata"""
        if self.action == 'create':
            return ContactCreateSerializer
        return ContactSerializer
    
    def perform_create(self, serializer):
        """Kapcsolattartó létrehozásakor beállítjuk a létrehozót"""
        if self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()
    
    def perform_update(self, serializer):
        """Kapcsolattartó módosításakor beállítjuk a létrehozót"""
        if self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()
    
    @action(detail=False, methods=['get'])
    def by_company(self, request):
        """Kapcsolattartók cég szerint
        
        Query params:
        - company_id: cég ID vagy 'private' magánszemélyekhez
        """
        company_id = request.query_params.get('company_id')
        
        if company_id == 'private':
            # Magánszemélyek (nincs cég hozzárendelve)
            contacts = Contact.objects.filter(company__isnull=True)
        elif company_id:
            # Adott cég kapcsolattartói
            contacts = Contact.objects.filter(company_id=company_id)
        else:
            # Minden kapcsolattartó
            contacts = Contact.objects.all()
        
        serializer = self.get_serializer(contacts, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """Kapcsolattartó keresése név vagy email alapján"""
        query = request.query_params.get('q', '')
        if query:
            contacts = Contact.objects.filter(
                models.Q(name__icontains=query) | 
                models.Q(email__icontains=query)
            )
        else:
            contacts = Contact.objects.all()
        
        serializer = self.get_serializer(contacts, many=True)
        return Response(serializer.data)
