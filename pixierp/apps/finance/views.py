from rest_framework import generics, status, views
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from decouple import config as dconfig
import os
import requests
from django.db import transaction
from django.db import models
from apps.finance.models import Invoice, InvoiceItem, Payment
from apps.crm.models import Company
from apps.core.models import Currency
from apps.core.models import PixinvoiceConfig


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

	def list_invoices(self):
		url = f"{self.base}/invoices"
		params = {'company_id': self.company_id} if self.company_id else None
		r = requests.get(url, headers=self.headers, params=params, timeout=20)
		r.raise_for_status()
		return r.json() or []

	def list_payments(self):
		url = f"{self.base}/payments"
		params = {'company_id': self.company_id} if self.company_id else None
		r = requests.get(url, headers=self.headers, params=params, timeout=20)
		r.raise_for_status()
		return r.json() or []

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


class SyncPixinvoiceView(views.APIView):
	permission_classes = [AllowAny]

	def post(self, request):
		"""Egyszerű szinkron: számlák és kifizetések lekérése és mentése.
		Idempotens: external_id alapján upsert.
		"""
		try:
			client = PixinvoiceClient()
		except ValueError as e:
			return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

		created, updated = 0, 0
		pay_created, pay_updated = 0, 0

		with transaction.atomic():
			try:
				invs = client.list_invoices()
			except requests.exceptions.RequestException as e:
				return Response({'error': 'Invoice fetch failed', 'details': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

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
					'gross_total': inv.get('grossTotal') or 0,
					'status': inv.get('status') or 'issued',
				}
				obj, was_created = Invoice.objects.update_or_create(external_id=ext_id, defaults=defaults)
				created += 1 if was_created else 0
				updated += 0 if was_created else 1

				# Currency mapping (best effort)
				cur_code = (inv.get('currency') or 'HUF').upper()
				try:
					cur_obj = Currency.objects.get(code=cur_code)
				except Currency.DoesNotExist:
					cur_obj = None
				if obj.currency_id != (cur_obj.id if cur_obj else None):
					obj.currency = cur_obj
					obj.save(update_fields=['currency'])

				# Partner mapping (best effort by tax number/name)
				partner_tax = (inv.get('partner') or {}).get('taxNumber')
				partner_name = (inv.get('partner') or {}).get('name')
				partner = None
				if partner_tax:
					partner = Company.objects.filter(models.Q(tax_number__icontains=partner_tax) | models.Q(eu_tax_number__icontains=partner_tax)).first()
				if not partner and partner_name:
					partner = Company.objects.filter(name__iexact=partner_name).first()
				if obj.partner_id != (partner.id if partner else None):
					obj.partner = partner
					obj.save(update_fields=['partner'])

				# Items (optional basic sync)
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

			# Payments
			try:
				pays = client.list_payments()
			except requests.exceptions.RequestException as e:
				return Response({'error': 'Payment fetch failed', 'details': str(e)}, status=status.HTTP_502_BAD_GATEWAY)

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
				cur_code = (p.get('currency') or 'HUF').upper()
				try:
					cur_obj = Currency.objects.get(code=cur_code)
				except Currency.DoesNotExist:
					cur_obj = None
				defaults['currency'] = cur_obj

				obj, was_created = Payment.objects.update_or_create(external_id=ext_id, defaults=defaults)
				pay_created += 1 if was_created else 0
				pay_updated += 0 if was_created else 1

		return Response({
			'invoices': {'created': created, 'updated': updated},
			'payments': {'created': pay_created, 'updated': pay_updated},
		})


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
