from rest_framework import viewsets, status
from django.db import models
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from .models import (
    Customer, Product, QuoteRequest, Quote, QuoteItem, QuoteRequestItem,
    Order, OrderItem, Lead, Opportunity, Forecast
)
from .serializers import (
    CustomerSerializer, ProductSerializer, QuoteRequestSerializer, QuoteRequestItemSerializer,
    QuoteSerializer, QuoteItemSerializer, OrderSerializer, OrderItemSerializer,
    LeadSerializer, OpportunitySerializer, ForecastSerializer
)
from apps.manufacturing.models import ManufacturingProduct, Project
from apps.manufacturing.serializers import ManufacturingProductSerializer
from apps.core.models import Currency
from apps.crm.models import Company as CrmCompany, Contact
from .models import Service, QuoteLog, QuoteRequestItemAttachment, SearchStat, QuoteRequestAttachment, QuoteRequestEmailLog, QuoteRequestInvitation
from .serializers import ServiceSerializer, QuoteLogSerializer, QuoteRequestItemAttachmentSerializer, QuoteRequestAttachmentSerializer, QuoteRequestInvitationSerializer
from apps.core.models import EmailServerConfig, EmailTemplate, SignatureTemplate, Currency
import smtplib, ssl, imaplib, email
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import secrets
from decimal import Decimal, InvalidOperation
from django.contrib.auth import get_user_model
from django.db import transaction


def _bump_search_stat(item_type: str, ref_id: int):
    try:
        stat, _ = SearchStat.objects.get_or_create(item_type=item_type, ref_id=int(ref_id))
        stat.count = (stat.count or 0) + 1
        stat.save(update_fields=["count", "last_hit"])
    except Exception:
        # don't block main flow on stats errors
        pass

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [AllowAny]

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]

class ManufacturingProductViewSet(viewsets.ModelViewSet):
    queryset = ManufacturingProduct.objects.all()
    serializer_class = ManufacturingProductSerializer
    permission_classes = [AllowAny]

class QuoteRequestViewSet(viewsets.ModelViewSet):
    queryset = QuoteRequest.objects.all()
    serializer_class = QuoteRequestSerializer
    permission_classes = [AllowAny]

    def perform_create(self, serializer):
        # Új ajánlat száma: yyyymmdd + növekvő sorszám
        today_str = timezone.now().strftime('%Y%m%d')
        daily_count = QuoteRequest.objects.filter(issue_date=timezone.now().date()).count() + 1
        number = f"{today_str}{daily_count:03d}"

        # Kapcsolódó CRM cég és kapcsolattartók
        company_id = self.request.data.get('company_id')
        contact_ids = self.request.data.get('contact_ids') or []
        instance = serializer.save(
            created_by=self.request.user,
            number=number,
            request_number=number,
            requested_by=self.request.user
        )
        # Set currency if provided
        currency_code = self.request.data.get('currency_code') or self.request.data.get('currency')
        if currency_code:
            try:
                instance.currency = Currency.objects.get(code=str(currency_code).upper())
            except Exception:
                pass
        if company_id:
            try:
                instance.company = CrmCompany.objects.get(id=company_id)
            except CrmCompany.DoesNotExist:
                pass
        if contact_ids:
            try:
                instance.contacts.set(Contact.objects.filter(id__in=contact_ids))
            except Exception:
                pass
        instance.save()
        QuoteLog.objects.create(quote=instance, user=self.request.user, action='Árajánlat létrehozva')
        # ensure public token exists
        if not instance.public_token:
            instance.public_token = secrets.token_hex(20)
            instance.save(update_fields=['public_token'])

    @action(detail=False, methods=['get'])
    def next_number(self, request):
        """Előnézeti ajánlatszám a megadott dátumhoz (YYYY-MM-DD), alapértelmezés ma."""
        date_str = request.query_params.get('date') or request.query_params.get('issue_date')
        try:
            if date_str:
                dt = timezone.datetime.strptime(date_str, '%Y-%m-%d').date()
            else:
                dt = timezone.now().date()
        except Exception:
            dt = timezone.now().date()
        today_str = dt.strftime('%Y%m%d')
        daily_count = QuoteRequest.objects.filter(issue_date=dt).count() + 1
        number = f"{today_str}{daily_count:03d}"
        return Response({
            'date': dt.isoformat(),
            'count': daily_count,
            'number': number,
        })

    @action(detail=True, methods=['get'])
    def attachments(self, request, pk=None):
        qr = self.get_object()
        serializer = QuoteRequestAttachmentSerializer(qr.attachments.all(), many=True, context={'request': request})
        return Response(serializer.data)

    @attachments.mapping.post
    def upload_attachment(self, request, pk=None):
        qr = self.get_object()
        file_obj = request.FILES.get('file')
        remark = request.data.get('remark', '')
        if not file_obj:
            return Response({'error': 'file kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = QuoteRequestAttachment.objects.create(
            quote_request=qr,
            file=file_obj,
            remark=remark,
            uploaded_by=request.user if request.user and request.user.is_authenticated else None
        )
        return Response(QuoteRequestAttachmentSerializer(att, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def update_attachment_remark(self, request, pk=None):
        qr = self.get_object()
        att_id = request.data.get('attachment_id')
        remark = request.data.get('remark', '')
        if not att_id:
            return Response({'error': 'attachment_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = get_object_or_404(QuoteRequestAttachment, id=att_id, quote_request=qr)
        att.remark = remark
        att.save(update_fields=['remark'])
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def delete_attachment(self, request, pk=None):
        qr = self.get_object()
        att_id = request.data.get('attachment_id')
        if not att_id:
            return Response({'error': 'attachment_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = get_object_or_404(QuoteRequestAttachment, id=att_id, quote_request=qr)
        att.delete()
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def set_project(self, request, pk=None):
        qr = self.get_object()
        project_id = request.data.get('project_id')
        if not project_id:
            return Response({'error': 'project_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        project = get_object_or_404(Project, id=project_id)
        qr.project = project
        qr.save()
        QuoteLog.objects.create(quote=qr, user=request.user, action=f'Projekt beállítva: {project.name}')
        return Response(self.get_serializer(qr).data)

    @action(detail=True, methods=['post'])
    def add_product_item(self, request, pk=None):
        qr = self.get_object()
        product_id = request.data.get('product_id')
        quantity = request.data.get('quantity', 1)
        description = request.data.get('description', '')
        net_unit_price_raw = request.data.get('net_unit_price')
        unit = request.data.get('unit') or 'db'
        vat_rate = request.data.get('vat_rate') or 27
        discount_percent = request.data.get('discount_percent') or 0
        discount_amount = request.data.get('discount_amount') or 0
        if not product_id:
            return Response({'error': 'product_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        product = get_object_or_404(Product, id=product_id)
        if net_unit_price_raw in (None, "", "0"):
            net_unit_price_raw = product.base_price or 0
        try:
            net_unit_price = Decimal(str(net_unit_price_raw))
        except Exception:
            net_unit_price = Decimal("0")
        try:
            quantity_val = Decimal(str(quantity))
        except Exception:
            quantity_val = Decimal("1")
        item = QuoteRequestItem.objects.create(
            quote_request=qr,
            item_type='product',
            product=product,
            quantity=quantity_val,
            unit=unit,
            net_unit_price=net_unit_price,
            vat_rate=vat_rate,
            discount_percent=discount_percent,
            discount_amount=discount_amount,
            description=description
        )
        _bump_search_stat('product', product.id)
        QuoteLog.objects.create(quote=qr, user=request.user, action=f'Termék hozzáadva: {product.name}')
        return Response(QuoteRequestItemSerializer(item, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def add_manufacturing_item(self, request, pk=None):
        qr = self.get_object()
        mp_id = request.data.get('manufacturing_product_id')
        quantity = request.data.get('quantity', 1)
        description = request.data.get('description', '')
        net_unit_price_raw = request.data.get('net_unit_price')
        unit = request.data.get('unit') or 'db'
        vat_rate = request.data.get('vat_rate') or 27
        discount_percent = request.data.get('discount_percent') or 0
        discount_amount = request.data.get('discount_amount') or 0
        if not mp_id:
            return Response({'error': 'manufacturing_product_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        mp = get_object_or_404(ManufacturingProduct, id=mp_id)
        # Normalize numeric fields
        try:
            from decimal import Decimal
            net_unit_price = Decimal(str(net_unit_price_raw if net_unit_price_raw not in (None, "", "0") else 0))
        except Exception:
            from decimal import Decimal as _D
            net_unit_price = _D("0")
        try:
            from decimal import Decimal as _D
            quantity_val = _D(str(quantity))
        except Exception:
            from decimal import Decimal as _D
            quantity_val = _D("1")
        item = QuoteRequestItem.objects.create(
            quote_request=qr,
            item_type='manufacturing',
            manufacturing_product=mp,
            quantity=quantity_val,
            unit=unit,
            net_unit_price=net_unit_price,
            vat_rate=vat_rate,
            discount_percent=discount_percent,
            discount_amount=discount_amount,
            description=description
        )
        _bump_search_stat('manufacturing', mp.id)
        try:
            QuoteLog.objects.create(quote=qr, user=request.user if request.user.is_authenticated else None, action=f'Egyedi gyártás hozzáadva: {mp.name}')
        except Exception:
            pass
        return Response(QuoteRequestItemSerializer(item, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def create_manufacturing_item(self, request, pk=None):
        """Új gyártási tétel létrehozása és hozzárendelése az ajánlatkéréshez"""
        qr = self.get_object()

        name = request.data.get('name')
        quantity = request.data.get('quantity')
        deadline = request.data.get('deadline')  # YYYY-MM-DD

        if not name or quantity is None or not deadline:
            return Response({'error': 'name, quantity, deadline kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        # Opcionális mezők
        description = request.data.get('description', '')
        internal_description = request.data.get('internal_description', '')
        quantity_unit = request.data.get('quantity_unit', 'db')
        product_class_id = request.data.get('product_class_id')
        project_id = request.data.get('project_id')
        contact_id = request.data.get('contact_id')
        net_unit_price = request.data.get('net_unit_price', 0)
        currency_id = request.data.get('currency_id')

        mp_kwargs = {
            'name': name,
            'description': description,
            'internal_description': internal_description,
            'quantity': quantity,
            'quantity_unit': quantity_unit,
            'deadline': deadline,
            'net_unit_price': net_unit_price,
        }

        if product_class_id:
            try:
                mp_kwargs['product_class_id'] = int(product_class_id)
            except ValueError:
                pass
        if project_id:
            try:
                mp_kwargs['project_id'] = int(project_id)
            except ValueError:
                pass
        if contact_id:
            try:
                mp_kwargs['contact_id'] = int(contact_id)
            except ValueError:
                pass
        if currency_id:
            try:
                # only set if exists
                Currency.objects.get(id=int(currency_id))
                mp_kwargs['currency_id'] = int(currency_id)
            except Exception:
                pass

        mp = ManufacturingProduct.objects.create(**mp_kwargs)

        item = QuoteRequestItem.objects.create(
            quote_request=qr,
            item_type='manufacturing',
            manufacturing_product=mp,
            quantity=quantity,
            unit=quantity_unit,
            net_unit_price=net_unit_price,
            description=description
        )
        QuoteLog.objects.create(quote=qr, user=request.user, action=f'Egyedi gyártás létrehozva és hozzáadva: {mp.name}')
        return Response(QuoteRequestItemSerializer(item, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def add_service_item(self, request, pk=None):
        qr = self.get_object()
        service_id = request.data.get('service_id')
        quantity = request.data.get('quantity', 1)
        description = request.data.get('description', '')
        net_unit_price_raw = request.data.get('net_unit_price')
        unit = request.data.get('unit') or 'óra'
        vat_rate = request.data.get('vat_rate') or 27
        discount_percent = request.data.get('discount_percent') or 0
        discount_amount = request.data.get('discount_amount') or 0
        if not service_id:
            return Response({'error': 'service_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        service = get_object_or_404(Service, id=service_id)
        if net_unit_price_raw in (None, "", "0"):
            net_unit_price_raw = service.base_price or 0
        try:
            net_unit_price = Decimal(str(net_unit_price_raw))
        except Exception:
            net_unit_price = Decimal("0")
        try:
            quantity_val = Decimal(str(quantity))
        except Exception:
            quantity_val = Decimal("1")
        item = QuoteRequestItem.objects.create(
            quote_request=qr,
            item_type='service',
            service=service,
            quantity=quantity_val,
            unit=unit,
            net_unit_price=net_unit_price,
            vat_rate=vat_rate,
            discount_percent=discount_percent,
            discount_amount=discount_amount,
            description=description
        )
        _bump_search_stat('service', service.id)
        QuoteLog.objects.create(quote=qr, user=request.user, action=f'Szolgáltatás hozzáadva: {service.name}')
        return Response(QuoteRequestItemSerializer(item, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def delete_item(self, request, pk=None):
        qr = self.get_object()
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'error': 'item_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            item = qr.items.get(id=item_id)
        except QuoteRequestItem.DoesNotExist:
            return Response({'error': 'Tétel nem található'}, status=status.HTTP_404_NOT_FOUND)
        ref_name = item.product.name if item.product else (item.manufacturing_product.name if item.manufacturing_product else (item.service.name if item.service else 'Tétel'))
        item.delete()
        try:
            QuoteLog.objects.create(quote=qr, user=request.user, action=f'Tétel törölve: {ref_name}')
        except Exception:
            pass
        return Response({'status': 'ok'})

    @action(detail=True, methods=['get'])
    def logs(self, request, pk=None):
        qr = self.get_object()
        serializer = QuoteLogSerializer(qr.logs.order_by('-created_at'), many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def send_email(self, request, pk=None):
        qr = self.get_object()
        to = request.data.get('to')
        cc = request.data.get('cc', '')
        template_key = request.data.get('template_key', 'rfq_send')
        signature_key = request.data.get('signature_key')
        extra_context = request.data.get('context', {}) or {}
        override_subject = request.data.get('subject')
        override_body = request.data.get('body')
        if not to:
            return Response({'error': 'to szükséges'}, status=status.HTTP_400_BAD_REQUEST)

        # Fetch config and templates
        cfg = EmailServerConfig.objects.filter(is_active=True).first()
        if not cfg:
            return Response({'error': 'Nincs aktív email szerver beállítva'}, status=400)
        tpl = EmailTemplate.objects.filter(key=template_key).first()
        if not tpl:
            return Response({'error': 'Hiányzó email sablon'}, status=400)
        sig = SignatureTemplate.objects.filter(key=signature_key).first() if signature_key else None

        # Ensure there is a public token for link rendering
        if not qr.public_token:
            qr.public_token = secrets.token_urlsafe(24)
            qr.save(update_fields=['public_token'])
        # Render simple templates using format
        public_url = request.build_absolute_uri(f"/api/v1/sales/quote-requests/public/{qr.public_token}/order/")
        ctx = {
            'rfq_number': qr.number or qr.request_number,
            'rfq_title': qr.title,
            'company_name': qr.company.name if qr.company else '',
            'public_order_url': public_url,
            **extra_context,
        }
        subject = override_subject if override_subject is not None else (tpl.subject_template or '').format(**ctx)
        if override_body is not None:
            body = override_body
            body_core = override_body
        else:
            body_core = (tpl.body_template or '').format(**ctx)
            if tpl.is_html:
                body = f"{body_core}{sig.body_html if sig else ''}"
            else:
                body = f"{body_core}\n\n{sig.body_html if sig else ''}"

        # Build MIME message
        msg = MIMEMultipart('alternative') if tpl.is_html else email.message.EmailMessage()
        if isinstance(msg, MIMEMultipart):
            msg['Subject'] = subject
            msg['From'] = f"{cfg.from_name} <{cfg.from_email}>" if cfg.from_name else cfg.from_email
            msg['To'] = to
            if cc:
                msg['Cc'] = cc
            subtype = 'html' if tpl.is_html else 'plain'
            msg.attach(MIMEText(body, subtype, 'utf-8'))
            mime_bytes = msg.as_bytes()
        else:
            msg['Subject'] = subject
            msg['From'] = cfg.from_email
            msg['To'] = to
            if cc:
                msg['Cc'] = cc
            msg.set_content(body)
            mime_bytes = msg.as_bytes()

        recipients = [r.strip() for r in (to.split(',') if isinstance(to, str) else [to]) if r.strip()]
        if cc:
            recipients += [r.strip() for r in (cc.split(',') if isinstance(cc, str) else [cc]) if r.strip()]

        # Send via SMTP
        try:
            if cfg.smtp_use_ssl:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, context=context) as server:
                    if cfg.smtp_username:
                        server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.from_email, recipients, mime_bytes)
            else:
                with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port) as server:
                    server.ehlo()
                    if cfg.smtp_use_tls:
                        server.starttls()
                    if cfg.smtp_username:
                        server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.from_email, recipients, mime_bytes)
        except Exception as e:
            return Response({'error': f'SMTP hiba: {e}'}, status=500)

        # Append to IMAP Sent
        try:
            if cfg.imap_host and cfg.imap_username:
                with imaplib.IMAP4_SSL(cfg.imap_host, cfg.imap_port) as M:
                    M.login(cfg.imap_username, cfg.imap_password)
                    M.append(cfg.imap_sent_folder or 'Sent', '\\Seen', imaplib.Time2Internaldate(timezone.now().timestamp()), mime_bytes)
                    M.logout()
        except Exception:
            # Do not fail main flow if IMAP append fails
            pass

        QuoteRequestEmailLog.objects.create(
            quote_request=qr,
            to=to,
            cc=cc or '',
            subject=subject,
            body_preview=(body_core[:500] if body_core else ''),
            sent_by=request.user if request.user.is_authenticated else None,
        )
        QuoteLog.objects.create(quote=qr, user=request.user, action='Ajánlat kiküldve e-mailben')
        return Response({'status': 'sent'})

    @action(detail=True, methods=['post'])
    def render_email(self, request, pk=None):
        qr = self.get_object()
        template_key = request.data.get('template_key', 'rfq_send')
        signature_key = request.data.get('signature_key')
        extra_context = request.data.get('context', {}) or {}
        override_subject = request.data.get('subject')
        override_body = request.data.get('body')

        tpl = EmailTemplate.objects.filter(key=template_key).first()
        if not tpl:
            return Response({'error': 'Hiányzó email sablon'}, status=400)
        sig = SignatureTemplate.objects.filter(key=signature_key).first() if signature_key else None

        if not qr.public_token:
            qr.public_token = secrets.token_urlsafe(24)
            qr.save(update_fields=['public_token'])
        public_url = request.build_absolute_uri(f"/api/v1/sales/quote-requests/public/{qr.public_token}/order/")
        ctx = {
            'rfq_number': qr.number or qr.request_number,
            'rfq_title': qr.title,
            'company_name': qr.company.name if qr.company else (qr.customer.name if qr.customer else ''),
            'public_order_url': public_url,
            **extra_context,
        }
        subject = override_subject if override_subject is not None else (tpl.subject_template or '').format(**ctx)
        if override_body is not None:
            body = override_body
        else:
            body_core = (tpl.body_template or '').format(**ctx)
            body = f"{body_core}{sig.body_html if sig else ''}" if tpl.is_html else f"{body_core}\n\n{sig.body_html if sig else ''}"
        return Response({'subject': subject, 'body': body, 'is_html': tpl.is_html})

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        qr = self.get_object()
        new_status = request.data.get('status')
        valid = [c[0] for c in QuoteRequest.STATUS_CHOICES]
        if new_status not in valid:
            return Response({'error': 'Érvénytelen státusz'}, status=status.HTTP_400_BAD_REQUEST)
        old_status = qr.status
        if old_status == new_status:
            return Response({'status': qr.status})
        qr.status = new_status
        qr.save(update_fields=['status'])
        try:
            QuoteLog.objects.create(quote=qr, user=request.user, action=f'Státusz módosítva: {old_status} → {new_status}')
        except Exception:
            pass
        return Response({'status': qr.status})

    @action(detail=True, methods=['post'])
    def update_basic(self, request, pk=None):
        qr = self.get_object()
        data = request.data or {}
        # Simple field updates
        for fld in ['title', 'description', 'internal_description']:
            if fld in data:
                setattr(qr, fld, data.get(fld) or '')
        # Dates
        for date_fld in ['issue_date', 'deadline']:
            if data.get(date_fld):
                try:
                    setattr(qr, date_fld, timezone.datetime.strptime(data.get(date_fld), '%Y-%m-%d').date())
                except Exception:
                    pass
        # Foreign keys
        company_id = data.get('company_id') or data.get('company')
        if company_id:
            try:
                qr.company = CrmCompany.objects.get(id=company_id)
            except CrmCompany.DoesNotExist:
                pass
        project_id = data.get('project_id') or data.get('project')
        if project_id:
            try:
                from apps.manufacturing.models import Project
                qr.project = Project.objects.get(id=project_id)
            except Exception:
                pass
        # Currency by code or id
        curr_code = data.get('currency_code') or data.get('currencyCode')
        curr_id = data.get('currency')
        if curr_code:
            try:
                qr.currency = Currency.objects.get(code=str(curr_code).upper())
            except Currency.DoesNotExist:
                pass
        elif curr_id:
            try:
                qr.currency = Currency.objects.get(id=int(curr_id))
            except Exception:
                pass
        qr.save()
        # Many-to-many contacts
        contact_ids = data.get('contact_ids') or data.get('contacts') or []
        try:
            if isinstance(contact_ids, str):
                import json
                contact_ids = json.loads(contact_ids)
        except Exception:
            contact_ids = []
        if isinstance(contact_ids, list) and contact_ids:
            try:
                qr.contacts.set(Contact.objects.filter(id__in=contact_ids))
            except Exception:
                pass
        try:
            QuoteLog.objects.create(quote=qr, user=request.user, action='Árajánlat módosítva (alap adatok)')
        except Exception:
            pass
        return Response(QuoteRequestSerializer(qr, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def copy(self, request, pk=None):
        src = self.get_object()
        today = timezone.now().date()
        today_str = today.strftime('%Y%m%d')
        daily_count = QuoteRequest.objects.filter(issue_date=today).count() + 1
        new_number = f"{today_str}{daily_count:03d}"

        dst = QuoteRequest.objects.create(
            number=new_number,
            request_number=new_number,
            issue_date=today,
            created_by=request.user if request.user.is_authenticated else None,
            customer=src.customer,
            title=src.title,
            description=src.description,
            status='new',
            requested_by=request.user if request.user.is_authenticated else src.requested_by,
            deadline=src.deadline,
            project=src.project,
            currency=src.currency,
        )
        # copy crm company + contacts
        dst.company = src.company
        dst.save(update_fields=['company'])
        try:
            dst.contacts.set(src.contacts.all())
        except Exception:
            pass
        # ensure public token
        if not dst.public_token:
            dst.public_token = secrets.token_hex(20)
            dst.save(update_fields=['public_token'])
        # copy items
        for it in src.items.all():
            QuoteRequestItem.objects.create(
                quote_request=dst,
                item_type=it.item_type,
                product=it.product,
                manufacturing_product=it.manufacturing_product,
                service=it.service,
                quantity=it.quantity,
                unit=it.unit,
                net_unit_price=it.net_unit_price,
                vat_rate=it.vat_rate,
                discount_percent=it.discount_percent,
                discount_amount=it.discount_amount,
                description=it.description,
            )
        try:
            QuoteLog.objects.create(quote=dst, user=request.user if request.user.is_authenticated else None, action=f'Árajánlat másolva forrásból: {src.number or src.request_number}')
        except Exception:
            pass
        return Response({'id': dst.id, 'number': dst.number}, status=201)

    @action(detail=False, methods=['post'])
    def create_demand(self, request):
        """Create an empty demand (RFQ without items), optionally with company/contacts."""
        today = timezone.now().date()
        today_str = today.strftime('%Y%m%d')
        daily_count = QuoteRequest.objects.filter(issue_date=today).count() + 1
        number = f"{today_str}{daily_count:03d}"
        title = request.data.get('title') or f"Ajánlat {number}"
        description = request.data.get('description') or ''
        deadline = request.data.get('deadline')
        if deadline:
            try:
                deadline = timezone.datetime.strptime(deadline, '%Y-%m-%d').date()
            except Exception:
                deadline = today + timezone.timedelta(days=14)
        else:
            deadline = today + timezone.timedelta(days=14)
        curr_code = request.data.get('currency_code')
        currency = None
        if curr_code:
            try:
                currency = Currency.objects.get(code=str(curr_code).upper())
            except Exception:
                currency = None
        instance = QuoteRequest.objects.create(
            number=number,
            request_number=number,
            issue_date=today,
            created_by=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
            title=title,
            description=description,
            status='new',
            requested_by=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None,
            deadline=deadline,
            currency=currency,
        )
        # Optional CRM company + contacts
        company_id = request.data.get('company_id')
        contact_ids = request.data.get('contact_ids') or []
        if company_id:
            try:
                instance.company = CrmCompany.objects.get(id=company_id)
                instance.save(update_fields=['company'])
            except CrmCompany.DoesNotExist:
                pass
        if contact_ids:
            try:
                instance.contacts.set(Contact.objects.filter(id__in=contact_ids))
            except Exception:
                pass
        # ensure public token
        if not instance.public_token:
            instance.public_token = secrets.token_hex(20)
            instance.save(update_fields=['public_token'])
        try:
            QuoteLog.objects.create(quote=instance, user=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None, action='Ajánlat (üres árajánlat) létrehozva')
        except Exception:
            pass
        return Response(QuoteRequestSerializer(instance, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def open_demands(self, request):
        """List RFQs that are open demands: no items and status new/in_progress."""
        qs = QuoteRequest.objects.filter(is_deleted=False).annotate(item_count=models.Count('items')).filter(item_count=0, status__in=['new', 'in_progress']).order_by('-created_at')
        page = self.paginate_queryset(qs)
        serializer = QuoteRequestSerializer(page or qs, many=True, context={'request': request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def soft_delete(self, request, pk=None):
        qr = self.get_object()
        if qr.is_deleted:
            return Response({'status': 'already_deleted'})
        qr.is_deleted = True
        qr.save(update_fields=['is_deleted'])
        try:
            QuoteLog.objects.create(quote=qr, user=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None, action='Igény/Árajánlat megjelölve töröltként')
        except Exception:
            pass
        return Response({'status': 'deleted'})

    @action(detail=False, methods=['get'])
    def deleted(self, request):
        qs = QuoteRequest.objects.filter(is_deleted=True).order_by('-updated_at')
        page = self.paginate_queryset(qs)
        serializer = QuoteRequestSerializer(page or qs, many=True, context={'request': request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        qr = self.get_object()
        if not qr.is_deleted:
            return Response({'status': 'not_deleted'})
        qr.is_deleted = False
        qr.save(update_fields=['is_deleted'])
        try:
            QuoteLog.objects.create(quote=qr, user=request.user if getattr(request, 'user', None) and request.user.is_authenticated else None, action='Igény/Árajánlat visszaállítva')
        except Exception:
            pass
        return Response({'status': 'restored'})

    @action(detail=True, methods=['delete'])
    def purge(self, request, pk=None):
        qr = self.get_object()
        if not qr.is_deleted:
            return Response({'error': 'Csak törölt elemek törölhetők véglegesen'}, status=400)
        qr.delete()
        return Response({'status': 'purged'})

    @action(detail=True, methods=['post'])
    def take(self, request, pk=None):
        """Ide vele: current user is added as assignee."""
        qr = self.get_object()
        user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
        if not user:
            return Response({'error': 'Auth required'}, status=401)
        qr.assignees.add(user)
        try:
            QuoteLog.objects.create(quote=qr, user=user, action='Ide vele: felvette a feladatot')
        except Exception:
            pass
        return Response({'status': 'taken'})

    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        """Beszállok: add current user without removing others."""
        return self.take(request, pk)

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """Kiszállok: remove current user from assignees."""
        qr = self.get_object()
        user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
        if not user:
            return Response({'error': 'Auth required'}, status=401)
        qr.assignees.remove(user)
        try:
            QuoteLog.objects.create(quote=qr, user=user, action='Kiszállok: levette magáról')
        except Exception:
            pass
        return Response({'status': 'left'})

    @action(detail=True, methods=['post'])
    def takeover(self, request, pk=None):
        """Átveszem: clear all and assign current user only."""
        qr = self.get_object()
        user = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
        if not user:
            return Response({'error': 'Auth required'}, status=401)
        qr.assignees.clear()
        qr.assignees.add(user)
        qr.owner = user
        qr.save(update_fields=['owner'])
        try:
            QuoteLog.objects.create(quote=qr, user=user, action='Átveszem: kizárólagos felelős lett')
        except Exception:
            pass
        return Response({'status': 'taken_over'})

    @action(detail=False, methods=['get'])
    def users(self, request):
        """List active users for inviting."""
        User = get_user_model()
        qs = User.objects.filter(is_active=True).order_by('first_name', 'last_name', 'username')
        data = [{'id': u.id, 'name': (u.get_full_name() or u.username), 'email': getattr(u, 'email', '')} for u in qs]
        return Response(data)

    @action(detail=True, methods=['post'])
    def invite(self, request, pk=None):
        qr = self.get_object()
        invitee_id = request.data.get('user_id') or request.data.get('invitee_id')
        if not invitee_id:
            return Response({'error': 'user_id kötelező'}, status=400)
        User = get_user_model()
        try:
            invitee = User.objects.get(id=int(invitee_id))
        except (User.DoesNotExist, ValueError):
            return Response({'error': 'Felhasználó nem található'}, status=404)
        inv, created = QuoteRequestInvitation.objects.get_or_create(
            quote_request=qr, invitee=invitee, status='pending',
            defaults={'invited_by': request.user if request.user and request.user.is_authenticated else None}
        )
        # Send email if configured
        try:
            cfg = EmailServerConfig.objects.filter(is_active=True).first()
            tpl = EmailTemplate.objects.filter(key='rfq_invite').first()
            if cfg and invitee.email:
                subject = (tpl.subject if tpl and tpl.subject else f"Meghívás: {qr.number or qr.request_number}")
                body = (tpl.body if tpl and tpl.body else 'Meghívás érkezett az igényhez: {rfq_number} - {rfq_title}').format(
                    rfq_number=(qr.number or qr.request_number or ''), rfq_title=(qr.title or '')
                )
                cfg.send_email(to=[invitee.email], subject=subject, body=body, is_html=True, cc=[])
        except Exception:
            pass
        return Response(QuoteRequestInvitationSerializer(inv).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def invitations(self, request, pk=None):
        qr = self.get_object()
        invs = qr.invitations.all().order_by('-created_at')
        return Response(QuoteRequestInvitationSerializer(invs, many=True).data)

    @action(detail=False, methods=['get'])
    def my_invitations(self, request):
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Auth required'}, status=401)
        status_q = request.query_params.get('status') or 'pending'
        qs = QuoteRequestInvitation.objects.filter(invitee=request.user)
        if status_q:
            qs = qs.filter(status=status_q)
        return Response(QuoteRequestInvitationSerializer(qs.order_by('-created_at'), many=True).data)

    @action(detail=True, methods=['post'])
    def accept_invite(self, request, pk=None):
        qr = self.get_object()
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Auth required'}, status=401)
        inv = QuoteRequestInvitation.objects.filter(quote_request=qr, invitee=request.user, status='pending').first()
        if not inv:
            return Response({'error': 'Nincs függő meghívás'}, status=404)
        with transaction.atomic():
            inv.status = 'accepted'
            inv.responded_at = timezone.now()
            inv.save(update_fields=['status', 'responded_at'])
            qr.assignees.add(request.user)
            try:
                QuoteLog.objects.create(quote=qr, user=request.user, action='Meghívás elfogadva (Beszállok)')
            except Exception:
                pass
        return Response({'status': 'accepted'})

    @action(detail=True, methods=['post'])
    def decline_invite(self, request, pk=None):
        qr = self.get_object()
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Auth required'}, status=401)
        inv = QuoteRequestInvitation.objects.filter(quote_request=qr, invitee=request.user, status='pending').first()
        if not inv:
            return Response({'error': 'Nincs függő meghívás'}, status=404)
        with transaction.atomic():
            inv.status = 'declined'
            inv.responded_at = timezone.now()
            inv.save(update_fields=['status', 'responded_at'])
            try:
                QuoteLog.objects.create(quote=qr, user=request.user, action='Meghívás elutasítva')
            except Exception:
                pass
        return Response({'status': 'declined'})

    @action(detail=True, methods=['post'])
    def create_quote(self, request, pk=None):
        """Create a Quote from RFQ (demand), preserving company and contacts on RFQ."""
        qr = self.get_object()
        quote_number = f"Q{timezone.now().strftime('%Y%m%d')}-{Quote.objects.count() + 1:04d}"
        creator = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
        if not creator:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            creator = User.objects.filter(is_staff=True).first() or User.objects.first()
        quote = Quote.objects.create(
            quote_request=qr,
            quote_number=quote_number,
            valid_until=timezone.now().date() + timezone.timedelta(days=30),
            created_by=creator
        )
        old_status = qr.status
        qr.status = 'quoted'
        qr.save(update_fields=['status'])
        try:
            QuoteLog.objects.create(quote=qr, user=creator, action=f'Ajánlat létrehozva: {quote_number}; státusz: {old_status} → quoted')
        except Exception:
            pass
        return Response(QuoteSerializer(quote).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def order_all(self, request, pk=None):
        qr = self.get_object()
        items = list(qr.items.all())
        return self._create_order_from_items(request, qr, items, set_status='ordered')

    @action(detail=True, methods=['post'])
    def order_partial(self, request, pk=None):
        qr = self.get_object()
        item_ids = request.data.get('item_ids') or []
        if not isinstance(item_ids, list) or not item_ids:
            return Response({'error': 'item_ids kötelező (lista)'}, status=status.HTTP_400_BAD_REQUEST)
        items = list(qr.items.filter(id__in=item_ids))
        if not items:
            return Response({'error': 'Nincs rendelhető tétel'}, status=status.HTTP_400_BAD_REQUEST)
        return self._create_order_from_items(request, qr, items, set_status='partially_ordered')

    def _create_order_from_items(self, request, qr, items, set_status: str):
        from .models import Quote, QuoteItem, Product, Order, OrderItem
        # Ensure a Quote exists to satisfy Order.quote FK
        quote = Quote.objects.filter(quote_request=qr).first()
        if not quote:
            quote_number = f"Q{timezone.now().strftime('%Y%m%d')}-{Quote.objects.count() + 1:04d}"
            creator = request.user if getattr(request, 'user', None) and request.user.is_authenticated else None
            if not creator:
                # pick any staff user as fallback
                from django.contrib.auth import get_user_model
                User = get_user_model()
                creator = User.objects.filter(is_staff=True).first() or User.objects.first()
            quote = Quote.objects.create(
                quote_request=qr,
                quote_number=quote_number,
                valid_until=timezone.now().date() + timezone.timedelta(days=30),
                created_by=creator,
                status='accepted'
            )
        # Create Order header
        order_number = f"O{timezone.now().strftime('%Y%m%d')}-{Order.objects.count() + 1:04d}"
        creator = request.user if getattr(request, 'user', None) and request.user.is_authenticated else quote.created_by
        order = Order.objects.create(
            quote=quote,
            order_number=order_number,
            delivery_date=qr.deadline or timezone.now().date(),
            created_by=creator,
            status='confirmed'
        )
        created_items = []
        for it in items:
            # Map RFQ item to a Product
            product = None
            unit = (it.unit or 'db')
            unit_price = (it.net_unit_price or 0)
            description = it.description or ''
            if it.item_type == 'product' and it.product_id:
                product = it.product
                if not unit_price:
                    unit_price = product.base_price
            elif it.item_type == 'service' and it.service_id:
                svc = it.service
                product = Product.objects.filter(name=svc.name).first()
                if not product:
                    product = Product.objects.create(
                        name=svc.name,
                        description=svc.description or '',
                        unit=svc.unit or 'óra',
                        base_price=svc.base_price or 0,
                        is_active=True,
                    )
                if not unit_price:
                    unit_price = svc.base_price or 0
                unit = it.unit or svc.unit or 'óra'
            elif it.item_type == 'manufacturing' and it.manufacturing_product_id:
                mp = it.manufacturing_product
                product = Product.objects.filter(name=mp.name).first()
                if not product:
                    product = Product.objects.create(
                        name=mp.name,
                        description=getattr(mp, 'description', '') or '',
                        unit=it.unit or 'db',
                        base_price=it.net_unit_price or 0,
                        is_active=True,
                    )
            else:
                continue
            oi = OrderItem.objects.create(
                order=order,
                product=product,
                quantity=it.quantity or 1,
                unit_price=unit_price or 0,
                description=description,
            )
            created_items.append(oi.id)
        order.total_amount = sum(item.total_price for item in order.items.all())
        order.save(update_fields=['total_amount'])
        # Update RFQ status
        old_status = qr.status
        qr.status = set_status
        qr.save(update_fields=['status'])
        try:
            QuoteLog.objects.create(quote=qr, user=request.user if request.user.is_authenticated else None, action=f'Rendelés létrehozva: {order.order_number}; státusz: {old_status} → {set_status}')
        except Exception:
            pass
        return Response({'order_id': order.id, 'order_number': order.order_number, 'items': created_items}, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@permission_classes([AllowAny])
def public_order_view(request, token: str):
    qr = get_object_or_404(QuoteRequest, public_token=token)
    if qr.public_expires_at and timezone.now() > qr.public_expires_at:
        return Response({'error': 'Link lejárt'}, status=410)
    return Response({
        'id': qr.id,
        'number': qr.number or qr.request_number,
        'title': qr.title,
        'status': qr.status,
        'items': QuoteRequestItemSerializer(qr.items.all(), many=True, context={'request': request}).data,
    })

    @action(detail=True, methods=['post'])
    def create_quote(self, request, pk=None):
        """Ajánlat kérésből ajánlat létrehozása"""
        quote_request = self.get_object()

        quote_number = f"Q{timezone.now().strftime('%Y%m%d')}-{Quote.objects.count() + 1:04d}"

        quote = Quote.objects.create(
            quote_request=quote_request,
            quote_number=quote_number,
            valid_until=timezone.now().date() + timezone.timedelta(days=30),
            created_by=request.user
        )

        quote_request.status = 'quoted'
        quote_request.save()

        serializer = QuoteSerializer(quote)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    def search(self, request):
        q = request.query_params.get('q', '')
        qs = self.queryset
        if q:
            qs = qs.filter(
                models.Q(name__icontains=q) |
                models.Q(description__icontains=q)
            )
        return Response(self.serializer_class(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def render_email(self, request, pk=None):
        qr = self.get_object()
        template_key = request.data.get('template_key', 'rfq_send')
        signature_key = request.data.get('signature_key')
        extra_context = request.data.get('context', {}) or {}

        tpl = EmailTemplate.objects.filter(key=template_key).first()
        if not tpl:
            return Response({'error': 'Hiányzó email sablon'}, status=400)
        sig = SignatureTemplate.objects.filter(key=signature_key).first() if signature_key else None

        # ensure token
        if not qr.public_token:
            qr.public_token = secrets.token_urlsafe(24)
            qr.save(update_fields=['public_token'])
        public_url = request.build_absolute_uri(f"/api/v1/sales/quote-requests/public/{qr.public_token}/order/")
        ctx = {
            'rfq_number': qr.number or qr.request_number,
            'rfq_title': qr.title,
            'company_name': qr.company.name if qr.company else (qr.customer.name if qr.customer else ''),
            'public_order_url': public_url,
            **extra_context,
        }
        subject = tpl.subject_template.format(**ctx)
        body_core = tpl.body_template.format(**ctx)
        body = f"{body_core}\n\n{sig.body_html if sig else ''}" if not tpl.is_html else f"{body_core}{sig.body_html if sig else ''}"
        return Response({'subject': subject, 'body': body, 'is_html': tpl.is_html})

class ServiceViewSet(viewsets.ModelViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    permission_classes = [AllowAny]

    @action(detail=False, methods=['get'])
    def search(self, request):
        q = request.query_params.get('q', '')
        qs = self.queryset
        if q:
            qs = qs.filter(
                models.Q(name__icontains=q) |
                models.Q(description__icontains=q) |
                models.Q(code__icontains=q)
            )
        return Response(self.serializer_class(qs, many=True).data)

    @action(detail=False, methods=['get'])
    def top(self, request):
        top_ids = list(SearchStat.objects.filter(item_type='service').order_by('-count')[:10].values_list('ref_id', flat=True))
        services = list(Service.objects.filter(id__in=top_ids))
        # preserve order of top_ids
        services.sort(key=lambda s: top_ids.index(s.id))
        return Response(ServiceSerializer(services, many=True).data)

class QuoteViewSet(viewsets.ModelViewSet):
    queryset = Quote.objects.all()
    serializer_class = QuoteSerializer
    permission_classes = [AllowAny]

    @action(detail=True, methods=['post'])
    def send_quote(self, request, pk=None):
        """Ajánlat elküldése"""
        quote = self.get_object()
        quote.status = 'sent'
        quote.save()
        
        # TODO: E-mail küldés implementálása
        return Response({'message': 'Ajánlat elküldve'})

    @action(detail=True, methods=['post'])
    def accept_quote(self, request, pk=None):
        """Ajánlat elfogadása"""
        quote = self.get_object()
        accepted_items = request.data.get('accepted_items', [])
        
        # Elfogadott tételek frissítése
        for item_data in accepted_items:
            item = quote.items.get(id=item_data['id'])
            item.is_accepted = True
            item.accepted_quantity = item_data.get('accepted_quantity', item.quantity)
            item.save()
        
        # Ajánlat státuszának frissítése
        if all(item.is_accepted for item in quote.items.all()):
            quote.status = 'accepted'
        else:
            quote.status = 'partially_accepted'
        quote.save()
        
        return Response({'message': 'Ajánlat elfogadva'})

    @action(detail=True, methods=['post'])
    def create_order(self, request, pk=None):
        """Ajánlatból megrendelés létrehozása"""
        quote = self.get_object()
        
        if quote.status not in ['accepted', 'partially_accepted']:
            return Response({'error': 'Csak elfogadott ajánlatból hozható létre megrendelés'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # Megrendelés szám generálása
        order_number = f"O{timezone.now().strftime('%Y%m%d')}-{Order.objects.count() + 1:04d}"
        
        order = Order.objects.create(
            quote=quote,
            order_number=order_number,
            delivery_date=request.data.get('delivery_date'),
            created_by=request.user
        )
        
        # Elfogadott tételekből megrendelés tételek létrehozása
        for quote_item in quote.items.filter(is_accepted=True):
            OrderItem.objects.create(
                order=order,
                product=quote_item.product,
                quantity=quote_item.accepted_quantity,
                unit_price=quote_item.unit_price,
                description=quote_item.description
            )
        
        # Összeg számítása
        order.total_amount = sum(item.total_price for item in order.items.all())
        order.save()
        
        serializer = OrderSerializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class QuoteItemViewSet(viewsets.ModelViewSet):
    queryset = QuoteItem.objects.all()
    serializer_class = QuoteItemSerializer
    permission_classes = [AllowAny]

class QuoteRequestItemViewSet(viewsets.ModelViewSet):
    queryset = QuoteRequestItem.objects.all()
    serializer_class = QuoteRequestItemSerializer
    permission_classes = [AllowAny]

    @action(detail=True, methods=['get'])
    def attachments(self, request, pk=None):
        item = self.get_object()
        serializer = QuoteRequestItemAttachmentSerializer(item.attachments.all(), many=True, context={'request': request})
        return Response(serializer.data)

    @attachments.mapping.post
    def upload_attachment(self, request, pk=None):
        item = self.get_object()
        file_obj = request.FILES.get('file')
        remark = request.data.get('remark', '')
        if not file_obj:
            return Response({'error': 'file kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = QuoteRequestItemAttachment.objects.create(
            quote_item=item,
            file=file_obj,
            remark=remark,
            uploaded_by=request.user if request.user and request.user.is_authenticated else None
        )
        return Response(QuoteRequestItemAttachmentSerializer(att, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def update_attachment_remark(self, request, pk=None):
        item = self.get_object()
        att_id = request.data.get('attachment_id')
        remark = request.data.get('remark', '')
        if not att_id:
            return Response({'error': 'attachment_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = get_object_or_404(QuoteRequestItemAttachment, id=att_id, quote_item=item)
        att.remark = remark
        att.save(update_fields=['remark'])
        return Response({'status': 'ok'})

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    permission_classes = [AllowAny]

    @action(detail=True, methods=['post'])
    def confirm_order(self, request, pk=None):
        """Megrendelés megerősítése"""
        order = self.get_object()
        order.status = 'confirmed'
        order.save()
        
        # TODO: Gyártás vezető értesítése
        return Response({'message': 'Megrendelés megerősítve'})

    @action(detail=True, methods=['post'])
    def start_production(self, request, pk=None):
        """Gyártás indítása"""
        order = self.get_object()
        order.status = 'in_production'
        order.save()
        
        # TODO: Munkalap létrehozása
        return Response({'message': 'Gyártás elindítva'})

class OrderItemViewSet(viewsets.ModelViewSet):
    queryset = OrderItem.objects.all()
    serializer_class = OrderItemSerializer
    permission_classes = [AllowAny]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [AllowAny]

    @action(detail=False, methods=['get'])
    def top(self, request):
        top_ids = list(SearchStat.objects.filter(item_type='product').order_by('-count')[:10].values_list('ref_id', flat=True))
        products = list(Product.objects.filter(id__in=top_ids))
        products.sort(key=lambda p: top_ids.index(p.id))
        return Response(ProductSerializer(products, many=True).data)


class ManufacturingProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ManufacturingProduct.objects.all()
    serializer_class = ManufacturingProductSerializer
    permission_classes = [AllowAny]

    @action(detail=False, methods=['get'])
    def top(self, request):
        top_ids = list(SearchStat.objects.filter(item_type='manufacturing').order_by('-count')[:10].values_list('ref_id', flat=True))
        mps = list(ManufacturingProduct.objects.filter(id__in=top_ids))
        mps.sort(key=lambda m: top_ids.index(m.id))
        return Response(ManufacturingProductSerializer(mps, many=True).data)

# Régi modelljeink view-jai
class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer
    permission_classes = [AllowAny]

class OpportunityViewSet(viewsets.ModelViewSet):
    queryset = Opportunity.objects.all()
    serializer_class = OpportunitySerializer
    permission_classes = [AllowAny]

class ForecastViewSet(viewsets.ModelViewSet):
    queryset = Forecast.objects.all()
    serializer_class = ForecastSerializer
    permission_classes = [AllowAny]