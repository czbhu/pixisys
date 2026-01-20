from rest_framework import viewsets, status, permissions
from django.db import models
from django.db.models import Q
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from apps.core.permissions import OwnDataFilterMixin
from .models import (
    Customer, Product, QuoteRequest, Quote, QuoteItem, QuoteRequestItem,
    Order, OrderItem, Lead, Opportunity, Forecast, CustomerOrder, CustomerOrderItem, QuoteRequestCost, WorkLog, QuoteLog,
    ChatThread, ChatMessage, ChatMessageAttachment, QuoteRequestAttachment, QuoteRequestItemAttachment
)
from .serializers import (
    CustomerSerializer, ProductSerializer, QuoteRequestSerializer, QuoteRequestItemSerializer,
    QuoteSerializer, QuoteItemSerializer, OrderSerializer, OrderItemSerializer,
    LeadSerializer, OpportunitySerializer, ForecastSerializer,
    CustomerOrderSerializer, CustomerOrderItemSerializer, QuoteRequestCostSerializer, WorkLogSerializer,
    ChatThreadSerializer, ChatMessageSerializer
)
from apps.manufacturing.models import ManufacturingProduct, Project, Service
from apps.manufacturing.serializers import ManufacturingProductSerializer
from apps.core.models import Currency
from apps.crm.models import Company as CrmCompany, Contact
from .models import QuoteLog, QuoteRequestItemAttachment, SearchStat, QuoteRequestAttachment, QuoteRequestEmailLog, QuoteRequestInvitation, WorkLog
from .serializers import ServiceSerializer, QuoteLogSerializer, QuoteRequestItemAttachmentSerializer, QuoteRequestAttachmentSerializer, QuoteRequestInvitationSerializer
from apps.core.models import EmailServerConfig, EmailTemplate, SignatureTemplate, Currency
import smtplib, ssl, imaplib, email
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import secrets
from decimal import Decimal, InvalidOperation
from django.contrib.auth import get_user_model
from django.db import transaction
from django.conf import settings


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

class QuoteRequestViewSet(OwnDataFilterMixin, viewsets.ModelViewSet):
    queryset = QuoteRequest.objects.all()  # Base queryset
    serializer_class = QuoteRequestSerializer
    permission_classes = [AllowAny]
    permission_module = 'sales'
    permission_resource = 'sales.rfqs'
    own_data_user_field = 'created_by'  # QuoteRequest.created_by = User

    def get_queryset(self):
        """Alapértelmezetten csak a nem törölt árajánlatok + OwnDataFilterMixin szűrés"""
        # Először alkalmazzuk az OwnDataFilterMixin szűrést
        queryset = super().get_queryset()
        # Majd szűrjük a törölt elemeket
        return queryset.filter(is_deleted=False)

    def list(self, request, *args, **kwargs):
        """List árajánlatok, automatikusan frissítve az archív státuszt"""
        # Frissítjük az archív státuszt a lejárt árajánlatoknál
        from django.utils import timezone
        QuoteRequest.objects.filter(
            deadline__lt=timezone.now().date()
        ).exclude(
            status__in=['archived', 'ordered']
        ).update(status='archived')
        
        return super().list(request, *args, **kwargs)

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
        material_id = request.data.get('material_id')
        quantity = request.data.get('quantity', 1)
        description = request.data.get('description', '')
        net_unit_price_raw = request.data.get('net_unit_price')
        unit = request.data.get('unit') or 'db'
        vat_rate = request.data.get('vat_rate') or 27
        discount_percent = request.data.get('discount_percent') or 0
        discount_amount = request.data.get('discount_amount') or 0
        
        product = None
        material = None
        product_name = ''
        
        if material_id:
            from apps.warehouse.models import Material
            material = get_object_or_404(Material, id=material_id)
            product_name = material.name
            if net_unit_price_raw in (None, "", "0"):
                net_unit_price_raw = material.unit_selling_price or 0
        elif product_id:
            product = get_object_or_404(Product, id=product_id)
            product_name = product.name
            if net_unit_price_raw in (None, "", "0"):
                net_unit_price_raw = product.base_price or 0
        else:
            return Response({'error': 'product_id vagy material_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        
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
            material=material,
            quantity=quantity_val,
            unit=unit,
            net_unit_price=net_unit_price,
            vat_rate=vat_rate,
            discount_percent=discount_percent,
            discount_amount=discount_amount,
            description=description
        )
        if material:
            _bump_search_stat('product', material.id)
        elif product:
            _bump_search_stat('product', product.id)
        QuoteLog.objects.create(quote=qr, user=request.user, action=f'Termék hozzáadva: {product_name}')
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
        reply_to = request.data.get('reply_to', '')
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
        
        # Use user's default signature if not specified
        if not signature_key:
            if hasattr(request.user, 'preferences') and request.user.preferences and request.user.preferences.default_signature:
                signature_key = request.user.preferences.default_signature.key
        
        sig = SignatureTemplate.objects.filter(key=signature_key).first() if signature_key else None

        # Ensure there is a public token for link rendering
        if not qr.public_token:
            qr.public_token = secrets.token_urlsafe(24)
            qr.save(update_fields=['public_token'])
        # Render simple templates using format
        public_url = f"{settings.FRONTEND_BASE_URL}/public/quote/{qr.public_token}/order"
        
        # Build contact names for personalized greeting
        contact_names = ', '.join([c.name for c in qr.contacts.all()]) if qr.contacts.exists() else 'Ügyfelünk'
        
        ctx = {
            'rfq_number': qr.number or qr.request_number,
            'rfq_title': qr.title,
            'company_name': qr.company.name if qr.company else '',
            'public_order_url': public_url,
            'contact_names': contact_names,
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
            if reply_to:
                msg['Reply-To'] = reply_to
            subtype = 'html' if tpl.is_html else 'plain'
            msg.attach(MIMEText(body, subtype, 'utf-8'))
            mime_bytes = msg.as_bytes()
        else:
            msg['Subject'] = subject
            msg['From'] = cfg.from_email
            msg['To'] = to
            if cc:
                msg['Cc'] = cc
            if reply_to:
                msg['Reply-To'] = reply_to
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
        public_url = f"{settings.FRONTEND_BASE_URL}/public/quote/{qr.public_token}/order"
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
                # First try to parse as integer ID (local DB)
                try:
                    local_id = int(str(company_id))
                    qr.company = CrmCompany.objects.get(id=local_id)
                except (ValueError, TypeError):
                    # Not an integer, likely a Pixinvoice UUID
                    try:
                        from apps.finance.views import PixinvoiceClient
                        client = PixinvoiceClient()
                        # Fetch customer details from Pixinvoice
                        cust_data = client.get_customer(str(company_id))
                        
                        # Try to find matching local company
                        tax = (cust_data.get('tax_number') or cust_data.get('taxNumber') or '').strip()
                        name = (cust_data.get('name') or cust_data.get('full_name') or '').strip()
                        
                        company_obj = None
                        if tax:
                            # Try lookup by tax number first
                            company_obj = CrmCompany.objects.filter(tax_number__contains=tax).first()
                            if not company_obj:
                                # Try full tax match
                                company_obj = CrmCompany.objects.filter(full_tax_number__contains=tax).first()
                                
                        if not company_obj and name:
                            # Fallback to name match
                            company_obj = CrmCompany.objects.filter(name__iexact=name).first()
                            
                        if not company_obj and name:
                            # Create new local company if not exists
                            print(f"[RFQs] Creating new local company for: {name} (PixID: {company_id})")
                            company_obj = CrmCompany.objects.create(
                                name=name,
                                tax_number=tax[:20] if tax else None,
                                email=cust_data.get('email'),
                                address=cust_data.get('billing_address') or cust_data.get('address') or '',
                                city=cust_data.get('city') or '',
                                postal_code=cust_data.get('zip') or cust_data.get('postal_code') or '',
                                street_name=cust_data.get('street') or cust_data.get('address') or '',
                                is_customer=True
                            )
                        
                        if company_obj:
                            qr.company = company_obj
                        else:
                            print(f"[RFQs] Could not sync company: {company_id}")
                            
                    except Exception as e:
                        print(f"[RFQs] Error syncing Pixinvoice company: {e}")
                        pass
                        
            except CrmCompany.DoesNotExist:
                pass
        elif 'company_id' in data:
            # Explicitly set to None if company_id is in data but null/empty
            qr.company = None
        # Project - check if 'project_id' or 'project' is in data (even if None/null)
        if 'project_id' in data or 'project' in data:
            project_id = data.get('project_id') or data.get('project')
            print(f"[DEBUG] Project update: project_id from request = {project_id}")
            if project_id:
                try:
                    from apps.manufacturing.models import Project
                    qr.project = Project.objects.get(id=project_id)
                    print(f"[DEBUG] Project set to: {qr.project.name}")
                except Exception as e:
                    print(f"[DEBUG] Project set failed: {e}")
                    pass
            else:
                qr.project = None
                print(f"[DEBUG] Project cleared (set to None)")
        else:
            print(f"[DEBUG] No project_id in request data")
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
            
        if isinstance(contact_ids, list):
            try:
                # Separate integery IDs (local) and UUIDs (Pixinvoice)
                valid_ids = []
                uuid_ids = []
                for cid in contact_ids:
                    try:
                        valid_ids.append(int(str(cid)))
                    except (ValueError, TypeError):
                        uuid_ids.append(str(cid))
                
                # Retrieve local contacts by ID
                contacts_to_set = list(Contact.objects.filter(id__in=valid_ids))
                
                # Process UUIDs
                if uuid_ids:
                    # Find existing by external_id
                    found_uuid_contacts = Contact.objects.filter(external_id__in=uuid_ids)
                    contacts_to_set.extend(list(found_uuid_contacts))
                    
                    found_uuids = [c.external_id for c in found_uuid_contacts]
                    missing_uuids = [u for u in uuid_ids if u not in found_uuids]
                    
                    if missing_uuids:
                        try:
                            from apps.finance.views import PixinvoiceClient
                            client = PixinvoiceClient()
                            pix_company_id = str(company_id) if company_id and not isinstance(company_id, int) and len(str(company_id)) > 10 else None
                            
                            for missing_id in missing_uuids:
                                try:
                                    ct_data = client.get_contact(missing_id, company_id=pix_company_id)
                                    new_contact = Contact.objects.create(
                                        name=ct_data.get('name') or "Unknown",
                                        email=cust_data.get('email') if 'cust_data' in locals() and not ct_data.get('email') else ct_data.get('email'),
                                        phone=ct_data.get('phone'),
                                        company=qr.company,
                                        external_id=missing_id,
                                        position=ct_data.get('position') or ''
                                    )
                                    contacts_to_set.append(new_contact)
                                except Exception as e:
                                    print(f"[RFQs] Error syncing contact {missing_id}: {e}")
                        except Exception as e:
                            print(f"[RFQs] Contact sync setup failed: {e}")
                
                qr.contacts.set(contacts_to_set)
            except Exception as e:
                print(f"[RFQs] Contact set failed: {e}")
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
            internal_description=src.internal_description,
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
        
        # copy quote-level attachments
        from apps.sales.models import QuoteRequestAttachment
        for att in src.attachments.all():
            try:
                QuoteRequestAttachment.objects.create(
                    quote_request=dst,
                    file=att.file,
                    remark=att.remark,
                    uploaded_by=request.user if request.user.is_authenticated else att.uploaded_by,
                )
            except Exception:
                pass
        
        # copy items
        for it in src.items.all():
            new_item = QuoteRequestItem.objects.create(
                quote_request=dst,
                item_type=it.item_type,
                product=it.product,
                material=it.material,
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
            # copy item-level attachments
            from apps.sales.models import QuoteRequestItemAttachment
            for item_att in it.attachments.all():
                try:
                    QuoteRequestItemAttachment.objects.create(
                        quote_item=new_item,
                        file=item_att.file,
                        remark=item_att.remark,
                        uploaded_by=request.user if request.user.is_authenticated else item_att.uploaded_by,
                    )
                except Exception:
                    pass
        try:
            QuoteLog.objects.create(quote=dst, user=request.user if request.user.is_authenticated else None, action=f'Árajánlat másolva forrásból: {src.number or src.request_number}')
        except Exception:
            pass
        return Response(QuoteRequestSerializer(dst, context={'request': request}).data, status=201)

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
    def cancel_invitation(self, request, pk=None):
        """Meghívás visszavonása/törlése (szerző vagy admin által)"""
        qr = self.get_object()
        inv_id = request.data.get('invitation_id')
        if not inv_id:
            return Response({'error': 'invitation_id kötelező'}, status=400)
        
        inv = get_object_or_404(QuoteRequestInvitation, id=inv_id, quote_request=qr)
        # TODO: Add permission check (only creator or admin can value?)
        # For now assume access rights on QR implies right to manage invites
        
        inv.delete()
        return Response({'status': 'deleted'})

    @action(detail=True, methods=['post'])
    def remove_assignee(self, request, pk=None):
        """Résztvevő eltávolítása"""
        qr = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id kötelező'}, status=400)
        
        User = get_user_model()
        user = get_object_or_404(User, id=user_id)
        
        if user in qr.assignees.all():
            qr.assignees.remove(user)
            QuoteLog.objects.create(quote=qr, user=request.user, action=f'Résztvevő eltávolítva: {user.get_full_name() or user.username}')
            
        return Response({'status': 'removed'})

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
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"order_all called for RFQ {pk}")
        qr = self.get_object()
        items = list(qr.items.all())
        logger.info(f"Creating order with {len(items)} items")
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
        from .models import CustomerOrder, CustomerOrderItem
        
        # Generate order number in Oyyyymmddxxxx format
        today = timezone.now()
        date_prefix = today.strftime('%Y%m%d')
        today_orders_count = CustomerOrder.objects.filter(
            created_at__date=today.date()
        ).count()
        order_number = f"O{date_prefix}{today_orders_count + 1:04d}"
        
        # Create CustomerOrder
        order = CustomerOrder.objects.create(
            quote_request=qr,
            order_number=order_number,
            status='new',
            created_by=request.user if request.user.is_authenticated else None
        )
        
        # Create CustomerOrderItems
        created_items = []
        for it in items:
            unit = it.unit or 'db'
            net_unit_price = it.net_unit_price or 0
            vat_rate = it.vat_rate or 27
            discount_percent = it.discount_percent or 0
            description = it.description or ''
            
            customer_order_item = CustomerOrderItem.objects.create(
                customer_order=order,
                quote_item=it,
                quantity=it.quantity or 1,
                unit=unit,
                net_unit_price=net_unit_price,
                vat_rate=vat_rate,
                discount_percent=discount_percent,
                description=description
            )
            created_items.append(customer_order_item.id)
        
        # Update RFQ status
        old_status = qr.status
        qr.status = set_status
        qr.save(update_fields=['status'])
        
        try:
            QuoteLog.objects.create(
                quote=qr, 
                user=request.user if request.user.is_authenticated else None, 
                action=f'Rendelés létrehozva: {order.order_number}; státusz: {old_status} → {set_status}'
            )
        except Exception:
            pass
        
        return Response({
            'order_id': order.id, 
            'order_number': order.order_number, 
            'items': created_items
        }, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@permission_classes([AllowAny])
def public_order_view(request, token: str):
    qr = get_object_or_404(QuoteRequest, public_token=token)
    if qr.public_expires_at and timezone.now() > qr.public_expires_at:
        return Response({'error': 'Link lejárt'}, status=410)
    
    # Megrendelő adatok
    customer_data = None
    if qr.company:
        customer_data = {
            'name': qr.company.name,
            'tax_number': qr.company.tax_number or '',
            'address': qr.company.address or '',
            'city': qr.company.city or '',
            'postal_code': qr.company.postal_code or '',
            'country': qr.company.country or 'Magyarország',
        }
    elif qr.customer:
        customer_data = {
            'name': qr.customer.name,
            'tax_number': getattr(qr.customer, 'tax_number', ''),
            'address': getattr(qr.customer, 'address', ''),
            'city': getattr(qr.customer, 'city', ''),
            'postal_code': getattr(qr.customer, 'postal_code', ''),
            'country': getattr(qr.customer, 'country', 'Magyarország'),
        }
    
    # Szállító adatok (alapértelmezett cég az Alap adatok beállításokból)
    from apps.core.models import Company
    supplier_data = {
        'name': 'PixiSys Kft.',
        'tax_number': '12345678-1-23',
        'eu_tax_number': '',
        'address': 'Fő utca 1.',
        'phone': '',
        'email': '',
        'website': '',
    }
    
    # Try to get default company
    try:
        default_company = Company.objects.filter(is_default=True).first()
        if default_company:
            supplier_data = {
                'name': default_company.name,
                'tax_number': default_company.tax_number,
                'eu_tax_number': default_company.eu_tax_number or '',
                'address': default_company.address,
                'phone': default_company.phone or '',
                'email': default_company.email,
                'website': default_company.website or '',
            }
    except Exception as e:
        # Fallback to default values if Company model is not available
        pass
    
    return Response({
        'id': qr.id,
        'number': qr.number or qr.request_number,
        'title': qr.title,
        'description': qr.description,
        'status': qr.status,
        'issue_date': qr.issue_date,
        'customer': customer_data,
        'supplier': supplier_data,
        'items': QuoteRequestItemSerializer(qr.items.all(), many=True, context={'request': request}).data,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def public_submit_order(request, token: str):
    """Publikus megrendelés beküldése"""
    qr = get_object_or_404(QuoteRequest, public_token=token)
    if qr.public_expires_at and timezone.now() > qr.public_expires_at:
        return Response({'error': 'Link lejárt'}, status=410)
    
    items_data = request.data.get('items', [])
    if not items_data:
        return Response({'error': 'Nincs megrendelendő tétel'}, status=400)
    
    # Ellenőrizzük, hogy az összes tétel létezik-e
    item_ids = [item['item_id'] for item in items_data]
    valid_items = qr.items.filter(id__in=item_ids)
    if valid_items.count() != len(item_ids):
        return Response({'error': 'Érvénytelen tétel azonosító'}, status=400)
    
    # Értesítés küldése emailben
    from django.core.mail import get_connection, EmailMultiAlternatives
    from django.conf import settings
    
    order_details = []
    for item_data in items_data:
        item = qr.items.get(id=item_data['item_id'])
        quantity = item_data['quantity']
        order_details.append(f"- {item.description or item.product.name if item.product else 'Tétel'}: {quantity} {item.unit}")
    
    email_body = f"""
Új megrendelés érkezett az alábbi árajánlathoz:

Árajánlat száma: {qr.number or qr.request_number}
Cím: {qr.title}

Megrendelt tételek:
{chr(10).join(order_details)}

A megrendelést a publikus linken keresztül küldték be.
"""
    
    try:
        # EmailServerConfig használata
        email_config = EmailServerConfig.objects.filter(is_active=True).first()
        if email_config:
            connection = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=email_config.smtp_host,
                port=email_config.smtp_port,
                username=email_config.smtp_username,
                password=email_config.smtp_password,
                use_tls=email_config.smtp_use_tls,
                use_ssl=email_config.smtp_use_ssl,
                fail_silently=False,
                timeout=10,
            )
            
            from_email = f"{email_config.from_name} <{email_config.from_email}>" if email_config.from_name else email_config.from_email
            recipient = qr.created_by.email if qr.created_by and qr.created_by.email else 'admin@pixisys.eu'
            
            msg = EmailMultiAlternatives(
                subject=f'Új megrendelés: {qr.number or qr.request_number}',
                body=email_body,
                from_email=from_email,
                to=[recipient],
                connection=connection
            )
            msg.send()
    except Exception as e:
        # Log the error but don't fail the request
        pass
    
    # Státusz frissítés - megrendelve és archív
    qr.status = 'archived'
    qr.save(update_fields=['status'])
    
    return Response({'success': True, 'message': 'Megrendelés sikeresen rögzítve'})

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
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', None)
        if not frontend_url:
            frontend_url = f"{request.scheme}://{request.get_host()}"
        public_url = f"{frontend_url}/public/quote/{qr.public_token}/order"
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


class CustomerOrderViewSet(viewsets.ModelViewSet):
    queryset = CustomerOrder.objects.all()
    serializer_class = CustomerOrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Filter for "My Orders" - invited and accepted
        if self.request.query_params.get('my_orders') == 'true':
            qs = qs.filter(
                quote_request__invitations__invitee=self.request.user,
                quote_request__invitations__status='accepted'
            )
        return qs
    
    def create(self, request, *args, **kwargs):
        """Megrendelés létrehozása árajánlatból"""
        quote_request_id = request.data.get('quote_request_id')
        items_data = request.data.get('items', [])
        
        if not quote_request_id:
            return Response({'error': 'quote_request_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            quote_request = QuoteRequest.objects.get(id=quote_request_id)
        except QuoteRequest.DoesNotExist:
            return Response({'error': 'Árajánlat nem található'}, status=status.HTTP_404_NOT_FOUND)
        
        # Megrendelésszám generálás
        today = timezone.now().date()
        date_str = today.strftime('%Y%m%d')
        last_order = CustomerOrder.objects.filter(
            order_number__startswith=f'O{date_str}'
        ).order_by('-order_number').first()
        
        if last_order:
            last_seq = int(last_order.order_number[-4:])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        order_number = f'O{date_str}{new_seq:04d}'
        
        with transaction.atomic():
            # Megrendelés létrehozása
            order = CustomerOrder.objects.create(
                quote_request=quote_request,
                order_number=order_number,
                notes=request.data.get('notes', ''),
                created_by=request.user if request.user.is_authenticated else None
            )
            
            # Tételek létrehozása
            for item_data in items_data:
                quote_item_id = item_data.get('quote_item_id')
                quantity = item_data.get('quantity')
                
                if not quote_item_id or not quantity:
                    continue
                
                try:
                    quote_item = QuoteRequestItem.objects.get(id=quote_item_id, quote_request=quote_request)
                    CustomerOrderItem.objects.create(
                        customer_order=order,
                        quote_item=quote_item,
                        quantity=quantity,
                        unit=quote_item.unit,
                        net_unit_price=quote_item.net_unit_price or 0,
                        vat_rate=quote_item.vat_rate or 27,
                        discount_percent=quote_item.discount_percent or 0,
                        description=quote_item.description
                    )
                except QuoteRequestItem.DoesNotExist:
                    pass
            
            # Árajánlat státusz frissítése
            quote_request.status = 'ordered'
            quote_request.save(update_fields=['status'])
        
        serializer = self.get_serializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Megrendelés megerősítése"""
        order = self.get_object()
        if order.status != 'new':
            return Response({'error': 'Csak új megrendelés erősíthető meg'}, status=status.HTTP_400_BAD_REQUEST)
        
        order.status = 'confirmed'
        order.confirmed_at = timezone.now()
        order.save()
        return Response(self.get_serializer(order).data)
    
    @action(detail=True, methods=['post'])
    def start_production(self, request, pk=None):
        """Gyártás indítása"""
        order = self.get_object()
        if order.status != 'confirmed':
            return Response({'error': 'Csak megerősített megrendelés indítható gyártásba'}, status=status.HTTP_400_BAD_REQUEST)
        
        order.status = 'in_production'
        order.production_started_at = timezone.now()
        order.save()
        return Response(self.get_serializer(order).data)
    
    @action(detail=True, methods=['post'])
    def mark_ready(self, request, pk=None):
        """Gyártás befejezése - timestamp szerkeszthető"""
        order = self.get_object()
        if order.status != 'in_production':
            return Response({'error': 'Csak gyártásban lévő megrendelés jelölhető késznek'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Parse timestamp if provided
        timestamp_str = request.data.get('timestamp')
        if timestamp_str:
            try:
                from datetime import datetime
                ready_at = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                ready_at = timezone.make_aware(ready_at) if timezone.is_naive(ready_at) else ready_at
            except Exception:
                ready_at = timezone.now()
        else:
            ready_at = timezone.now()
        
        order.status = 'ready'
        order.ready_at = ready_at
        order.save()
        return Response(self.get_serializer(order).data)
    
    @action(detail=True, methods=['post'])
    def start_delivery(self, request, pk=None):
        """Szállítás indítása vagy email újraküldése - publikus link és e-mail generálás"""
        import secrets
        from datetime import timedelta
        from django.core.mail import get_connection, EmailMultiAlternatives
        from django.template.loader import render_to_string
        from django.conf import settings
        
        order = self.get_object()
        
        # Ellenőrizzük, hogy kész vagy már szállítás alatt van-e
        if order.status not in ['ready', 'in_delivery']:
            return Response({'error': 'Csak kész vagy szállítás alatt lévő megrendeléshez küldhető szállítási email'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Ha még nincs token vagy lejárt, generálunk újat
        regenerate_token = False
        if not order.public_delivery_token:
            regenerate_token = True
        elif order.public_delivery_expires_at and timezone.now() > order.public_delivery_expires_at:
            regenerate_token = True
        
        if regenerate_token:
            order.public_delivery_token = secrets.token_hex(20)
            order.public_delivery_expires_at = timezone.now() + timedelta(days=30)
        
        # Csak akkor váltunk in_delivery státuszra, ha még ready-ben van
        if order.status == 'ready':
            order.status = 'in_delivery'
            order.delivery_started_at = timezone.now()
        
        # Show prices parameter from request (default: True)
        show_prices = request.data.get('show_prices', True)
        order.show_prices = show_prices
        
        order.save()
        
        # Build public delivery URL
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
        delivery_url = f"{frontend_url}/public/delivery/{order.public_delivery_token}"
        
        # Get recipient email from request or use quote_request contact
        recipient_email = request.data.get('recipient_email')
        if not recipient_email and order.quote_request.contacts.exists():
            recipient_email = order.quote_request.contacts.first().email
        
        # Send email if recipient exists
        email_sent = False
        error_message = None
        if recipient_email:
            try:
                # EmailServerConfig használata - ugyanaz mint a teszt email
                email_config = EmailServerConfig.objects.filter(is_active=True).first()
                if not email_config:
                    error_message = 'Nincs aktív email szerver konfiguráció'
                else:
                    # SMTP kapcsolat létrehozása - explicit backend használattal
                    connection = get_connection(
                        backend='django.core.mail.backends.smtp.EmailBackend',
                        host=email_config.smtp_host,
                        port=email_config.smtp_port,
                        username=email_config.smtp_username,
                        password=email_config.smtp_password,
                        use_tls=email_config.smtp_use_tls,
                        use_ssl=email_config.smtp_use_ssl,
                        fail_silently=False,
                        timeout=10,
                    )
                    
                    context = {
                        'order': order,
                        'delivery_url': delivery_url,
                        'company_name': order.quote_request.company.name if order.quote_request.company else (order.quote_request.customer.name if order.quote_request.customer else 'Ügyfél'),
                    }
                    html_message = render_to_string('emails/delivery_notification.html', context)
                    text_message = f'A megrendelés szállítása megkezdődött. Szállítólevél megtekintése: {delivery_url}'
                    
                    from_email = f"{email_config.from_name} <{email_config.from_email}>" if email_config.from_name else email_config.from_email
                    
                    msg = EmailMultiAlternatives(
                        subject=f'Szállítás megkezdődött - {order.order_number}',
                        body=text_message,
                        from_email=from_email,
                        to=[recipient_email],
                        connection=connection
                    )
                    msg.attach_alternative(html_message, "text/html")
                    msg.send()
                    email_sent = True
            except Exception as e:
                error_message = f"Email küldési hiba: {str(e)}"
                print(error_message)
        
        return Response({
            'order': self.get_serializer(order).data,
            'delivery_url': delivery_url,
            'email_sent': email_sent,
            'error': error_message,
            'message': 'Email újraküldve' if order.status == 'in_delivery' and order.delivery_started_at else 'Szállítás elindítva'
        })
    
    @action(detail=True, methods=['post'])
    def mark_delivered(self, request, pk=None):
        """Kiszállítva jelölés - timestamp szerkeszthető"""
        order = self.get_object()
        if order.status != 'in_delivery':
            return Response({'error': 'Csak szállítás alatt lévő megrendelés jelölhető kiszállítottnak'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Parse timestamp if provided
        timestamp_str = request.data.get('timestamp')
        if timestamp_str:
            try:
                from datetime import datetime
                delivered_at = datetime.strptime(timestamp_str, '%Y-%m-%d %H:%M:%S')
                delivered_at = timezone.make_aware(delivered_at) if timezone.is_naive(delivered_at) else delivered_at
            except Exception:
                delivered_at = timezone.now()
        else:
            delivered_at = timezone.now()
        
        order.status = 'delivered'
        order.delivered_at = delivered_at
        order.save()
        return Response(self.get_serializer(order).data)
    
    @action(detail=True, methods=['get'])
    def work_sheet(self, request, pk=None):
        """Munkalap PDF generálás - duplikált A4 oldal"""
        from django.http import HttpResponse
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import cm
        from io import BytesIO
        import qrcode
        from reportlab.lib.utils import ImageReader
        
        order = self.get_object()
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        
        # Hungarian font support
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        try:
            pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
            font_name = 'DejaVu'
        except:
            font_name = 'Helvetica'
        
        rfq = order.quote_request

        # Generate QR Code
        # Base URL hardcoded or from settings? User specified erp.pixisys.eu
        base_url = "https://erp.pixisys.eu"
        target_url = f"{base_url}/sales/customer-orders/{order.id}"
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(target_url)
        qr.make(fit=True)
        qr_pil_img = qr.make_image(fill_color="black", back_color="white")
        
        qr_buffer = BytesIO()
        qr_pil_img.save(qr_buffer, format="PNG")
        qr_buffer.seek(0)
        qr_image = ImageReader(qr_buffer)
        
        # Get contact names from quote request
        contact_names = ''
        if rfq and rfq.contacts.exists():
            contact_names = ', '.join([c.name for c in rfq.contacts.all()[:2]])
        
        # Get project name from quote request
        project_name = rfq.project_name if rfq and hasattr(rfq, 'project_name') and rfq.project_name else '-'
        
        def draw_section(start_y, include_internal_desc=False):
            """Draw one section of the worksheet"""
            y = start_y
            
            # Draw QR Code (Top Right)
            # Position: Right margin 2cm. Top aligned with title.
            qr_size = 2.5*cm
            p.drawImage(qr_image, width - 2*cm - qr_size, y - qr_size + 0.5*cm, width=qr_size, height=qr_size)
            
            # Helper to draw text fitting available width next to QR code
            # Available width: Full width - Left Margin - Right Margin - QR size - Gap
            max_text_width = width - 2*cm - 2*cm - qr_size - 0.5*cm
            
            def draw_fitted_text(x, y, text, max_w, initial_font_size=10):
                font_size = initial_font_size
                text_width = p.stringWidth(text, font_name, font_size)
                while text_width > max_w and font_size > 6:
                    font_size -= 0.5
                    text_width = p.stringWidth(text, font_name, font_size)
                
                p.setFont(font_name, font_size)
                p.drawString(x, y, text)
                # Reset font for next lines potentially to standard size (though we set it explicitly before calls usually)
                p.setFont(font_name, initial_font_size)

            p.setFont(font_name, 12)
            p.drawString(2*cm, y, f"MUNKALAP - {order.order_number}")
            
            y -= 0.8*cm
            p.setFont(font_name, 10)
            
            # Basic info - use fitted text because of QR code
            customer_name = rfq.company.name if rfq and rfq.company else ''
            draw_fitted_text(2*cm, y, f"Ügyfél: {customer_name}", max_text_width)
            y -= 0.6*cm
            
            # Contact info
            draw_fitted_text(2*cm, y, f"Kapcsolattartó: {contact_names}", max_text_width)
            y -= 0.6*cm
            
            # Title might also overlap if long
            draw_fitted_text(2*cm, y, f"Megnevezés: {rfq.title if rfq else ''}", max_text_width)
            y -= 0.6*cm
            
            # From here, we are below the QR code
            p.setFont(font_name, 10) # Ensure font is reset
            p.drawString(2*cm, y, f"Projekt: {project_name}")
            y -= 0.6*cm
            
            # Description
            desc_text = rfq.description if rfq and rfq.description else ''
            if desc_text:
                p.drawString(2*cm, y, f"Leírás: {desc_text[:60]}")
                y -= 0.6*cm
            
            # Internal description (only in second section)
            if include_internal_desc:
                int_desc = rfq.internal_description if rfq and rfq.internal_description else ''
                if int_desc:
                    p.drawString(2*cm, y, f"Belső leírás: {int_desc[:60]}")
                    y -= 0.6*cm
            
            # Items
            y -= 0.4*cm
            p.setFont(font_name, 9)
            for item in order.items.all():
                quote_item = item.quote_item
                
                # Get item details
                item_name = ''
                item_code = ''
                item_description = ''
                
                if quote_item.product:
                    item_name = quote_item.product.name
                    item_code = quote_item.product.code
                    item_description = quote_item.product.description or ''
                elif quote_item.material:
                    item_name = quote_item.material.name
                    item_code = quote_item.material.code
                    item_description = quote_item.material.description or ''
                elif quote_item.manufacturing_product:
                    item_name = quote_item.manufacturing_product.name
                    item_code = quote_item.manufacturing_product.code or ''
                    item_description = quote_item.manufacturing_product.description or ''
                elif quote_item.service:
                    item_name = quote_item.service.name
                    item_code = quote_item.service.code or ''
                    item_description = quote_item.service.description or ''
                
                # Draw item info
                p.drawString(2*cm, y, f"Cikkszám: {item_code}")
                y -= 0.5*cm
                p.drawString(2*cm, y, f"Név: {item_name[:50]}")
                y -= 0.5*cm
                if item_description:
                    p.drawString(2*cm, y, f"Leírás: {item_description[:60]}")
                    y -= 0.5*cm
                p.drawString(2*cm, y, f"Mennyiség: {float(item.quantity)} {quote_item.unit}")
                y -= 0.7*cm
            
            return y
        
        # Top section (first 1/3 of page)
        start_y = height - 2*cm
        end_y = draw_section(start_y, include_internal_desc=False)
        
        # Dashed line separator right below the top section (centered, 15cm long)
        y_separator = end_y - 0.5*cm
        line_length = 15*cm
        line_start = (width - line_length) / 2
        line_end = line_start + line_length
        
        # Draw dashed line
        p.setDash(6, 3)  # 6 points on, 3 points off
        p.line(line_start, y_separator, line_end, y_separator)
        p.setDash()  # Reset to solid line
        
        # Bottom section starts right after the dashed line
        start_y_bottom = y_separator - 0.5*cm
        draw_section(start_y_bottom, include_internal_desc=True)
        
        p.save()
        buffer.seek(0)
        
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="munkalap_{order.order_number}.pdf"'
        return response
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Megrendelés törlése"""
        order = self.get_object()
        if order.status == 'delivered':
            return Response({'error': 'Kiszállított megrendelés nem törölhető'}, status=status.HTTP_400_BAD_REQUEST)
        
        order.status = 'cancelled'
        order.save()
        return Response(self.get_serializer(order).data)
    
    @action(detail=False, methods=['get'])
    def invoiceable(self, request):
        """Get orders ready for invoicing (ready, in_delivery, delivered status)"""
        orders = self.queryset.filter(status__in=['ready', 'in_delivery', 'delivered'])
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['patch', 'post'], permission_classes=[permissions.AllowAny])
    def update_invoice_number(self, request, pk=None):
        """Update invoice number for an order (public endpoint for PixInvoice callback)"""
        order = self.get_object()
        
        # Check if invoice_number is in request data (even if None)
        if 'invoice_number' not in request.data:
            return Response({'error': 'invoice_number mező kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        
        invoice_number = request.data.get('invoice_number')
        # Allow None/null to clear the invoice number (for storno)
        order.invoice_number = invoice_number
        order.save()
        return Response(self.get_serializer(order).data)
    
    @action(detail=False, methods=['post'])
    def create_invoices(self, request):
        """Create invoices in PixInvoice for selected orders"""
        import requests
        from decimal import Decimal
        from django.conf import settings
        import logging
        from datetime import date, timedelta
        import traceback
        
        logger = logging.getLogger(__name__)
        
        order_ids = request.data.get('order_ids', [])
        if not order_ids:
            return Response({'error': 'Nem lett megrendelés kiválasztva'}, status=status.HTTP_400_BAD_REQUEST)
        
        orders = self.queryset.filter(id__in=order_ids)
        if not orders.exists():
            return Response({'error': 'Nem található megrendelés'}, status=status.HTTP_404_NOT_FOUND)
        
        # Group orders by company
        from collections import defaultdict
        grouped_orders = defaultdict(list)
        for order in orders:
            if order.quote_request and order.quote_request.company:
                company_id = order.quote_request.company.id
                grouped_orders[company_id].append(order)
        
        # PixInvoice API settings from Django settings
        PIXINVOICE_API_URL = settings.PIXINVOICE_API_URL
        PIXINVOICE_API_KEY = settings.PIXINVOICE_API_KEY
        
        invoices_created = 0
        errors = []
        
        for company_id, company_orders in grouped_orders.items():
            try:
                company = company_orders[0].quote_request.company
                
                # Prepare invoice data
                invoice_items = []
                for order in company_orders:
                    for item in order.items.all():
                        quote_item = item.quote_item
                        
                        # Get item name
                        item_name = ''
                        if quote_item.product:
                            item_name = quote_item.product.name
                        elif quote_item.material:
                            item_name = quote_item.material.name
                        elif quote_item.manufacturing_product:
                            item_name = quote_item.manufacturing_product.name
                        elif quote_item.service:
                            item_name = quote_item.service.name
                        
                        # Calculate prices
                        net_total = item.quantity * item.net_unit_price
                        discount = net_total * (item.discount_percent / Decimal('100'))
                        net_discounted = net_total - discount
                        
                        invoice_items.append({
                            'name': f"{item_name} (Megr: {order.order_number})",
                            'quantity': float(item.quantity),
                            'unit_price': float(item.net_unit_price),
                            'vat_rate': float(item.vat_rate),
                            'net_amount': float(net_discounted),
                        })
                
                # Call PixInvoice API to create invoice
                # Build address from postal_code and city if available
                address = ''
                if company.postal_code and company.city:
                    address = f"{company.postal_code} {company.city}"
                elif company.address:
                    address = company.address
                
                from datetime import date, timedelta
                
                # Prepare invoice items with required fields
                formatted_items = []
                for item in invoice_items:
                    formatted_items.append({
                        'description': item['name'],
                        'quantity': item['quantity'],
                        'unit_price': item['unit_price'],
                        'vat_rate': item['vat_rate'],
                        'net_amount': item['net_amount'],
                    })
                
                # First, create or get customer in PixInvoice
                customer_data = {
                    'name': company.name,
                    'tax_number': company.tax_number[:8] if company.tax_number and len(company.tax_number) >= 8 else '00000000',
                    'city': company.city or 'Budapest',
                    'postal_code': company.postal_code or '1000',
                }
                
                customer_response = requests.post(
                    f'{PIXINVOICE_API_URL}/customers/',
                    headers={'X-Api-Key': PIXINVOICE_API_KEY},
                    json=customer_data
                )
                
                # Handle customer creation or duplicate
                if customer_response.status_code in [200, 201]:
                    customer_id = customer_response.json().get('id')
                elif customer_response.status_code in [400, 409]:
                    # Check if it's a duplicate customer error
                    response_data = customer_response.json()
                    if response_data.get('error') == 'duplicate_tax_number' and 'existing_customer' in response_data:
                        # Use existing customer
                        customer_id = response_data['existing_customer']['id']
                        logger.info(f"Using existing customer {customer_id} for {company.name}")
                    else:
                        errors.append(f"{company.name}: Failed to create customer - {customer_response.text}")
                        continue
                else:
                    errors.append(f"{company.name}: Failed to create customer - HTTP {customer_response.status_code}: {customer_response.text}")
                    continue
                
                # Get company ID from PixInvoice (the billing company)
                companies_response = requests.get(
                    f'{PIXINVOICE_API_URL}/companies/',
                    headers={'X-Api-Key': PIXINVOICE_API_KEY}
                )
                
                if companies_response.status_code != 200:
                    errors.append(f"{company.name}: Failed to get companies - HTTP {companies_response.status_code}")
                    continue
                
                companies_data = companies_response.json()
                if not companies_data.get('results'):
                    errors.append(f"{company.name}: No companies found in PixInvoice")
                    continue
                
                # Use the first company as the billing company
                company_id_pixinvoice = companies_data['results'][0]['id']
                
                # Generate invoice number from order numbers
                # Format: ERP-YYYYMMDD-XXXXX where XXXXX is the first order number
                invoice_number = f"ERP-{date.today().strftime('%Y%m%d')}-{company_orders[0].order_number}"
                
                # Prepare payload for PixInvoice
                invoice_payload = {
                    'company_id': company_id_pixinvoice,
                    'customer_id': customer_id,
                    'invoice_number': invoice_number,
                    'items': formatted_items,
                    'issue_date': date.today().isoformat(),
                    'due_date': (date.today() + timedelta(days=8)).isoformat(),
                    'payment_method': 'transfer',
                    'notes': f"ERP megrendelések: {', '.join([o.order_number for o in company_orders])}",
                }
                
                response = requests.post(
                    f'{PIXINVOICE_API_URL}/invoices/',
                    headers={'X-Api-Key': PIXINVOICE_API_KEY},
                    json=invoice_payload
                )
                
                if response.status_code == 201:
                    invoice_data = response.json()
                    invoice_number = invoice_data.get('invoice_number')
                    
                    # Update order invoice numbers
                    for order in company_orders:
                        order.invoice_number = invoice_number
                        order.save()
                    
                    invoices_created += 1
                else:
                    error_msg = f"{company.name}: HTTP {response.status_code} - {response.text}"
                    logger.error(f"PixInvoice API error: {error_msg}")
                    errors.append(error_msg)
            
            except Exception as e:
                tb = traceback.format_exc()
                # Safely get company name
                try:
                    company_name = company.name if 'company' in locals() else f"Company ID {company_id}"
                except:
                    company_name = f"Company ID {company_id}"
                
                error_msg = f"{company_name}: {str(e)}"
                logger.error(f"Error creating invoice for {company_name}: {tb}")
                
                # Write to dedicated error file
                try:
                    with open('/tmp/erp_invoice_errors.log', 'a') as f:
                        f.write(f"\n{'='*80}\n")
                        f.write(f"Time: {date.today().isoformat()} - Company: {company_name}\n")
                        f.write(tb)
                        f.write(f"\n{'='*80}\n")
                except Exception as write_error:
                    logger.error(f"Failed to write to error log: {write_error}")
                
                errors.append(error_msg)

        
        if invoices_created > 0:
            return Response({
                'success': True,
                'invoices_created': invoices_created,
                'errors': errors if errors else None,
            })
        else:
            return Response({
                'success': False,
                'message': 'Nem sikerült számlát létrehozni',
                'errors': errors,
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CustomerOrderItemViewSet(viewsets.ModelViewSet):
    queryset = CustomerOrderItem.objects.all()
    serializer_class = CustomerOrderItemSerializer
    permission_classes = [IsAuthenticated]

    permission_classes = [AllowAny]


@api_view(['GET'])
@permission_classes([AllowAny])
def public_delivery_view(request, token: str):
    """
    Publikus szállítólevél megtekintése token alapján
    Nem igényel bejelentkezést
    """
    try:
        order = CustomerOrder.objects.select_related(
            'quote_request', 
            'quote_request__company', 
            'quote_request__customer'
        ).prefetch_related(
            'items__quote_item__product',
            'items__quote_item__material',
            'items__quote_item__manufacturing_product',
            'items__quote_item__service'
        ).get(public_delivery_token=token)
    except CustomerOrder.DoesNotExist:
        return Response({'error': 'Érvénytelen vagy lejárt link'}, status=404)
    
    # Check expiration
    if order.public_delivery_expires_at and timezone.now() > order.public_delivery_expires_at:
        return Response({'error': 'A link lejárt'}, status=410)
    
    # Build response data
    quote_request = order.quote_request
    customer_name = ''
    if quote_request.company:
        customer_name = quote_request.company.name
    elif quote_request.customer:
        customer_name = quote_request.customer.name
    
    items_data = []
    for item in order.items.all():
        quote_item = item.quote_item
        
        # Determine item type and name
        item_name = ''
        item_code = ''
        if quote_item.product:
            item_name = quote_item.product.name
            item_code = quote_item.product.code
        elif quote_item.material:
            item_name = quote_item.material.name
            item_code = quote_item.material.code
        elif quote_item.manufacturing_product:
            item_name = quote_item.manufacturing_product.name
            item_code = quote_item.manufacturing_product.code or ''
        elif quote_item.service:
            item_name = quote_item.service.name
            item_code = quote_item.service.code or ''
        
        # Calculate prices (convert to Decimal for precision)
        from decimal import Decimal
        net_total = item.quantity * item.net_unit_price
        discount = net_total * (item.discount_percent / Decimal('100'))
        discounted_net = net_total - discount
        gross_total = discounted_net * (Decimal('1') + item.vat_rate / Decimal('100'))
        
        items_data.append({
            'id': item.id,
            'item_code': item_code,
            'item_name': item_name,
            'quantity': float(item.quantity),
            'unit': quote_item.unit,
            'net_unit_price': float(item.net_unit_price),
            'discount_percent': float(item.discount_percent),
            'vat_rate': float(item.vat_rate),
            'net_total': float(net_total),
            'discounted_net_total': float(discounted_net),
            'gross_total': float(gross_total),
        })
    
    response_data = {
        'order_number': order.order_number,
        'customer_name': customer_name,
        'title': quote_request.title if quote_request else '',
        'description': quote_request.description if quote_request else '',
        'delivery_started_at': order.delivery_started_at.isoformat() if order.delivery_started_at else None,
        'delivery_confirmed': order.delivery_confirmed,
        'delivery_notes': order.delivery_notes,
        'show_prices': getattr(order, 'show_prices', True),
        'items': items_data,
        'contacts': [
            {'name': c.name, 'email': c.email, 'phone': c.phone}
            for c in quote_request.contacts.all()
        ] if quote_request else [],
    }
    
    return Response(response_data)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_delivery_pdf(request, token: str):
    """
    Szállítólevél PDF generálás publikus token alapján
    Nem igényel bejelentkezést
    """
    from django.http import HttpResponse
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import cm
    from io import BytesIO
    from decimal import Decimal
    
    try:
        order = CustomerOrder.objects.select_related(
            'quote_request',
            'quote_request__company',
            'quote_request__customer'
        ).prefetch_related(
            'items__quote_item__product',
            'items__quote_item__material',
            'items__quote_item__manufacturing_product',
            'items__quote_item__service',
            'quote_request__contacts'
        ).get(public_delivery_token=token)
    except CustomerOrder.DoesNotExist:
        return HttpResponse('Érvénytelen vagy lejárt link', status=404)
    
    # Check expiration
    if order.public_delivery_expires_at and timezone.now() > order.public_delivery_expires_at:
        return HttpResponse('A link lejárt', status=410)
    
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    
    # Font setup
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    try:
        pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
        font_name = 'DejaVu'
    except:
        font_name = 'Helvetica'
    
    # Header - Title and dates
    y = height - 2*cm
    p.setFont(font_name, 18)
    p.drawString(2*cm, y, "SZÁLLÍTÓLEVÉL")
    
    # Order number on the right
    p.setFont(font_name, 9)
    p.drawString(width - 8*cm, y + 0.3*cm, "Megrendelés szám:")
    p.setFont(font_name, 11)
    p.drawString(width - 8*cm, y - 0.2*cm, f"{order.order_number}")
    
    y -= 0.9*cm
    p.setFont(font_name, 9)
    if order.delivery_started_at:
        p.drawString(width - 8*cm, y, f"Szállítás: {order.delivery_started_at.strftime('%Y-%m-%d')}")
        y -= 0.5*cm
    
    if order.delivery_confirmed:
        p.drawString(width - 8*cm, y, f"Visszaigazolva: {order.delivery_confirmed_at.strftime('%Y-%m-%d') if order.delivery_confirmed_at else 'Igen'}")
    
    # Supplier and Customer info side by side
    y = height - 4*cm
    p.setFont(font_name, 11)
    
    # Get quote_request reference
    quote_request = order.quote_request
    
    # Left column - Supplier (Szallito)
    y_left = y
    p.drawString(2*cm, y_left, "SZÁLLÍTÓ:")
    y_left -= 0.6*cm
    p.setFont(font_name, 9)
    
    # Try to get supplier info from quote_request's company or use placeholder
    supplier_name = "Cég Neve"
    supplier_address = ""
    supplier_tax = ""
    
    # If we have a quote_request with company, use that as supplier
    if quote_request and quote_request.company:
        supplier_name = quote_request.company.name
        if hasattr(quote_request.company, 'postal_code') and hasattr(quote_request.company, 'city'):
            if quote_request.company.postal_code and quote_request.company.city:
                supplier_address = f"{quote_request.company.postal_code} {quote_request.company.city}"
        if hasattr(quote_request.company, 'tax_number') and quote_request.company.tax_number:
            supplier_tax = quote_request.company.tax_number
    
    p.drawString(2*cm, y_left, supplier_name)
    y_left -= 0.5*cm
    if supplier_address:
        p.drawString(2*cm, y_left, supplier_address)
        y_left -= 0.5*cm
    if supplier_tax:
        p.drawString(2*cm, y_left, f"Adószám: {supplier_tax}")
    
    # Right column - Customer (Megrendelo)
    y_right = y
    p.setFont(font_name, 11)
    p.drawString(11*cm, y_right, "MEGRENDELŐ:")
    y_right -= 0.6*cm
    p.setFont(font_name, 9)
    
    if quote_request:
        if quote_request.company:
            p.drawString(11*cm, y_right, quote_request.company.name)
            y_right -= 0.5*cm
            # Address from company
            address_parts = []
            if hasattr(quote_request.company, 'postal_code') and quote_request.company.postal_code:
                address_parts.append(quote_request.company.postal_code)
            if hasattr(quote_request.company, 'city') and quote_request.company.city:
                address_parts.append(quote_request.company.city)
            if address_parts:
                p.drawString(11*cm, y_right, ', '.join(address_parts))
                y_right -= 0.5*cm
            if hasattr(quote_request.company, 'tax_number') and quote_request.company.tax_number:
                p.drawString(11*cm, y_right, f"Adószám: {quote_request.company.tax_number}")
                y_right -= 0.5*cm
        elif quote_request.customer:
            p.drawString(11*cm, y_right, quote_request.customer.name)
            y_right -= 0.5*cm
    
    # Contacts
    if quote_request and quote_request.contacts.exists():
        y_right -= 0.2*cm
        p.setFont(font_name, 8)
        p.drawString(11*cm, y_right, "Kapcsolattartók:")
        y_right -= 0.4*cm
        for contact in quote_request.contacts.all()[:2]:  # Max 2 contacts
            contact_info = contact.name
            if contact.phone:
                contact_info += f" - {contact.phone}"
            p.drawString(11*cm, y_right, contact_info[:45])
            y_right -= 0.35*cm
    
    # Move y to below both columns
    y = min(y_left, y_right) - 0.5*cm
    
    # Title if exists
    if quote_request and quote_request.title:
        p.setFont(font_name, 10)
        p.drawString(2*cm, y, f"Megnevezés: {quote_request.title}")
        y -= 0.7*cm
    
    # Items table
    y -= cm
    p.setFont(font_name, 11)
    p.drawString(2*cm, y, "SZÁLLÍTOTT TÉTELEK:")
    y -= 0.7*cm
    
    # Table headers - conditional based on show_prices
    show_prices = order.show_prices if hasattr(order, 'show_prices') else True
    p.setFont(font_name, 9)
    p.drawString(2*cm, y, "Cikkszám")
    p.drawString(5*cm, y, "Megnevezés")
    p.drawString(11*cm, y, "Mennyiség")
    if show_prices:
        p.drawString(13.5*cm, y, "Nettó egységár")
        p.drawString(16.5*cm, y, "Nettó összesen")
    y -= 0.5*cm
    p.line(2*cm, y, width-2*cm, y)
    y -= 0.5*cm
    
    # Items
    total_net = Decimal('0')
    total_gross = Decimal('0')
    for item in order.items.all():
        quote_item = item.quote_item
        
        # Get item name and code
        item_name = ''
        item_code = ''
        if quote_item.product:
            item_name = quote_item.product.name
            item_code = quote_item.product.code
        elif quote_item.material:
            item_name = quote_item.material.name
            item_code = quote_item.material.code
        elif quote_item.manufacturing_product:
            item_name = quote_item.manufacturing_product.name
            item_code = quote_item.manufacturing_product.code or ''
        elif quote_item.service:
            item_name = quote_item.service.name
            item_code = quote_item.service.code or ''
        
        # Calculate prices
        net_total = item.quantity * item.net_unit_price
        discount = net_total * (item.discount_percent / Decimal('100'))
        discounted_net = net_total - discount
        gross_total = discounted_net * (Decimal('1') + item.vat_rate / Decimal('100'))
        total_net += discounted_net
        total_gross += gross_total
        
        # Draw item row
        p.drawString(2*cm, y, item_code[:15])
        p.drawString(5*cm, y, item_name[:35])
        p.drawString(11*cm, y, f"{float(item.quantity)} {quote_item.unit}")
        if show_prices:
            p.drawString(13.5*cm, y, f"{float(item.net_unit_price):,.0f} Ft")
            p.drawString(16.5*cm, y, f"{float(discounted_net):,.0f} Ft")
        y -= 0.5*cm
        
        if y < 6*cm:
            p.showPage()
            y = height - 2*cm
            p.setFont(font_name, 9)
    
    # Totals section - only if show_prices is True
    if show_prices:
        y -= 0.3*cm
        p.line(13.5*cm, y, width-2*cm, y)
        y -= 0.6*cm
        
        p.setFont(font_name, 11)
        p.drawString(13*cm, y, "Összesen (nettó):")
        p.drawRightString(width-2*cm, y, f"{float(total_net):,.0f} Ft")
    
    # Notes
    if order.delivery_notes:
        y -= 1.5*cm
        p.setFont(font_name, 10)
        p.drawString(2*cm, y, "Megjegyzés:")
        y -= 0.5*cm
        p.setFont(font_name, 9)
        # Split notes into lines
        note_lines = order.delivery_notes.split('\n')
        for line in note_lines[:5]:  # Max 5 lines
            p.drawString(2*cm, y, line[:80])
            y -= 0.4*cm
    
    # Footer
    p.setFont(font_name, 8)
    p.drawString(2*cm, 1.5*cm, f"Generálva: {timezone.now().strftime('%Y-%m-%d %H:%M')}")
    
    p.save()
    buffer.seek(0)
    
    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="szallitolevel_{order.order_number}.pdf"'
    return response


@api_view(['POST'])
@permission_classes([AllowAny])
def confirm_delivery(request, token: str):
    """
    Szállítólevél visszaigazolása publikus token alapján
    Nem igényel bejelentkezést
    """
    try:
        order = CustomerOrder.objects.get(public_delivery_token=token)
    except CustomerOrder.DoesNotExist:
        return Response({'error': 'Érvénytelen vagy lejárt link'}, status=404)
    
    # Check expiration
    if order.public_delivery_expires_at and timezone.now() > order.public_delivery_expires_at:
        return Response({'error': 'A link lejárt'}, status=410)
    
    # Check if already confirmed
    if order.delivery_confirmed:
        return Response({'error': 'A szállítólevél már visszaigazolásra került'}, status=400)
    
    # Get confirmed items and notes from request
    confirmed_items = request.data.get('confirmed_items', [])
    notes = request.data.get('notes', '')
    
    # Mark as confirmed
    order.delivery_confirmed = True
    order.delivery_confirmed_at = timezone.now()
    order.delivery_notes = notes
    order.save()
    
    # Optionally: send notification email to internal team
    # ... (implement if needed)
    
    return Response({
        'success': True,
        'message': 'Szállítólevél sikeresen visszaigazolva',
        'confirmed_at': order.delivery_confirmed_at.isoformat()
    })

class QuoteRequestCostViewSet(viewsets.ModelViewSet):
    queryset = QuoteRequestCost.objects.all()
    serializer_class = QuoteRequestCostSerializer
    permission_classes = [IsAuthenticated]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        data = list(serializer.data)
        
        # Add implicit costs from RFQ items
        rfq_id = request.query_params.get('quote_request', None)
        if rfq_id:
            try:
                rfq = QuoteRequest.objects.get(id=rfq_id)
                items = rfq.items.all()
                for item in items:
                    implicit_cost = None
                    if item.material:
                        # Material cost
                        cost_price = item.material.unit_cost_price or 0
                        implicit_cost = {
                            'id': f'implicit-mat-{item.id}',
                            'quote_request': int(rfq_id),
                            'material': item.material.id,
                            'material_name': item.material.name,
                            'code': item.material.code,
                            'name': f"{item.material.name} (Ajánlat tételből)",
                            'quantity': float(item.quantity),
                            'unit': item.unit,
                            'net_unit_price': float(cost_price),
                            'net_total': float(item.quantity) * float(cost_price),
                            'supplier': item.material.default_supplier.id if item.material.default_supplier else None,
                            'supplier_name': item.material.default_supplier.name if item.material.default_supplier else None,
                            'is_stock': True,
                            'is_implicit': True
                        }
                    elif item.service:
                        # Service cost
                        cost_price = item.service.unit_cost_price or 0
                        implicit_cost = {
                            'id': f'implicit-svc-{item.id}',
                            'quote_request': int(rfq_id),
                            'material': None,
                            'material_name': None,
                            'code': item.service.code,
                            'name': f"{item.service.name} (Ajánlat tételből)",
                            'quantity': float(item.quantity),
                            'unit': item.unit,
                            'net_unit_price': float(cost_price),
                            'net_total': float(item.quantity) * float(cost_price),
                            'supplier': item.service.default_supplier.id if item.service.default_supplier else None,
                            'supplier_name': item.service.default_supplier.name if item.service.default_supplier else None,
                            'is_stock': False,
                            'is_implicit': True
                        }
                    
                    if implicit_cost:
                        data.append(implicit_cost)
            except Exception as e:
                print(f"Error calculating implicit costs: {e}")
                
        return Response(data)

    def get_queryset(self):
        queryset = super().get_queryset()
        rfq_id = self.request.query_params.get('quote_request', None)
        if rfq_id:
            queryset = queryset.filter(quote_request_id=rfq_id)
        return queryset.order_by('id')

class WorkLogViewSet(viewsets.ModelViewSet):
    queryset = WorkLog.objects.all()
    serializer_class = WorkLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Filter: by order, by item, by user
        qs = super().get_queryset()
        order_id = self.request.query_params.get('order_id')
        item_id = self.request.query_params.get('item_id')
        user_id = self.request.query_params.get('user_id')
        search = self.request.query_params.get('search')
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')

        if order_id:
            qs = qs.filter(customer_order_id=order_id)
        if item_id:
            qs = qs.filter(item_id=item_id)
        if user_id:
            qs = qs.filter(user_id=user_id)
        
        if search:
            qs = qs.filter(
                Q(customer_order__order_number__icontains=search) |
                Q(customer_order__quote_request__customer__name__icontains=search) |
                Q(customer_order__quote_request__company__name__icontains=search) |
                Q(customer_order__quote_request__project__name__icontains=search)
            )

        if start_date:
            qs = qs.filter(started_at__date__gte=start_date)
        if end_date:
            qs = qs.filter(started_at__date__lte=end_date)
            
        return qs.order_by('-started_at')

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get the currently active work log for the user"""
        log = WorkLog.objects.filter(user=request.user, ended_at__isnull=True).first()
        if log:
            return Response(self.get_serializer(log).data)
        return Response({}) # Return empty object
    
    @action(detail=False, methods=['post'])
    def start(self, request):
        """Start a new timer"""
        # Stop any active log first
        active = WorkLog.objects.filter(user=request.user, ended_at__isnull=True).first()
        if active:
            active.ended_at = timezone.now()
            delta = active.ended_at - active.started_at
            active.duration_seconds = int(delta.total_seconds())
            active.save()

        order_id = request.data.get('order_id')
        item_id = request.data.get('item_id')
        workflow_name = request.data.get('workflow_name')
        
        if not order_id:
            return Response({'error': 'order_id required'}, status=400)
            
        new_log = WorkLog.objects.create(
            user=request.user,
            customer_order_id=order_id,
            item_id=item_id,
            workflow_name=workflow_name,
            started_at=timezone.now()
        )
        return Response(self.get_serializer(new_log).data)

    @action(detail=True, methods=['post'])
    def stop(self, request, pk=None):
        log = self.get_object()
        if log.ended_at:
             return Response({'error': 'Already stopped'}, status=400)
        
        log.ended_at = timezone.now()
        delta = log.ended_at - log.started_at
        log.duration_seconds = int(delta.total_seconds())
        log.save()
        return Response(self.get_serializer(log).data)

class ChatThreadViewSet(viewsets.ModelViewSet):
    queryset = ChatThread.objects.all()
    serializer_class = ChatThreadSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=False, methods=['get'])
    def find(self, request):
        rfq_id = request.query_params.get('rfq_id')
        order_id = request.query_params.get('order_id')
        
        if rfq_id:
            thread, _ = ChatThread.objects.get_or_create(quote_request_id=rfq_id)
        elif order_id:
            thread, _ = ChatThread.objects.get_or_create(customer_order_id=order_id)
        else:
            return Response({'error': 'rfq_id or order_id required'}, status=400)
            
        return Response(self.get_serializer(thread).data)

    @action(detail=True, methods=['post'])
    def message(self, request, pk=None):
        thread = self.get_object()
        content = request.data.get('content')
        files = request.FILES.getlist('files')
        
        if not content and not files:
            return Response({'error': 'Empty message'}, status=400)
            
        msg = ChatMessage.objects.create(
            thread=thread,
            sender=request.user,
            content=content or ''
        )
        
        for f in files:
            ChatMessageAttachment.objects.create(
                message=msg,
                file=f,
                original_filename=f.name
            )
            
        return Response(ChatMessageSerializer(msg).data)
        
    @action(detail=True, methods=['post'])
    def promote_attachment(self, request, pk=None):
        """Move attachment to Order or RFQ attachments"""
        attachment_id = request.data.get('attachment_id')
        target_type = request.data.get('target_type')  # 'rfq', 'order', 'rfq_item', 'order_item'
        target_id = request.data.get('target_id')
        
        try:
            chat_att = ChatMessageAttachment.objects.get(id=attachment_id)
        except ChatMessageAttachment.DoesNotExist:
             return Response({'error': 'Attachment not found'}, status=404)
             
        # Create copy of file
        from django.core.files.base import ContentFile
        
        # Determine source thread context to verify permissions/logic?
        # Assuming thread is pk
        
        created = None
        
        if target_type == 'rfq':
            rfq = get_object_or_404(QuoteRequest, id=target_id)
            created = QuoteRequestAttachment.objects.create(
                quote_request=rfq,
                remark=f"Chatből: {chat_att.original_filename}",
                uploaded_by=request.user
            )
            created.file.save(chat_att.original_filename, chat_att.file)
            
        elif target_type == 'rfq_item':
            item = get_object_or_404(QuoteRequestItem, id=target_id)
            created = QuoteRequestItemAttachment.objects.create(
                quote_item=item,
                remark=f"Chatből: {chat_att.original_filename}",
                uploaded_by=request.user
            )
            created.file.save(chat_att.original_filename, chat_att.file)
            
        # TODO: Add CustomerOrderAttachment if it exists? 
        # Checking models.py, CustomerOrder doesn't seem to have direct attachments model exposed in my reads, 
        # but typically it's linked to RFQ or has its own. 
        # Use RFQ attachments for now as Order is usually spawned from RFQ.
        
        if created:
            return Response({'status': 'ok', 'id': created.id})
        return Response({'error': 'Invalid target'}, status=400)
