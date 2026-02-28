from rest_framework import generics, status, views, viewsets, filters
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from decouple import config as dconfig
import os
import requests
from datetime import datetime, timezone
from django.db import transaction
from django.db import models
from django_filters.rest_framework import DjangoFilterBackend
from apps.finance.models import (
    Invoice, InvoiceItem, Payment, CashRegister, CashRegisterEmployee,
    CashRegisterTransaction, CashTransactionReason
)
from apps.finance.serializers import (
    InvoiceSerializer, InvoiceItemSerializer, PaymentSerializer,
    CashRegisterSerializer, CashRegisterEmployeeSerializer,
    CashRegisterTransactionSerializer, CashTransactionReasonSerializer
)
from apps.crm.models import Company as CrmCompany
from apps.crm.models import Contact as CrmContact
from apps.core.models import Currency, Company as CoreCompany, BankAccount, PixinvoiceConfig


class PixinvoiceClient:
	def __init__(self):
		cfg = PixinvoiceConfig.objects.filter(is_active=True).order_by('-updated_at').first()
		if cfg and cfg.api_key:
			self.base = (cfg.base_url or 'http://localhost:4001/api/').rstrip('/')
			self.key = cfg.api_key
			self.company_id = (cfg.company_id or '').strip()
		else:
			self.base = dconfig('PIXINVOICE_API_BASE', default=os.getenv('PIXINVOICE_API_BASE', 'http://localhost:4001/api/')).rstrip('/')
			self.key = dconfig('PIXINVOICE_API_KEY', default=os.getenv('PIXINVOICE_API_KEY'))
			self.company_id = dconfig('PIXINVOICE_COMPANY_ID', default=os.getenv('PIXINVOICE_COMPANY_ID', '')).strip()
		if not self.key:
			raise ValueError('PIXINVOICE_API_KEY not configured')
		self.headers = {'X-Api-Key': self.key, 'Accept': 'application/json'}

	def _fetch_all(self, path: str, company_id=None):
		url = f"{self.base}/{path.strip('/')}/"
		cid = company_id or self.company_id
		base_params = {'page_size': 500, 'limit': 500, 'per_page': 500}
		if cid:
			base_params['company_id'] = cid
		items = []
		next_url = url
		page = 1
		while next_url:
			params = None if next_url != url else {**base_params, 'page': page}
			try:
				r = requests.get(next_url, headers=self.headers, params=params, timeout=20)
				r.raise_for_status()
			except requests.HTTPError as e:
				# Fallback: if base missing /v1 and got 404, retry once with /v1 prefix
				if e.response is not None and e.response.status_code == 404 and '/v1/' not in next_url and next_url == url:
					next_url = f"{self.base}/v1/{path.strip('/')}/"
					continue
				raise
			data = r.json() or {}
			if isinstance(data, dict):
				results = data.get('results') or []
				count = data.get('count') or 0
				if results:
					items.extend(results)
				next_url = data.get('next') or None
				if not next_url:
					page += 1
					if count and len(items) < count:
						next_url = url
					elif len(results) >= base_params['page_size']:
						next_url = url
					else:
						break
			else:
				items = data if isinstance(data, list) else []
				break
		return items

	def list_companies(self, company_id=None):
		return self._fetch_all('companies', company_id=company_id)

	def list_customers(self, company_id=None):
		return self._fetch_all('customers', company_id=company_id)

	def get_customer(self, customer_id: str, company_id=None):
		url = f"{self.base}/customers/{customer_id}/"
		params = {'company_id': company_id or self.company_id} if (company_id or self.company_id) else None
		r = requests.get(url, headers=self.headers, params=params, timeout=20)
		r.raise_for_status()
		return r.json()

	def list_customer_bank_accounts(self, customer_id: str, company_id=None):
		url = f"{self.base}/customer-bank-accounts/"
		params = {'customer_id': customer_id, 'customer': customer_id}
		if company_id or self.company_id:
			params['company_id'] = company_id or self.company_id
		r = requests.get(url, headers=self.headers, params=params, timeout=20)
		r.raise_for_status()
		data = r.json()
		if isinstance(data, dict):
			accounts = data.get('results') or data.get('items') or []
		else:
			accounts = data if isinstance(data, list) else []
		if accounts:
			return accounts
		# fallback: fetch all and filter by customer/customer_id
		try:
			all_accounts = self._fetch_all('customer-bank-accounts', company_id=company_id)
			filtered = [acc for acc in all_accounts if str(acc.get('customer') or acc.get('customer_id')) == str(customer_id)]
			if filtered:
				return filtered
		except Exception:
			filtered = []
		# fallback: map to PixInvoice company bank accounts when customer records are empty
		try:
			cust = None
			try:
				cust = self.get_customer(customer_id, company_id=company_id)
			except Exception:
				cust = None
			tax = (cust or {}).get('full_tax_number') or (cust or {}).get('tax_number') or ''
			eu_tax = (cust or {}).get('eu_tax_number') or ''
			name = (cust or {}).get('name') or ''
			companies = self.list_companies(company_id=company_id)
			for comp in companies:
				bank_accs = comp.get('bank_accounts') or []
				if not bank_accs:
					continue
				comp_tax = comp.get('full_tax_number') or comp.get('tax_number') or ''
				comp_eu = comp.get('eu_tax_number') or ''
				tax_digits = ''.join(filter(str.isdigit, str(tax)))[:8]
				comp_digits = ''.join(filter(str.isdigit, str(comp_tax)))[:8]
				if tax_digits and comp_digits and tax_digits == comp_digits:
					return bank_accs
				if eu_tax and comp_eu and str(comp_eu).replace(' ', '').upper().lstrip('HU') == str(eu_tax).replace(' ', '').upper().lstrip('HU'):
					return bank_accs
				if name and comp.get('name') and comp['name'].strip().lower() == name.strip().lower():
					return bank_accs
				if name and comp.get('short_name') and comp['short_name'].strip().lower() == name.strip().lower():
					return bank_accs
		except Exception:
			return filtered
		return filtered

	def upsert_customer(self, payload: dict, customer_id: str = None, company_id=None):
		url = f"{self.base}/customers/"
		if customer_id:
			url += f"{customer_id}/"
		data = dict(payload or {})
		if (company_id or self.company_id) and 'company_id' not in data:
			data['company_id'] = company_id or self.company_id
		r = requests.put(url, headers=self.headers, json=data, timeout=20) if customer_id else requests.post(url, headers=self.headers, json=data, timeout=20)
		r.raise_for_status()
		return r.json()

	def delete_customer(self, customer_id: str, company_id=None):
		if not customer_id:
			return
		params = {'company_id': company_id or self.company_id} if (company_id or self.company_id) else None
		url = f"{self.base}/customers/{customer_id}/"
		r = requests.delete(url, headers=self.headers, params=params, timeout=20)
		if r.status_code in (404, 410):
			return
		r.raise_for_status()

	def list_contacts(self, company_id=None):
		return self._fetch_all('contacts', company_id=company_id)

	def get_contact(self, contact_id: str, company_id=None):
		url = f"{self.base}/contacts/{contact_id}/"
		params = {'company_id': company_id or self.company_id} if (company_id or self.company_id) else None
		r = requests.get(url, headers=self.headers, params=params, timeout=20)
		r.raise_for_status()
		return r.json()

	def upsert_contact(self, payload: dict, contact_id: str = None, company_id=None):
		url = f"{self.base}/contacts/"
		if contact_id:
			url += f"{contact_id}/"
		data = dict(payload or {})
		if (company_id or self.company_id) and 'company_id' not in data:
			data['company_id'] = company_id or self.company_id
		r = requests.put(url, headers=self.headers, json=data, timeout=20) if contact_id else requests.post(url, headers=self.headers, json=data, timeout=20)
		r.raise_for_status()
		return r.json()

	def delete_contact(self, contact_id: str, company_id=None):
		if not contact_id:
			return
		params = {'company_id': company_id or self.company_id} if (company_id or self.company_id) else None
		url = f"{self.base}/contacts/{contact_id}/"
		r = requests.delete(url, headers=self.headers, params=params, timeout=20)
		if r.status_code in (404, 410):
			return
		r.raise_for_status()

	def list_invoices(self, company_id=None):
		return self._fetch_all('invoices', company_id=company_id)

	def list_payments(self, company_id=None):
		return self._fetch_all('payments', company_id=company_id)

	def lookup_taxpayer(self, tax_number: str):
		url = f"{self.base}/customers/lookup_taxpayer/"
		# Extract only digits from tax_number for NAV API (expects first 8 digits only)
		clean_tax = ''.join(filter(str.isdigit, tax_number))[:8]
		payload = {'tax_number': clean_tax}
		if self.company_id:
			payload['company_id'] = self.company_id
		r = requests.post(url, headers=self.headers, json=payload, timeout=20)
		r.raise_for_status()
		return r.json()


def _map_currency(code: str):
	code = (code or 'HUF').upper()
	try:
		return Currency.objects.get(code=code)
	except Currency.DoesNotExist:
		return None


def _compose_address(comp: dict):
	parts = []
	postal = comp.get('postal_code') or comp.get('postalCode') or ''
	city = comp.get('city') or ''
	street = comp.get('street_name') or comp.get('streetName') or comp.get('street') or ''
	plc = comp.get('public_place_category') or comp.get('publicPlaceCategory') or ''
	num = comp.get('street_number') or comp.get('streetNumber') or comp.get('house_number') or comp.get('houseNumber') or ''
	building = comp.get('building') or ''
	stair = comp.get('staircase') or ''
	floor = comp.get('floor') or ''
	door = comp.get('door') or ''
	if postal:
		parts.append(str(postal))
	if city:
		parts.append(city)
	street_line = " ".join([p for p in [street, plc, num] if p]).strip()
	if street_line:
		parts.append(street_line)
	extra = " ".join([p for p in [building, stair, floor, door] if p]).strip()
	if extra:
		parts.append(extra)
	return ", ".join(parts) if parts else ''


def _parse_dt(value):
	"""Parse ISO datetime string to aware datetime in UTC; return None on failure."""
	if not value:
		return None
	if isinstance(value, datetime):
		return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
	try:
		text = str(value).replace('Z', '+00:00')
		dt = datetime.fromisoformat(text)
		return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
	except Exception:
		return None


def _sync_pixinvoice(req_settings=None):
	req_settings = req_settings or {}
	allowed_entities = {'customers', 'suppliers', 'contacts', 'invoices', 'payments'}
	selected_entities = [e for e in req_settings.get('entities', []) if e in allowed_entities] or ['invoices', 'payments']
	strategy = req_settings.get('strategy') or {'type': req_settings.get('strategy_type') or 'newer'}
	company_mappings = req_settings.get('company_mappings') or []

	client = PixinvoiceClient()

	created, updated = 0, 0
	pay_created, pay_updated = 0, 0
	crm_created, crm_updated = 0, 0
	contact_created, contact_updated = 0, 0
	inv_contact_ids = set()
	erp_contact_ext_ids = set()

	company_ids = []
	mapping_lookup = {}
	for mapping in company_mappings:
		cid = (mapping or {}).get('invoice_company_id')
		if cid and cid not in company_ids:
			company_ids.append(cid)
		try:
			erp_id = (mapping or {}).get('erp_company_id') or (mapping or {}).get('erp_company') or (mapping or {}).get('erpCompanyId')
			if erp_id:
				cobj = CrmCompany.objects.filter(id=erp_id).first()
				if cobj:
					mapping_lookup[str(cid)] = cobj
		except Exception:
			pass
	if not company_ids:
		company_ids = [client.company_id or None]

	with transaction.atomic():
		if 'invoices' in selected_entities or 'payments' in selected_entities:
			for cid in company_ids:
				invs = client.list_invoices(company_id=cid)
				for inv in invs:
					ext_id = str(inv.get('id') or inv.get('externalId') or inv.get('uuid'))
					if not ext_id:
						continue
					defaults = {
						'number': inv.get('number') or inv.get('invoiceNumber') or '',
						'issue_date': inv.get('issueDate'),
						'due_date': inv.get('dueDate'),
						'paid_date': inv.get('paidDate'),
						'net_total': inv.get('netTotal') or 0,
						'vat_total': inv.get('vatTotal') or 0,
						'gross_total': inv.get('GrossTotal') or inv.get('grossTotal') or 0,
						'status': inv.get('status') or 'issued',
					}
					obj, was_created = Invoice.objects.update_or_create(external_id=ext_id, defaults=defaults)
					created += 1 if was_created else 0
					updated += 0 if was_created else 1

					partner_payload = inv.get('partner') or {}
					partner_external = str(partner_payload.get('id') or partner_payload.get('externalId') or '')

					cur_obj = _map_currency(inv.get('currency'))
					if obj.currency_id != (cur_obj.id if cur_obj else None):
						obj.currency = cur_obj
						obj.save(update_fields=['currency'])

					partner_tax = partner_payload.get('taxNumber')
					partner_name = partner_payload.get('name')
					partner = None
					if partner_tax:
						partner = CrmCompany.objects.filter(models.Q(tax_number__icontains=partner_tax) | models.Q(eu_tax_number__icontains=partner_tax)).first()
					if not partner and partner_name:
						partner = CrmCompany.objects.filter(name__iexact=partner_name).first()
					updates = {}
					if obj.partner_id != (partner.id if partner else None):
						updates['partner'] = partner
					if partner_external and obj.partner_external_id != partner_external:
						updates['partner_external_id'] = partner_external
					if updates:
						for k, v in updates.items():
							setattr(obj, k, v)
						obj.save(update_fields=list(updates.keys()))

					items = inv.get('items') or []
					if items:
						obj.items.all().delete()
						for i, it in enumerate(items, start=1):
							InvoiceItem.objects.create(
								invoice=obj,
								line_no=i,
								description=it.get('description') or it.get('name') or '',
								quantity=it.get('quantity') or 1,
								unit=it.get('unit') or 'db',
								unit_price=it.get('unitPrice') or it.get('netUnitPrice') or 0,
								vat_rate=it.get('vatRate') or 27,
								net_total=it.get('netTotal') or 0,
								vat_total=it.get('vatTotal') or 0,
								gross_total=it.get('grossTotal') or 0,
							)

			for cid in company_ids:
				pays = client.list_payments(company_id=cid)
				for p in pays:
					ext_id = str(p.get('id') or p.get('externalId') or p.get('uuid'))
					if not ext_id:
						continue
					inv_ext_id = str((p.get('invoice') or {}).get('id') or (p.get('invoice') or {}).get('externalId') or '')
					try:
						inv_obj = Invoice.objects.get(external_id=inv_ext_id)
					except Invoice.DoesNotExist:
						continue
					defaults = {
						'invoice': inv_obj,
						'amount': p.get('amount') or 0,
						'date': p.get('date'),
						'method': p.get('method') or '',
						'note': p.get('note') or '',
					}
					defaults['currency'] = _map_currency(p.get('currency'))

					obj, was_created = Payment.objects.update_or_create(external_id=ext_id, defaults=defaults)
					pay_created += 1 if was_created else 0
					pay_updated += 0 if was_created else 1

		# CRM cégek (ügyfél/beszállító)
		if {'customers', 'suppliers'} & set(selected_entities):
			for cid in company_ids:
				customers = client.list_customers(company_id=cid)
				for cust in customers:
					name = cust.get('name') or cust.get('companyName') or ''
					if not name:
						continue
					raw_tax = cust.get('full_tax_number') or cust.get('fullTaxNumber') or cust.get('tax_number') or cust.get('taxNumber') or cust.get('taxnumber') or cust.get('taxNum') or ''
					tax = raw_tax or ''
					eu_tax = cust.get('eu_tax_number') or cust.get('euTaxNumber') or cust.get('euTaxnumber') or ''
					is_customer = True
					is_supplier = bool(cust.get('is_supplier') or cust.get('supplier'))
					qs = CrmCompany.objects.all()
					if tax:
						qs = qs.filter(models.Q(tax_number__iexact=tax) | models.Q(eu_tax_number__iexact=eu_tax) | models.Q(name__iexact=name))
					else:
						qs = qs.filter(name__iexact=name)
					obj = qs.first()
					defaults = {
						'name': name,
						'short_name': cust.get('short_name') or cust.get('shortName') or '',
						'tax_number': tax or None,
						'full_tax_number': raw_tax or cust.get('full_tax_number') or cust.get('fullTaxNumber') or '',
						'eu_tax_number': eu_tax or None,
						'vat_code': cust.get('vat_code') or cust.get('vatCode') or '',
						'county_code': cust.get('county_code') or cust.get('countyCode') or '',
						'vat_group_id': cust.get('vat_group_id') or cust.get('vatGroupId') or '',
						'vat_group_member_tax_number': cust.get('vat_group_member_tax_number') or cust.get('vatGroupMemberTaxNumber') or '',
						'country': cust.get('country') or 'Magyarország',
						'postal_code': cust.get('postal_code') or cust.get('postalCode') or '',
						'city': cust.get('city') or cust.get('settlement') or '',
						'street_name': cust.get('street_name') or cust.get('streetName') or cust.get('street') or '',
						'street_type': cust.get('street_type') or cust.get('public_place_category') or cust.get('publicPlaceCategory') or cust.get('streetType') or 'utca',
						'house_number': cust.get('house_number') or cust.get('houseNumber') or cust.get('street_number') or cust.get('streetNumber') or '',
						'public_place_category': cust.get('public_place_category') or cust.get('publicPlaceCategory') or cust.get('street_type') or '',
						'street_number': cust.get('street_number') or cust.get('streetNumber') or cust.get('house_number') or cust.get('houseNumber') or '',
						'building': cust.get('building') or '',
						'staircase': cust.get('staircase') or '',
						'floor': cust.get('floor') or '',
						'door': cust.get('door') or cust.get('door_number') or cust.get('doorNumber') or '',
						'address': cust.get('address') or cust.get('full_address') or cust.get('fullAddress') or _compose_address(cust),
						'email': cust.get('email') or '',
						'phone': cust.get('phone') or cust.get('mobile') or cust.get('tel') or '',
						'is_customer': is_customer,
						'is_supplier': is_supplier,
						'is_active': cust.get('is_active') if cust.get('is_active') is not None else True,
					}
					if obj:
						for k, v in defaults.items():
							setattr(obj, k, v)
						obj.save()
						crm_updated += 1
					else:
						CrmCompany.objects.create(**defaults)
						crm_created += 1

		# Kapcsolattartók kétirányú szinkronnal (Invoice ↔ ERP)
		if 'contacts' in selected_entities:
			rev_company_map = {v.id: k for k, v in mapping_lookup.items() if v}
			remote_contact_meta = {}
			for cid in company_ids:
				contacts = client.list_contacts(company_id=cid)
				for c in contacts:
					if not isinstance(c, dict):
						continue
					name = c.get('name') or c.get('full_name') or ''
					if not name:
						continue
					email = (c.get('email') or '').strip()
					phone = c.get('phone') or ''
					ext_id = str(c.get('id') or c.get('externalId') or '')
					remote_updated_at = _parse_dt(c.get('updated_at') or c.get('updatedAt'))
					if ext_id:
						inv_contact_ids.add(ext_id)
						if remote_updated_at:
							remote_contact_meta[ext_id] = remote_updated_at

					company_field = c.get('company') or c.get('customer') or {}
					company_ext_id = None
					if isinstance(company_field, str):
						company_ext_id = company_field
						company_field = {}
					company_name = c.get('company_name') or c.get('customer_name') or company_field.get('name') or ''
					company_tax = company_field.get('taxNumber') or company_field.get('tax_number') or c.get('company_tax_number') or ''
					company_ext_id = company_ext_id or company_field.get('id') or c.get('company_id') or c.get('companyId') or c.get('customer_id') or c.get('customerId') or cid

					company = None
					if company_tax:
						company = CrmCompany.objects.filter(models.Q(tax_number__iexact=company_tax) | models.Q(eu_tax_number__iexact=company_tax)).first()
					if not company and company_name:
						company = CrmCompany.objects.filter(name__iexact=company_name).first()
					if not company and company_ext_id:
						company = mapping_lookup.get(str(company_ext_id))
					if not company:
						company = mapping_lookup.get(str(cid))

					obj = None
					if ext_id:
						obj = CrmContact.objects.filter(external_id=ext_id).first()
					if not obj and email:
						obj = CrmContact.objects.filter(email__iexact=email, company=company).first()
					if not obj and company and name:
						obj = CrmContact.objects.filter(name__iexact=name, company=company).first()

					defaults = {
						'name': name,
						'email': email or None,
						'phone': phone or None,
						'company': company,
						'external_id': ext_id,
					}
					if obj:
						# Domináns ERP stratégia esetén ne írjuk felül helyi módosításokat, csak external_id-t töltsük, ha kell.
						if strategy.get('type') == 'dominant' and strategy.get('dominant_system') == 'erp':
							if ext_id and not obj.external_id:
								obj.external_id = ext_id
								obj.save(update_fields=['external_id'])
							continue

						# "newer" stratégia: csak akkor írjuk felül, ha a távoli frissítés újabb
						if strategy.get('type') == 'newer' and remote_updated_at and obj.updated_at:
							if remote_updated_at <= obj.updated_at:
								if ext_id and not obj.external_id:
									obj.external_id = ext_id
									obj.save(update_fields=['external_id'])
								continue

						for k, v in defaults.items():
							setattr(obj, k, v)
						obj.save()
						contact_updated += 1
					else:
						CrmContact.objects.create(**defaults)
						contact_created += 1

			# ERP → Invoice upsert + törlés
			mapped_company_ids = [c.id for c in mapping_lookup.values() if c]
			company_mapping_configured = bool(company_mappings)
			# Ha nincs mapping megadva, akkor minden ERP kontakt megy az alapértelmezett company_id-ra.
			# Ha van mapping, de egyiket sem találtuk meg (hibás ID), inkább ne szinkronizáljunk/ töröljünk semmit.
			if mapped_company_ids:
				erp_contacts = CrmContact.objects.filter(company_id__in=mapped_company_ids)
			elif company_mapping_configured:
				erp_contacts = CrmContact.objects.none()
			else:
				erp_contacts = CrmContact.objects.all()
			for obj in erp_contacts:
				inv_company_id = rev_company_map.get(obj.company_id) or client.company_id or None
				payload = {
					'name': obj.name,
					'email': obj.email or '',
					'phone': obj.phone or '',
					'company_id': inv_company_id,
				}
				# "newer" stratégia: ha a távoli kontakt frissebb, ne írjuk felül az Invoice-ban
				if strategy.get('type') == 'newer' and obj.external_id:
					remote_ts = remote_contact_meta.get(str(obj.external_id))
					if remote_ts and remote_ts > obj.updated_at:
						continue
				try:
					res = client.upsert_contact(payload, contact_id=obj.external_id or None)
					next_id = str(res.get('id') or res.get('externalId') or obj.external_id or '')
					if next_id and next_id != (obj.external_id or ''):
						obj.external_id = next_id
						obj.save(update_fields=['external_id'])
					if obj.external_id:
						erp_contact_ext_ids.add(obj.external_id)
				except requests.HTTPError as e:
					if e.response is not None and e.response.status_code == 404 and obj.external_id:
						# Re-create if remote missing
						try:
							res = client.upsert_contact(payload, contact_id=None)
							next_id = str(res.get('id') or res.get('externalId') or '')
							if next_id:
								obj.external_id = next_id
								obj.save(update_fields=['external_id'])
							erp_contact_ext_ids.add(obj.external_id)
						except Exception:
							pass
					continue
				except Exception:
					continue

			# Törlések szinkronizálása mindkét irányba
			delete_qs = CrmContact.objects.filter(external_id__isnull=False).exclude(external_id__exact='')
			if mapped_company_ids:
				delete_qs = delete_qs.filter(company_id__in=mapped_company_ids)
			elif company_mapping_configured:
				delete_qs = delete_qs.none()
			for obj in delete_qs:
				if obj.external_id not in inv_contact_ids:
					obj.delete()

			if erp_contact_ext_ids:
				for inv_id in inv_contact_ids:
					if inv_id and inv_id not in erp_contact_ext_ids:
						try:
							client.delete_contact(inv_id)
						except Exception:
							pass

	return {
		'invoices': {'created': created, 'updated': updated},
		'payments': {'created': pay_created, 'updated': pay_updated},
		'crm_companies': {'created': crm_created, 'updated': crm_updated},
		'contacts': {'created': contact_created, 'updated': contact_updated},
		'settings': {
			'entities': selected_entities,
			'strategy': strategy,
			'company_mappings': company_mappings,
		}
	}


class SyncPixinvoiceView(views.APIView):
	permission_classes = [AllowAny]

	def post(self, request):
		return Response({'error': 'PixInvoice is the single source now. Legacy sync disabled.'}, status=status.HTTP_410_GONE)


class PixinvoiceCompaniesImportView(views.APIView):
	permission_classes = [AllowAny]

	def get(self, request):
		return Response({'error': 'PixInvoice is the single source now. Legacy import disabled.'}, status=status.HTTP_410_GONE)

	def post(self, request):
		return Response({'error': 'PixInvoice is the single source now. Legacy import disabled.'}, status=status.HTTP_410_GONE)


class PixinvoiceWebhookView(views.APIView):
	permission_classes = [AllowAny]

	def post(self, request):
		return Response({'error': 'PixInvoice is the single source now. Legacy webhook sync disabled.'}, status=status.HTTP_410_GONE)


class PixinvoiceLookupTaxpayerView(views.APIView):
	permission_classes = [AllowAny]

	def post(self, request):
		tax_number = (request.data.get('tax_number') or '').strip()
		if not tax_number:
			return Response({'error': 'tax_number kötelező'}, status=status.HTTP_400_BAD_REQUEST)
		try:
			client = PixinvoiceClient()
		except ValueError as e:
			return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
		try:
			data = client.lookup_taxpayer(tax_number)
			return Response({'success': True, 'data': data})
		except requests.exceptions.RequestException as e:
			host = getattr(client, 'base', None)
			payload = {'success': False, 'error': str(e)}
			if host:
				payload['host'] = host
			return Response(payload, status=status.HTTP_502_BAD_GATEWAY)


# Cash Register ViewSets

class CashTransactionReasonViewSet(viewsets.ModelViewSet):
	"""Kassza művelet okok kezelése"""
	queryset = CashTransactionReason.objects.all()
	serializer_class = CashTransactionReasonSerializer
	permission_classes = [AllowAny]
	filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
	filterset_fields = ['is_active', 'is_deposit', 'is_withdrawal']
	search_fields = ['name']
	ordering_fields = ['order', 'name']
	ordering = ['order', 'name']


class CashRegisterViewSet(viewsets.ModelViewSet):
	"""Kasszák kezelése"""
	queryset = CashRegister.objects.all()
	serializer_class = CashRegisterSerializer
	permission_classes = [AllowAny]
	filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
	filterset_fields = ['is_active', 'currency', 'is_pos_default']
	search_fields = ['name', 'location']
	ordering_fields = ['name', 'created_at']
	ordering = ['name']

	@action(detail=True, methods=['post'])
	def set_pos_default(self, request, pk=None):
		"""Set selected cash register as POS default (single selection)."""
		cash_register = self.get_object()
		CashRegister.objects.exclude(id=cash_register.id).update(is_pos_default=False)
		cash_register.is_pos_default = True
		cash_register.save(update_fields=['is_pos_default'])
		return Response({'status': 'ok', 'cash_register_id': cash_register.id})

	@action(detail=True, methods=['get'])
	def balance(self, request, pk=None):
		"""Kassza egyenleg lekérdezése"""
		cash_register = self.get_object()
		return Response({
			'cash_register_id': cash_register.id,
			'name': cash_register.name,
			'current_balance': cash_register.current_balance,
			'currency': cash_register.currency.code if cash_register.currency else None
		})


class CashRegisterEmployeeViewSet(viewsets.ModelViewSet):
	"""Kassza-alkalmazott kapcsolatok kezelése"""
	queryset = CashRegisterEmployee.objects.all()
	serializer_class = CashRegisterEmployeeSerializer
	permission_classes = [AllowAny]
	filter_backends = [DjangoFilterBackend]
	filterset_fields = ['cash_register', 'employee', 'can_deposit', 'can_withdraw', 'can_view']


class CashRegisterTransactionViewSet(viewsets.ModelViewSet):
	"""Kassza tranzakciók kezelése"""
	queryset = CashRegisterTransaction.objects.select_related(
		'cash_register', 'employee', 'reason', 'target_cash_register'
	).all()
	serializer_class = CashRegisterTransactionSerializer
	permission_classes = [AllowAny]
	filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
	filterset_fields = ['cash_register', 'employee', 'reason']
	search_fields = ['note', 'employee__username', 'employee__first_name', 'employee__last_name']
	ordering_fields = ['timestamp', 'amount']
	ordering = ['-timestamp']

	def get_queryset(self):
		"""Szűrés dátum szerint és egyéb paraméterek alapján"""
		queryset = super().get_queryset()
		
		# Dátum szűrés
		start_date = self.request.query_params.get('start_date')
		end_date = self.request.query_params.get('end_date')
		
		if start_date:
			queryset = queryset.filter(timestamp__gte=start_date)
		if end_date:
			queryset = queryset.filter(timestamp__lte=end_date)
		
		return queryset

	@action(detail=False, methods=['post'])
	def deposit(self, request):
		"""Betét művelet"""
		cash_register_id = request.data.get('cash_register')
		amount = request.data.get('amount')
		reason_id = request.data.get('reason')
		note = request.data.get('note', '')
		
		if not cash_register_id or not amount:
			return Response(
				{'error': 'cash_register és amount kötelező'},
				status=status.HTTP_400_BAD_REQUEST
			)
		
		try:
			amount = float(amount)
			if amount <= 0:
				return Response(
					{'error': 'Az összeg pozitív szám kell legyen'},
					status=status.HTTP_400_BAD_REQUEST
				)
		except ValueError:
			return Response(
				{'error': 'Érvénytelen összeg'},
				status=status.HTTP_400_BAD_REQUEST
			)
		
		data = {
			'cash_register': cash_register_id,
			'amount': amount,
			'reason': reason_id,
			'note': note
		}
		
		serializer = self.get_serializer(data=data)
		serializer.is_valid(raise_exception=True)
		self.perform_create(serializer)
		
		return Response(serializer.data, status=status.HTTP_201_CREATED)

	@action(detail=False, methods=['post'])
	def withdraw(self, request):
		"""Kivét művelet"""
		cash_register_id = request.data.get('cash_register')
		amount = request.data.get('amount')
		reason_id = request.data.get('reason')
		note = request.data.get('note', '')
		
		if not cash_register_id or not amount:
			return Response(
				{'error': 'cash_register és amount kötelező'},
				status=status.HTTP_400_BAD_REQUEST
			)
		
		try:
			amount = float(amount)
			if amount <= 0:
				return Response(
					{'error': 'Az összeg pozitív szám kell legyen'},
					status=status.HTTP_400_BAD_REQUEST
				)
		except ValueError:
			return Response(
				{'error': 'Érvénytelen összeg'},
				status=status.HTTP_400_BAD_REQUEST
			)
		
		data = {
			'cash_register': cash_register_id,
			'amount': -abs(amount),  # Negatív összeg kivétnél
			'reason': reason_id,
			'note': note
		}
		
		serializer = self.get_serializer(data=data)
		serializer.is_valid(raise_exception=True)
		self.perform_create(serializer)
		
		return Response(serializer.data, status=status.HTTP_201_CREATED)

	@action(detail=False, methods=['post'])
	def transfer(self, request):
		"""Kassza mozgatás (egyik kasszából a másikba)"""
		source_id = request.data.get('source_cash_register')
		target_id = request.data.get('target_cash_register')
		amount = request.data.get('amount')
		reason_id = request.data.get('reason')
		note = request.data.get('note', '')
		
		if not source_id or not target_id or not amount:
			return Response(
				{'error': 'source_cash_register, target_cash_register és amount kötelező'},
				status=status.HTTP_400_BAD_REQUEST
			)
		
		if source_id == target_id:
			return Response(
				{'error': 'A forrás és cél kassza nem lehet azonos'},
				status=status.HTTP_400_BAD_REQUEST
			)
		
		try:
			amount = float(amount)
			if amount <= 0:
				return Response(
					{'error': 'Az összeg pozitív szám kell legyen'},
					status=status.HTTP_400_BAD_REQUEST
				)
		except ValueError:
			return Response(
				{'error': 'Érvénytelen összeg'},
				status=status.HTTP_400_BAD_REQUEST
			)
		
		data = {
			'cash_register': source_id,
			'amount': -abs(amount),  # Negatív a forrás kasszánál
			'reason': reason_id,
			'note': note,
			'target_cash_register': target_id
		}
		
		serializer = self.get_serializer(data=data)
		serializer.is_valid(raise_exception=True)
		self.perform_create(serializer)
		
		return Response(serializer.data, status=status.HTTP_201_CREATED)

