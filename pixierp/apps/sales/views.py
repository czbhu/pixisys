from rest_framework import viewsets, status, permissions
from django.db import models
from django.db.models import Q, Prefetch, Count
from django.template import Template, Context
import datetime
from rest_framework.decorators import action, api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from apps.core.permissions import OwnDataFilterMixin
from .models import (
    Customer, Product, QuoteRequest, Quote, QuoteItem, QuoteRequestItem,
    Order, OrderItem, Lead, Opportunity, Forecast, CustomerOrder, CustomerOrderItem, QuoteRequestCost, WorkLog, QuoteLog, ApprovalRequest,
    ChatThread, ChatMessage, ChatMessageAttachment, QuoteRequestAttachment, QuoteRequestItemAttachment,
    DeliveryNote, DeliveryNoteItem, ExtraWork,
    POSCustomerIdentification, POSCoupon, POSTransaction, POSTransactionItem, POSPayment
)
from .serializers import (
    CustomerSerializer, ProductSerializer, QuoteRequestSerializer, QuoteRequestItemSerializer,
    QuoteSerializer, QuoteItemSerializer, OrderSerializer, OrderItemSerializer,
    LeadSerializer, OpportunitySerializer, ForecastSerializer,
    CustomerOrderSerializer, CustomerOrderListSerializer, CustomerOrderListWithItemsSerializer,
    InvoiceableOrderSerializer,
    CustomerOrderItemSerializer, QuoteRequestCostSerializer, WorkLogSerializer,
    ChatThreadSerializer, ChatMessageSerializer,
    DeliveryNoteSerializer, DeliveryNoteItemSerializer, ApprovalRequestSerializer,
    ExtraWorkSerializer,
    POSCustomerIdentificationSerializer, POSCouponSerializer, POSTransactionSerializer,
    POSTransactionItemSerializer, POSPaymentSerializer, POSTransactionCreateSerializer
)
from apps.manufacturing.models import ManufacturingProduct, Project, Service
from apps.manufacturing.serializers import ManufacturingProductSerializer
from apps.core.models import Currency
from apps.crm.models import Company as CrmCompany, Contact
from .models import QuoteLog, QuoteRequestItemAttachment, SearchStat, QuoteRequestAttachment, QuoteRequestEmailLog, QuoteRequestInvitation, WorkLog
from .serializers import ServiceSerializer, QuoteLogSerializer, QuoteRequestItemAttachmentSerializer, QuoteRequestAttachmentSerializer, QuoteRequestInvitationSerializer
from apps.core.models import EmailServerConfig, EmailTemplate, SignatureTemplate, Currency, Company as CoreCompany
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


def _user_can_approve_customer_orders(user):
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_superuser', False):
        return True

    try:
        from apps.hr.models import Employee

        employee = Employee.objects.prefetch_related('departments__roles').get(user=user)
        return employee.get_all_roles().filter(can_approve_orders=True).exists()
    except Exception:
        pass

    if hasattr(user, 'user_roles') and user.user_roles.filter(role__can_approve_orders=True).exists():
        return True
    if hasattr(user, 'roles') and user.roles.filter(role__can_approve_orders=True).exists():
        return True

    return False


def _user_can_request_customer_order_status_change(user, order):
    if not user or not user.is_authenticated:
        return False
    if _user_can_approve_customer_orders(user):
        return True

    is_creator = order.created_by_id == user.id
    is_quote_assignee = bool(
        order.quote_request_id and order.quote_request.assignees.filter(id=user.id).exists()
    )
    if is_creator or is_quote_assignee:
        return True

    legacy_roles = ['Projekt vezető', 'Adminisztráció', 'Szuper Admin']
    if hasattr(user, 'user_roles') and user.user_roles.filter(role__name__in=legacy_roles).exists():
        return True
    if hasattr(user, 'roles') and user.roles.filter(role__name__in=legacy_roles).exists():
        return True

    return False


def _apply_customer_order_status(order, new_status, changed_at=None):
    now = changed_at or timezone.now()
    order.status = new_status

    if new_status == 'confirmed':
        order.confirmed_at = now
    elif new_status == 'in_production':
        order.production_started_at = now
    elif new_status == 'ready':
        order.ready_at = now
    elif new_status == 'in_delivery':
        order.delivery_started_at = now
    elif new_status == 'delivered':
        order.delivered_at = now

    order.save()
    return order


def _request_customer_order_status_approval(order, requester, requested_status):
    existing = ApprovalRequest.objects.filter(customer_order=order, status='pending').first()
    if existing:
        return None, Response(
            {'error': 'Már van folyamatban lévő jóváhagyási kérelem ehhez a rendeléshez.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    approval_request = ApprovalRequest.objects.create(
        customer_order=order,
        previous_status=order.status,
        requested_status=requested_status,
        requester=requester,
        status='pending',
    )
    return approval_request, Response(
        {
            'status': 'approval_requested',
            'message': 'Jóváhagyásra vár',
            'approval_request': {
                'id': approval_request.id,
                'requested_status': approval_request.requested_status,
                'previous_status': approval_request.previous_status,
            },
        }
    )

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
        queryset = queryset.filter(is_deleted=False)
        return queryset.select_related(
            'customer', 'company', 'requested_by', 'created_by', 'project', 'currency', 'owner'
        ).prefetch_related(
            'contacts',
            'assignees',
            Prefetch(
                'items',
                queryset=QuoteRequestItem.objects.select_related(
                    'product', 'material', 'manufacturing_product', 'service'
                ).prefetch_related('attachments')
            ),
            Prefetch('attachments', queryset=QuoteRequestAttachment.objects.all()),
            Prefetch(
                'invitations',
                queryset=QuoteRequestInvitation.objects.filter(status='pending').select_related('invitee')
            ),
        )

    def list(self, request, *args, **kwargs):
        """List árajánlatok, automatikusan frissítve az archív státuszt"""
        # Frissítjük az archív státuszt a lejárt árajánlatoknál
        from django.utils import timezone
        QuoteRequest.objects.filter(
            deadline__lt=timezone.now().date()
        ).exclude(
            status__in=['archived', 'ordered']
        ).update(status='archived')

        # Optional ?order_status=... filter — applied AFTER computing
        # effective_status (in Python). Accepts comma-separated values.
        order_status_param = request.query_params.get('order_status')
        if not order_status_param:
            return super().list(request, *args, **kwargs)

        wanted = {s.strip() for s in order_status_param.split(',') if s.strip()}
        # We must compute effective_status, so apply on serialized data.
        queryset = self.filter_queryset(self.get_queryset()).filter(status='ordered')
        page = self.paginate_queryset(queryset)
        target = page if page is not None else queryset
        serializer = self.get_serializer(target, many=True)
        data = [d for d in serializer.data if d.get('effective_status') in wanted]
        if page is not None:
            return self.get_paginated_response(data)
        from rest_framework.response import Response
        return Response(data)

    def perform_create(self, serializer):
        # Új ajánlat száma: yyyymmdd + növekvő sorszám
        today_str = timezone.now().strftime('%Y%m%d')
        daily_count = QuoteRequest.objects.filter(issue_date=timezone.now().date()).count() + 1
        number = f"{today_str}{daily_count:02d}"

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

    @action(detail=True, methods=['post'])
    def reorder_items(self, request, pk=None):
        """
        Reorder items and update parent pointers.
        Expects a list of {id, sort_order, parent_id}.
        """
        qr = self.get_object()
        items_data = request.data
        if not isinstance(items_data, list):
            return Response({"error": "List expected"}, status=status.HTTP_400_BAD_REQUEST)

        valid_ids = set(qr.items.values_list('id', flat=True))
        
        with transaction.atomic():
            for item in items_data:
                iid = item.get('id')
                if iid not in valid_ids:
                    continue
                
                sort_order = item.get('sort_order', 0)
                parent_id = item.get('parent_id')
                
                if parent_id == iid:
                    parent_id = None
                    
                QuoteRequestItem.objects.filter(id=iid).update(
                    sort_order=sort_order,
                    parent_id=parent_id
                )
        
        return Response({'status': 'ok'})

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
        number = f"{today_str}{daily_count:02d}"
        return Response({
            'date': dt.isoformat(),
            'count': daily_count,
            'number': number,
        })

    @action(detail=False, methods=['get'])
    def top_companies(self, request):
        """A bejelentkezett felhasználó által leggyakrabban használt cégek"""
        user = request.user
        if not user or not user.is_authenticated:
            return Response([])
        
        # Logged in user's top companies based on QuoteRequest count
        top_ids_qs = QuoteRequest.objects.filter(
            created_by=user, 
            company__isnull=False
        ).values('company').annotate(
            count=models.Count('id')
        ).order_by('-count')[:10]
        
        # Convert to list of IDs to preserve order
        ids = [item['company'] for item in top_ids_qs]
        if not ids:
            return Response([])

        from apps.crm.serializers import CompanySerializer
        # Fetch companies
        companies = list(CrmCompany.objects.filter(id__in=ids))
        # Preserving order
        companies.sort(key=lambda c: ids.index(c.id))
        
        serializer = CompanySerializer(companies, many=True)
        return Response(serializer.data)

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
        # Egyidejűleg Storage bejegyzés létrehozása rfq/{request_number}/ alá
        try:
            from apps.core.models import StorageFolder, StorageFile
            rfq_root, _ = StorageFolder.objects.get_or_create(
                name='rfq', parent=None, defaults={'owner': request.user}
            )
            rfq_folder, _ = StorageFolder.objects.get_or_create(
                name=qr.request_number or str(qr.id),
                parent=rfq_root,
                defaults={'owner': request.user}
            )
            sf = StorageFile(
                name=file_obj.name,
                folder=rfq_folder,
                size=att.file.size if att.file else 0,
                content_type=file_obj.content_type or '',
                owner=request.user,
            )
            sf.file.name = att.file.name  # point to already-saved file
            sf.save()
            att.storage_file_id = sf.id
            att.save(update_fields=['storage_file_id'])
            # Alias-ok létrehozása az összes kapcsolódó megrendelés mappájában
            orders_root, _ = StorageFolder.objects.get_or_create(
                name='orders', parent=None, defaults={'owner': request.user}
            )
            for linked_order in qr.customer_orders.all():
                order_folder, _ = StorageFolder.objects.get_or_create(
                    name=linked_order.order_number,
                    parent=orders_root,
                    defaults={'owner': request.user}
                )
                alias = StorageFile(
                    name=file_obj.name,
                    folder=order_folder,
                    alias_of=sf,
                    size=sf.size,
                    content_type=sf.content_type,
                    owner=request.user,
                )
                alias.file.name = sf.file.name
                alias.save()
        except Exception:
            pass
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
        formulas = request.data.get('formulas') or {}
        
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
            description=description,
            formulas=formulas if isinstance(formulas, dict) else {},
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
        formulas_manu = request.data.get('formulas') or {}
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
            description=description,
            formulas=formulas_manu if isinstance(formulas_manu, dict) else {},
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
        formulas_svc = request.data.get('formulas') or {}
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
            description=description,
            formulas=formulas_svc if isinstance(formulas_svc, dict) else {},
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

        # Substitute variables in signature
        if sig and sig.body_html:
            try:
                user = request.user
                
                # Try to get employee profile
                try:
                    employee = user.employee_profile
                except Exception:
                    employee = None

                user_name = f"{user.last_name} {user.first_name}".strip()
                if not user_name:
                    user_name = user.username
                
                user_email = user.email or ''
                user_position = ''
                user_phonenumber = ''
                
                if employee:
                    user_phonenumber = employee.phone or ''
                    if employee.position:
                        user_position = employee.position.title
                
                sig_ctx = {
                    'user_name': user_name,
                    'user_email': user_email,
                    'user_position': user_position,
                    'user_phonenumber': user_phonenumber
                }
                
                # Use simple replacement instead of format to avoid issues with other curly braces (CSS, JS)
                for key, val in sig_ctx.items():
                    sig.body_html = sig.body_html.replace(f"{{{key}}}", str(val))
                    
            except Exception as e:
                # If substitution fails, keep original signature
                pass

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

        # Determine sender identity
        from_email = cfg.from_email
        from_name = cfg.from_name
        
        # Try to use default company email settings
        try:
            default_company = CoreCompany.objects.filter(is_default=True).first()
            if default_company and default_company.email:
                from_email = default_company.email
                if default_company.name:
                    from_name = default_company.name
        except Exception:
            pass

        # Build MIME message
        msg = MIMEMultipart('alternative') if tpl.is_html else email.message.EmailMessage()
        if isinstance(msg, MIMEMultipart):
            msg['Subject'] = subject
            msg['From'] = f"{from_name} <{from_email}>" if from_name else from_email
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
            msg['From'] = f"{from_name} <{from_email}>" if from_name else from_email
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
                    # Note: server.sendmail FROM address is technically the envelope sender.
                    # Usually it's better to match the From header or use the authenticated user (cfg.from_email)
                    # to avoid SPF/DKIM issues. But user requested to change the sender.
                    # We will use the original cfg.from_email as the envelope sender to be safe with auth,
                    # but the message header will show the Company email.
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
                imap_host = cfg.imap_host
                imap_port = cfg.imap_port
                imap_user = cfg.imap_username
                imap_pwd = cfg.imap_password
                sent_folder = cfg.imap_sent_folder or 'Sent'
                
                M = None
                try:
                    if imap_port == 993:
                        M = imaplib.IMAP4_SSL(imap_host, imap_port)
                    else:
                        M = imaplib.IMAP4(imap_host, imap_port)
                        try:
                            M.starttls(ssl_context=ssl.create_default_context())
                        except Exception:
                            pass
                except Exception:
                    try:
                        M = imaplib.IMAP4_SSL(imap_host)
                    except Exception:
                         M = imaplib.IMAP4(imap_host)
                
                if M:
                    M.login(imap_user, imap_pwd)
                    used_folder = sent_folder
                    ok = False
                    try:
                        typ_chk, _ = M.select(used_folder, readonly=True)
                        ok = (typ_chk == 'OK')
                    except Exception:
                        ok = False
                    
                    if not ok:
                        try:
                            typ_list, boxes = M.list()
                            candidates = []
                            if typ_list == 'OK' and boxes:
                                import re as _re
                                for rawline in boxes:
                                    s = rawline.decode(errors='ignore') if isinstance(rawline, (bytes, bytearray)) else str(rawline)
                                    m_flags = _re.search(r"\(([^)]*)\)", s)
                                    flags_txt = m_flags.group(1) if m_flags else ''
                                    m_q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                                    name = m_q[-1] if m_q else (s.split()[-1] if s.split() else '')
                                    try:
                                        from imaplib import IMAP4
                                        decoded = IMAP4._decode_utf7(name.encode())
                                        if decoded: name = decoded
                                    except Exception:
                                        pass
                                    if name in ('.','', 'NIL'): continue
                                    if 'Noselect' in (flags_txt or '') or '\\Noselect' in (flags_txt or ''): continue
                                    candidates.append({'name': name, 'flags': flags_txt})
                            cand = None
                            for mb in candidates:
                                if '\\Sent' in (mb['flags'] or ''):
                                    cand = mb['name']
                                    break
                            if not cand:
                                common = ['Sent','Sent Items','Sent Mail','Sent Messages','[Gmail]/Sent Mail','Elküldött','Elküldött levelek','Elküldött üzenetek','Küldött elemek']
                                lower = {mb['name'].lower(): mb['name'] for mb in candidates}
                                for cn in common:
                                    if cn.lower() in lower:
                                        cand = lower[cn.lower()]
                                        break
                            if cand:
                                used_folder = cand
                        except Exception:
                            pass
                    
                    flags = '(\\Seen)'
                    date_time = imaplib.Time2Internaldate(timezone.now().timestamp())
                    
                    def _detect_delim(imap):
                        try:
                            typ0, boxes0 = imap.list('', '')
                            if typ0 == 'OK' and boxes0:
                                s = boxes0[0].decode(errors='ignore') if isinstance(boxes0[0], (bytes, bytearray)) else str(boxes0[0])
                                import re as _re
                                q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                                if len(q) >= 2: return q[-2]
                        except Exception: pass
                        return None

                    def _try_create_and_append(imap, mailbox):
                        try:
                            typ_app, _ = imap.append(mailbox, flags, date_time, mime_bytes)
                            if typ_app == 'OK': return True
                        except Exception: pass
                        try:
                            try: imap.create(mailbox)
                            except Exception: pass
                            try: imap.subscribe(mailbox)
                            except Exception: pass
                            typ_app2, _ = imap.append(mailbox, flags, date_time, mime_bytes)
                            return typ_app2 == 'OK'
                        except Exception: return False

                    if not _try_create_and_append(M, used_folder):
                        delim = _detect_delim(M) or '.'
                        variants = []
                        base = used_folder
                        if delim not in (None, '', 'NIL'):
                             variants.extend([f'INBOX{delim}{base}', f'Sent{delim}{base}', f'Inbox{delim}{base}'])
                        for v in variants:
                            if _try_create_and_append(M, v): break
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

        # Substitute variables in signature
        if sig and sig.body_html:
            try:
                user = request.user
                
                # Try to get employee profile
                try:
                    employee = user.employee_profile
                except Exception:
                    employee = None

                user_name = f"{user.last_name} {user.first_name}".strip()
                if not user_name:
                    user_name = user.username
                
                user_email = user.email or ''
                user_position = ''
                user_phonenumber = ''
                
                if employee:
                    user_phonenumber = employee.phone or ''
                    if employee.position:
                        user_position = employee.position.title
                
                sig_ctx = {
                    'user_name': user_name,
                    'user_email': user_email,
                    'user_position': user_position,
                    'user_phonenumber': user_phonenumber
                }
                
                # Use simple replacement instead of format
                for key, val in sig_ctx.items():
                    sig.body_html = sig.body_html.replace(f"{{{key}}}", str(val))
                    
            except Exception as e:
                pass

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
        # Boolean flags
        if 'partial_order_allowed' in data:
            qr.partial_order_allowed = bool(data['partial_order_allowed'])
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
                # New Logic: Try Local ID first, if not found, treat as External ID
                potential_local_ids = []
                other_ids = []
                for cid in contact_ids:
                    if str(cid).isdigit():
                        potential_local_ids.append(int(cid))
                    else:
                        other_ids.append(str(cid))
                
                local_found = list(Contact.objects.filter(id__in=potential_local_ids))
                contacts_to_set = list(local_found)
                found_local_ids = {c.id for c in local_found}
                
                # UUIDs (External IDs) include non-integers AND integers that weren't found locally
                uuid_ids = other_ids + [str(pid) for pid in potential_local_ids if pid not in found_local_ids]
                
                # Process UUIDs
                if uuid_ids:
                    # Find existing by external_id
                    found_uuid_contacts = Contact.objects.filter(external_id__in=uuid_ids)
                    
                    # Auto-heal contacts with empty names (legacy sync bug)
                    for c in found_uuid_contacts:
                        if not c.name:
                            try:
                                from apps.finance.views import PixinvoiceClient
                                client = PixinvoiceClient()
                                pix_company_id = str(company_id) if company_id and not isinstance(company_id, int) and len(str(company_id)) > 10 else None
                                ct_data = client.get_contact(c.external_id, company_id=pix_company_id)
                                
                                first_name = ct_data.get('first_name') or ''
                                last_name = ct_data.get('last_name') or ''
                                full_name = ct_data.get('name') or "Unknown"
                                
                                if not first_name and not last_name and full_name != "Unknown":
                                    parts = full_name.split(' ', 1)
                                    last_name = parts[0]
                                    first_name = parts[1] if len(parts) > 1 else ''
                                
                                c.first_name = first_name
                                c.last_name = last_name
                                c.save()
                            except Exception:
                                pass
                    
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
                                    
                                    first_name = ct_data.get('first_name') or ''
                                    last_name = ct_data.get('last_name') or ''
                                    full_name = ct_data.get('name') or "Unknown"
                                    
                                    if not first_name and not last_name and full_name != "Unknown":
                                        parts = full_name.split(' ', 1)
                                        last_name = parts[0]
                                        first_name = parts[1] if len(parts) > 1 else ''

                                    new_contact = Contact.objects.create(
                                        name=full_name,
                                        first_name=first_name,
                                        last_name=last_name,
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
                # Auto-infer company from contacts when company is not explicitly provided
                if qr.company is None and 'company_id' not in data:
                    for c in contacts_to_set:
                        if c.company:
                            qr.company = c.company
                            qr.save()
                            break
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
        new_number = f"{today_str}{daily_count:02d}"

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

        # copy costs
        from apps.sales.models import QuoteRequestCost
        for cost in src.costs.all():
            try:
                QuoteRequestCost.objects.create(
                    quote_request=dst,
                    material=cost.material,
                    code=cost.code,
                    name=cost.name,
                    quantity=cost.quantity,
                    unit=cost.unit,
                    net_unit_price=cost.net_unit_price,
                    net_total=cost.net_total,
                    supplier=cost.supplier,
                    is_stock=cost.is_stock,
                    currency_code=cost.currency_code,
                )
            except Exception:
                pass

        return Response(QuoteRequestSerializer(dst, context={'request': request}).data, status=201)

    @action(detail=False, methods=['post'])
    def create_demand(self, request):
        """Create an empty demand (RFQ without items), optionally with company/contacts."""
        today = timezone.now().date()
        today_str = today.strftime('%Y%m%d')
        daily_count = QuoteRequest.objects.filter(issue_date=today).count() + 1
        number = f"{today_str}{daily_count:02d}"
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
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Auth required'}, status=401)
        # Bypass OwnDataFilterMixin – invitee may not be the creator
        qr = get_object_or_404(QuoteRequest, pk=pk, is_deleted=False)
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
        if not request.user or not request.user.is_authenticated:
            return Response({'error': 'Auth required'}, status=401)
        # Bypass OwnDataFilterMixin – invitee may not be the creator
        qr = get_object_or_404(QuoteRequest, pk=pk, is_deleted=False)
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

    @action(detail=True, methods=['get'])
    def activity_logs(self, request, pk=None):
        """Get activity logs for this quote request"""
        from apps.core.models import ActivityLog
        from apps.core.serializers import ActivityLogSerializer
        from django.contrib.contenttypes.models import ContentType
        
        qr = self.get_object()
        content_type = ContentType.objects.get_for_model(QuoteRequest)
        logs = ActivityLog.objects.filter(
            content_type=content_type,
            object_id=qr.id
        ).select_related('user').order_by('-timestamp')
        
        serializer = ActivityLogSerializer(logs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def create_quote(self, request, pk=None):
        """Create a Quote from RFQ (demand), preserving company and contacts on RFQ."""
        qr = self.get_object()
        quote_number = f"Q{timezone.now().strftime('%Y%m%d')}{Quote.objects.count() + 1:02d}"
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
        
        # Generate unique order number in Oyyyymmddxx format
        today = timezone.now()
        date_prefix = today.strftime('%Y%m%d')
        prefix = f"O{date_prefix}"
        # Find the highest existing suffix for today to avoid race conditions
        existing = (
            CustomerOrder.objects
            .filter(order_number__startswith=prefix)
            .order_by('-order_number')
            .values_list('order_number', flat=True)
            .first()
        )
        if existing:
            try:
                last_seq = int(existing[len(prefix):])
            except ValueError:
                last_seq = 0
        else:
            last_seq = 0
        order_number = f"{prefix}{last_seq + 1:02d}"
        # Extra safety: keep incrementing if still collides
        while CustomerOrder.objects.filter(order_number=order_number).exists():
            last_seq += 1
            order_number = f"{prefix}{last_seq + 1:02d}"
        
        # Optional deadline from request
        deadline_raw = request.data.get('deadline') or None
        deadline_val = None
        if deadline_raw:
            try:
                from datetime import date
                deadline_val = date.fromisoformat(str(deadline_raw))
            except Exception:
                pass

        # Create CustomerOrder
        order = CustomerOrder.objects.create(
            quote_request=qr,
            order_number=order_number,
            status='new',
            deadline=deadline_val,
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
        # Magyar cégnél a `address` mező sokszor üres — a részletes cím a
        # postal_code/city/street_name/house_number/... mezőkben tárolódik.
        # A frontend külön sorban jeleníti meg az irányítószámot+várost és az
        # utca-házszám sort, ezért itt csak az utca-részt rakjuk össze.
        street_line = qr.company.address or ''
        if not street_line and getattr(qr.company, 'street_name', ''):
            house = getattr(qr.company, 'house_number', '') or getattr(qr.company, 'street_number', '') or ''
            plc = getattr(qr.company, 'public_place_category', '') or getattr(qr.company, 'street_type', '')
            extras = ' '.join(filter(None, [
                getattr(qr.company, 'building', ''),
                getattr(qr.company, 'staircase', ''),
                getattr(qr.company, 'floor', ''),
                getattr(qr.company, 'door', ''),
            ])).strip()
            street_line = f"{qr.company.street_name} {plc}{(' ' + house) if house else ''}".strip()
            if extras:
                street_line = f"{street_line} {extras}".strip()
        customer_data = {
            'name': qr.company.name,
            'tax_number': qr.company.tax_number or '',
            'address': street_line,
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
    else:
        # Ha nincs cég, nézzük a kapcsolatokat (pl. Magánszemély)
        contact = qr.contacts.first()
        if contact:
            try:
                from apps.finance.views import PixinvoiceClient
                client = PixinvoiceClient()
                
                # Resolve tenant_id (logic from crm/views.py)
                tenant_id = getattr(client, 'company_id', None)
                if not tenant_id:
                    try:
                        comps = client.list_companies()
                        if comps:
                             active = next((c for c in comps if c.get('is_active') is True), None)
                             tenant_id = (active or comps[0]).get('id') or (active or comps[0]).get('company_id')
                    except: pass
                
                if tenant_id:
                    # Prefer external_id if present
                    remote_id = contact.external_id or contact.id
                    remote_contact = client.get_contact(remote_id, company_id=tenant_id)
                    if remote_contact:
                         address = remote_contact.get('address') or ''
                         # Ha üres a cím, de megvannak a részletek (magyar cím)
                         if not address and remote_contact.get('postal_code'):
                             st = remote_contact.get('street_name') or ''
                             plc = remote_contact.get('public_place_category') or remote_contact.get('street_type') or ''
                             hn = remote_contact.get('house_number') or remote_contact.get('street_number') or ''
                             address = f"{st} {plc} {hn}".strip()
                         
                         customer_data = {
                            'name': remote_contact.get('name') or f"{remote_contact.get('last_name')} {remote_contact.get('first_name')}".strip(),
                            'tax_number': '', 
                            'address': address,
                            'city': remote_contact.get('city') or '',
                            'postal_code': remote_contact.get('postal_code') or '',
                            'country': remote_contact.get('country') or 'Magyarország',
                         }
            except Exception as e:
                print(f"Error fetching private contact data: {e}")
                
            if not customer_data:
                customer_data = {
                    'name': contact.name,
                    'tax_number': '',
                    'address': '',
                    'city': '', 
                    'postal_code': '',
                    'country': 'Magyarország',
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
        'partial_order_allowed': qr.partial_order_allowed,
        'customer': customer_data,
        'supplier': supplier_data,
        'items': QuoteRequestItemSerializer(qr.items.all(), many=True, context={'request': request}).data,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
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

    # Már megrendelt tételek elutasítása
    already_ordered_ids = list(
        valid_items.filter(customerorderitem__isnull=False)
        .exclude(customerorderitem__customer_order__status='cancelled')
        .values_list('id', flat=True).distinct()
    )
    if already_ordered_ids:
        return Response({'error': f'A következő tételek már meg vannak rendelve: {already_ordered_ids}'}, status=409)
    
    # Megrendelés létrehozása
    from django.db import transaction
    
    # Megrendelésszám generálás
    today = timezone.now().date()
    date_str = today.strftime('%Y%m%d')
    last_order = CustomerOrder.objects.filter(
        order_number__startswith=f'O{date_str}'
    ).order_by('-order_number').first()
    
    if last_order:
        last_seq = int(last_order.order_number[len(f'O{date_str}'):])
        new_seq = last_seq + 1
    else:
        new_seq = 1
    
    order_number = f'O{date_str}{new_seq:02d}'
    
    # Optional desired delivery date from customer
    deadline_raw = request.data.get('desired_date') or None
    deadline_val = None
    if deadline_raw:
        try:
            from datetime import date as _date
            deadline_val = _date.fromisoformat(str(deadline_raw))
        except Exception:
            pass

    order_details = []
    
    try:
        with transaction.atomic():
            # Megrendelés létrehozása
            order = CustomerOrder.objects.create(
                quote_request=qr,
                order_number=order_number,
                status='new',
                notes=request.data.get('notes', ''),
                deadline=deadline_val,
                # created_by None, mivel publikus
            )
            for item_data in items_data:
                item = qr.items.get(id=item_data['item_id'])
                quantity = item_data['quantity']
                
                CustomerOrderItem.objects.create(
                    customer_order=order,
                    quote_item=item,
                    quantity=quantity,
                    unit=item.unit,
                    net_unit_price=item.net_unit_price,
                    vat_rate=item.vat_rate,
                    discount_percent=item.discount_percent,
                    description=item.description
                )
                
                # Tétel megnevezés feloldása típus szerint
                if item.product:
                    item_megnevezes = item.product.name
                elif item.manufacturing_product:
                    item_megnevezes = item.manufacturing_product.name
                elif item.service:
                    item_megnevezes = item.service.name
                elif item.material:
                    item_megnevezes = item.material.name
                elif item.description:
                    item_megnevezes = item.description[:100]
                else:
                    item_megnevezes = 'Tétel'
                line = f"- {item_megnevezes}: {quantity} {item.unit}"
                if item.description and item.description != item_megnevezes:
                    line += f"\n    Leírás: {item.description[:200]}"
                order_details.append(line)
            
            # Státusz frissítés - megrendelve (NEM archív!)
            qr.status = 'ordered'
            qr.save(update_fields=['status'])

        # Email küldés (csak sikeres tranzakció esetén)
        from django.core.mail import get_connection, EmailMultiAlternatives
        from apps.core.models import EmailServerConfig
        
        email_body = f"""Új megrendelés érkezett a publikus megrendelő felületen keresztül.

Ajánlat megnevezése: {qr.title}
Árajánlat száma: {qr.number or qr.request_number}
Megrendelésszám: {order_number}

Megrendelt tételek:
{chr(10).join(order_details)}
{f'{chr(10)}Kért szállítási határidő: {deadline_raw}' if deadline_raw else ''}
{f'{chr(10)}Megjegyzés: {request.data.get("notes", "").strip()}' if request.data.get('notes', '').strip() else ''}
"""
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
                subject=f'Új megrendelés: {order_number} ({qr.number or qr.request_number})',
                body=email_body,
                from_email=from_email,
                to=[recipient],
                connection=connection
            )
            msg.send()
            try:
                from apps.core.email_utils import archive_to_imap_sent
                archive_to_imap_sent(email_config, msg)
            except Exception:
                pass

    except Exception as e:
        # Ha hiba van, logoljuk és error-t dobunk, de a tranzakció rollbackel
        print(f"Hiba a megrendelés létrehozásakor: {e}")
        return Response({'error': 'Hiba történt a megrendelés feldolgozása során.'}, status=500)
    qr.save(update_fields=['status'])
    
    return Response({'success': True, 'message': 'Megrendelés sikeresen rögzítve'})

    @action(detail=True, methods=['post'])
    def create_quote(self, request, pk=None):
        """Ajánlat kérésből ajánlat létrehozása"""
        quote_request = self.get_object()

        quote_number = f"Q{timezone.now().strftime('%Y%m%d')}{Quote.objects.count() + 1:02d}"

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
        order_number = f"O{timezone.now().strftime('%Y%m%d')}{Order.objects.count() + 1:02d}"
        
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
        # Storage bejegyzés létrehozása az RFQ és összes kapcsolódó megrendelés mappájában
        try:
            from apps.core.models import StorageFolder, StorageFile as SF
            qr = item.quote_request
            owner = request.user
            # Részletek megállapítása: tétel neve
            item_label = item.description[:40] if item.description else f'item-{item.id}'

            # 1. Fő bejegyzés az RFQ mappában
            rfq_root, _ = StorageFolder.objects.get_or_create(name='rfq', parent=None, defaults={'owner': owner})
            rfq_folder, _ = StorageFolder.objects.get_or_create(
                name=qr.request_number or str(qr.id), parent=rfq_root, defaults={'owner': owner}
            )
            sf = SF(
                name=file_obj.name,
                folder=rfq_folder,
                size=att.file.size if att.file else 0,
                content_type=file_obj.content_type or '',
                owner=owner,
            )
            sf.file.name = att.file.name
            sf.save()
            att.storage_file_id = sf.id
            att.save(update_fields=['storage_file_id'])

            # 2. Alias-ok minden kapcsolódó megrendelés mappájában
            orders_root, _ = StorageFolder.objects.get_or_create(name='orders', parent=None, defaults={'owner': owner})
            for linked_order in qr.customer_orders.all():
                order_folder, _ = StorageFolder.objects.get_or_create(
                    name=linked_order.order_number, parent=orders_root, defaults={'owner': owner}
                )
                alias = SF(name=file_obj.name, folder=order_folder, alias_of=sf,
                           size=sf.size, content_type=sf.content_type, owner=owner)
                alias.file.name = sf.file.name
                alias.save()
        except Exception:
            pass
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

    @action(detail=True, methods=['post'])
    def delete_attachment(self, request, pk=None):
        item = self.get_object()
        att_id = request.data.get('attachment_id')
        if not att_id:
            return Response({'error': 'attachment_id kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = get_object_or_404(QuoteRequestItemAttachment, id=att_id, quote_item=item)
        att.file.delete(save=False)
        att.delete()
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

    def get_serializer_class(self):
        if self.action == 'list':
            include_items = self.request.query_params.get('include_items') in ('1', 'true', 'True')
            return CustomerOrderListWithItemsSerializer if include_items else CustomerOrderListSerializer
        return CustomerOrderSerializer

    def get_queryset(self):
        qs = super().get_queryset()

        # Status filtering (comma separated or multiple params)
        status_param = self.request.query_params.get('status')
        statuses = []
        if status_param:
            statuses = [s for s in status_param.split(',') if s]

        # Filter for "My Orders" - invited and accepted
        if self.request.query_params.get('my_orders') == 'true':
            qs = qs.filter(
                 Q(quote_request__invitations__invitee=self.request.user, quote_request__invitations__status='accepted') |
                 Q(created_by=self.request.user) |
                 Q(quote_request__assignees=self.request.user)
            ).distinct()

        # Invoice number filtering:
        # - exclude: only orders without invoice number
        # - only: only invoiced orders
        # - include: invoiced orders + (non-invoiced filtered by statuses if statuses are provided)
        invoiced_mode = self.request.query_params.get('invoiced')
        invoice_missing_q = Q(invoice_number__isnull=True) | Q(invoice_number='')

        if invoiced_mode == 'include' and statuses:
            qs = qs.filter((~invoice_missing_q) | (invoice_missing_q & Q(status__in=statuses)))
        else:
            if statuses:
                qs = qs.filter(status__in=statuses)

            if invoiced_mode == 'exclude':
                qs = qs.filter(invoice_missing_q)
            elif invoiced_mode == 'only':
                qs = qs.exclude(invoice_missing_q)

        include_items = self.request.query_params.get('include_items') in ('1', 'true', 'True')
        if include_items:
            item_queryset = CustomerOrderItem.objects.select_related(
                'quote_item',
                'quote_item__product',
                'quote_item__material',
                'quote_item__manufacturing_product',
                'quote_item__service',
            )
        else:
            item_queryset = CustomerOrderItem.objects.only(
                'id', 'customer_order_id', 'quantity', 'net_unit_price', 'vat_rate', 'discount_percent'
            )

        qs = qs.select_related(
            'created_by',
            'quote_request',
            'quote_request__company',
            'quote_request__customer',
            'quote_request__project',
            'quote_request__created_by',
            'quote_request__requested_by',
        ).prefetch_related(
            'quote_request__contacts',
            Prefetch('items', queryset=item_queryset),
            Prefetch(
                'approval_requests',
                queryset=ApprovalRequest.objects.select_related('requester').order_by('-created_at')
            ),
        )
            
        return qs
    
    def retrieve(self, request, *args, **kwargs):
        from django.db.models import Prefetch as _Prefetch
        from apps.manufacturing.models import ManufacturingCostItem
        instance = CustomerOrder.objects.select_related(
            'created_by',
            'quote_request',
            'quote_request__company',
            'quote_request__customer',
            'quote_request__project',
            'quote_request__created_by',
            'quote_request__requested_by',
            'quote_request__currency',
        ).prefetch_related(
            'quote_request__contacts',
            'quote_request__assignees',
            _Prefetch(
                'items',
                queryset=CustomerOrderItem.objects.select_related(
                    'quote_item',
                    'quote_item__product',
                    'quote_item__material',
                    'quote_item__manufacturing_product',
                    'quote_item__service',
                ).prefetch_related(
                    _Prefetch(
                        'quote_item__manufacturing_product__cost_items',
                        queryset=ManufacturingCostItem.objects.all(),
                    )
                )
            ),
            _Prefetch(
                'approval_requests',
                queryset=ApprovalRequest.objects.select_related('requester').order_by('-created_at')
            ),
        ).get(pk=kwargs['pk'])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

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
            last_seq = int(last_order.order_number[len(f'O{date_str}'):])
            new_seq = last_seq + 1
        else:
            new_seq = 1
        
        order_number = f'O{date_str}{new_seq:02d}'
        
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
    def reorder_items(self, request, pk=None):
        """Tételek sorrendjének és szülő-kapcsolatának frissítése.
        Expects a list of {id (CustomerOrderItem id), sort_order, parent_id}."""
        order = self.get_object()
        items_data = request.data
        if not isinstance(items_data, list):
            return Response({"error": "List expected"}, status=status.HTTP_400_BAD_REQUEST)

        valid_coi_ids = set(order.items.values_list('id', flat=True))
        with transaction.atomic():
            for item in items_data:
                coi_id = item.get('id')
                if coi_id not in valid_coi_ids:
                    continue
                sort_order = item.get('sort_order', 0)
                parent_id = item.get('parent_id')
                # parent_id here is a CustomerOrderItem id — resolve to QuoteRequestItem id
                qi_parent_id = None
                if parent_id and parent_id != coi_id:
                    try:
                        parent_coi = CustomerOrderItem.objects.get(id=parent_id, customer_order=order)
                        qi_parent_id = parent_coi.quote_item_id
                    except CustomerOrderItem.DoesNotExist:
                        pass
                # Update the underlying QuoteRequestItem
                try:
                    coi = CustomerOrderItem.objects.get(id=coi_id)
                    QuoteRequestItem.objects.filter(id=coi.quote_item_id).update(
                        sort_order=sort_order,
                        parent_id=qi_parent_id,
                    )
                except CustomerOrderItem.DoesNotExist:
                    pass
        return Response({'status': 'ok'})

    @action(detail=True, methods=['get'])
    def attachments(self, request, pk=None):
        """Megrendelés csatolmányainak listázása (tétel-szintűeket is)."""
        order = self.get_object()
        from .models import CustomerOrderAttachment, QuoteRequestItemAttachment
        from .serializers import CustomerOrderAttachmentSerializer, QuoteRequestItemAttachmentSerializer

        result = []

        # 1. Megrendelés-szintű csatolmányok
        for att in CustomerOrderAttachment.objects.filter(customer_order=order).order_by('-created_at'):
            d = CustomerOrderAttachmentSerializer(att, context={'request': request}).data
            d['_source'] = 'order'
            d['_source_label'] = 'Megrendelés'
            result.append(d)

        # 2. Tétel-szintű csatolmányok (a kötődő QuoteRequestItem-ek révén)
        for oi in order.items.select_related('quote_item').all():
            qi = oi.quote_item
            item_name = oi.description or (qi.description if qi else '') or f'Tétel #{oi.id}'
            item_name = item_name[:50]
            for att in QuoteRequestItemAttachment.objects.filter(quote_item=qi).order_by('-created_at'):
                d = QuoteRequestItemAttachmentSerializer(att, context={'request': request}).data
                d['_source'] = 'item'
                d['_source_label'] = f'Tétel: {item_name}'
                d['original_filename'] = att.file.name.split('/')[-1] if att.file else ''
                d['file_size'] = att.file.size if att.file else 0
                d['order_item_id'] = oi.id
                result.append(d)

            # 3. Altételek (ManufacturingCostItem) csatolmányai, ha vannak
            try:
                from apps.manufacturing.models import ManufacturingCostItem
                for ci in ManufacturingCostItem.objects.filter(quote_request_item=qi):
                    ci_name = ci.description[:40] if ci.description else f'Altétel #{ci.id}'
                    for ci_att in ci.attachments.all():
                        d = {
                            '_source': 'subitem',
                            '_source_label': f'Altétel: {ci_name}',
                            'id': ci_att.id,
                            'original_filename': ci_att.file.name.split('/')[-1] if ci_att.file else '',
                            'file_url': request.build_absolute_uri(ci_att.file.url) if ci_att.file else None,
                            'file_size': ci_att.file.size if ci_att.file else 0,
                            'remark': getattr(ci_att, 'remark', ''),
                            'uploaded_by_name': '',
                            'created_at': str(ci_att.created_at) if hasattr(ci_att, 'created_at') else '',
                        }
                        result.append(d)
            except Exception:
                pass

        return Response(result)

    @attachments.mapping.post
    def upload_attachment(self, request, pk=None):
        """Fájl feltöltése megrendeléshez + Storage bejegyzés létrehozása."""
        order = self.get_object()
        file_obj = request.FILES.get('file')
        remark = request.data.get('remark', '')
        if not file_obj:
            return Response({'error': 'file kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        from .models import CustomerOrderAttachment
        from .serializers import CustomerOrderAttachmentSerializer
        from apps.core.models import StorageFolder, StorageFile

        # 1. Mappa struktúra: orders / {order_number}
        system_user = request.user
        orders_folder, _ = StorageFolder.objects.get_or_create(
            name='orders',
            parent=None,
            defaults={'owner': system_user}
        )
        order_folder, _ = StorageFolder.objects.get_or_create(
            name=order.order_number,
            parent=orders_folder,
            defaults={'owner': system_user}
        )

        # 2. StorageFile létrehozása
        storage_file = StorageFile.objects.create(
            name=file_obj.name,
            folder=order_folder,
            file=file_obj,
            size=file_obj.size,
            content_type=file_obj.content_type or '',
            owner=system_user
        )

        # 2b. Alias az RFQ mappában
        try:
            rfq = order.quote_request
            if rfq:
                rfq_root, _ = StorageFolder.objects.get_or_create(
                    name='rfq', parent=None, defaults={'owner': system_user}
                )
                rfq_folder, _ = StorageFolder.objects.get_or_create(
                    name=rfq.request_number or str(rfq.id),
                    parent=rfq_root,
                    defaults={'owner': system_user}
                )
                alias = StorageFile(
                    name=file_obj.name,
                    folder=rfq_folder,
                    alias_of=storage_file,
                    size=file_obj.size,
                    content_type=file_obj.content_type or '',
                    owner=system_user,
                )
                alias.file.name = storage_file.file.name
                alias.save()
        except Exception:
            pass

        # 3. CustomerOrderAttachment létrehozása
        att = CustomerOrderAttachment.objects.create(
            customer_order=order,
            file=storage_file.file,
            original_filename=file_obj.name,
            remark=remark,
            storage_file_id=storage_file.id,
            uploaded_by=request.user if request.user.is_authenticated else None
        )
        return Response(CustomerOrderAttachmentSerializer(att, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='attachments/(?P<att_id>[0-9]+)')
    def delete_attachment(self, request, pk=None, att_id=None):
        """Csatolmány törlése (attachment + storage fájl is)."""
        order = self.get_object()
        from .models import CustomerOrderAttachment
        from apps.core.models import StorageFile
        att = get_object_or_404(CustomerOrderAttachment, id=att_id, customer_order=order)
        # Remove associated storage file
        if att.storage_file_id:
            try:
                sf = StorageFile.objects.get(id=att.storage_file_id)
                sf.delete()  # physical file removed in StorageFile.delete()
            except StorageFile.DoesNotExist:
                pass
        att.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['patch'], url_path='attachments/(?P<att_id>[0-9]+)/remark')
    def update_attachment_remark(self, request, pk=None, att_id=None):
        """Csatolmány megjegyzésének utólagos módosítása."""
        order = self.get_object()
        from .models import CustomerOrderAttachment
        from .serializers import CustomerOrderAttachmentSerializer
        att = get_object_or_404(CustomerOrderAttachment, id=att_id, customer_order=order)
        att.remark = request.data.get('remark', '')
        att.save(update_fields=['remark'])
        return Response(CustomerOrderAttachmentSerializer(att, context={'request': request}).data)

    def _prepare_confirmation_email_content(self, order, template_key='order_confirmation', signature_key=None, extra_context=None):
        if extra_context is None: extra_context = {}
        cfg = EmailServerConfig.objects.filter(is_active=True).first()
        if not cfg: return None

        # Determine Recipient
        to_email = None
        if order.quote_request and order.quote_request.contacts.exists():
            contact = order.quote_request.contacts.first()
            if contact and contact.email: to_email = contact.email
        if not to_email and order.quote_request and order.quote_request.customer:
            to_email = order.quote_request.customer.email
            
        # Determine Sender
        from_email = cfg.from_email
        from_name = cfg.from_name
        try:
            default_company = CoreCompany.objects.filter(is_default=True).first()
            if default_company:
                 if default_company.email: from_email = default_company.email
                 if default_company.name: from_name = default_company.name
        except: pass

        # Load Templates
        tpl = EmailTemplate.objects.filter(key=template_key).first()
        sig = SignatureTemplate.objects.filter(key=signature_key).first() if signature_key else None

        # Signature Context
        if sig and sig.body_html:
            try:
                user = self.request.user if hasattr(self, 'request') and self.request and self.request.user else None
                if user:
                    user_name = f"{user.last_name} {user.first_name}".strip() or user.username
                    sig_ctx = {'user_name': user_name, 'user_email': user.email or ''}
                    for key, val in sig_ctx.items():
                        sig.body_html = sig.body_html.replace(f"{{{key}}}", str(val))
            except: pass

        # Order Context
        customer_name = 'Ügyfelünk'
        contact_name = 'Ügyfelünk'
        
        if order.quote_request:
            if order.quote_request.company:
                customer_name = order.quote_request.company.name
            elif order.quote_request.customer:
                customer_name = order.quote_request.customer.name
                
            if order.quote_request.contacts.exists():
                contact_names = [c.name for c in order.quote_request.contacts.all()]
                contact_name = ", ".join(contact_names)
            else:
                contact_name = customer_name
        
        context = {
            'order_number': order.order_number,
            'order_date': str(order.order_date),
            'company_name': from_name,
            'customer_name': customer_name,
            'contact_name': contact_name,
            **extra_context
        }

        # Subject & Body
        subject = f"Megrendelés visszaigazolás - {order.order_number}"
        body = ""
        is_html = False

        if tpl:
            is_html = tpl.is_html
            if tpl.subject_template:
                try: subject = tpl.subject_template.format(**context)
                except: pass
            
            body_core = ""
            if tpl.body_template:
                try: body_core = tpl.body_template.format(**context)
                except: body_core = tpl.body_template
            
            body = f"{body_core}{sig.body_html if sig else ''}" if is_html else f"{body_core}\n\n{sig.body_html if sig else ''}"
        else:
            # Fallback
            is_html = True
            body = f"""<p>Tisztelt {context['contact_name']}!</p>
<p>Megrendelését köszönettel megkaptuk és ezúton visszaigazoljuk.</p>
<p><strong>Megrendelés száma:</strong> {order.order_number}<br>
<strong>Dátum:</strong> {order.order_date}</p>
<p>Amennyiben kérdése van, forduljon hozzánk bizalommal.</p>
<p>Üdvözlettel,<br>
{from_name}</p>
"""

        return {
            'subject': subject,
            'body': body,
            'to_email': to_email,
            'from_name': from_name,
            'from_email': from_email,
            'smtp_config': cfg,
            'is_html': is_html
        }

    @action(detail=False, methods=['get'])
    def manufacturing_items(self, request):
        """Return all CustomerOrderItems with item_type='manufacturing', with order and product info."""
        from .models import CustomerOrderItem
        qs = CustomerOrderItem.objects.select_related(
            'customer_order',
            'customer_order__quote_request',
            'customer_order__quote_request__company',
            'customer_order__quote_request__customer',
            'quote_item',
            'quote_item__manufacturing_product',
        ).filter(
            quote_item__item_type='manufacturing',
            quote_item__manufacturing_product__isnull=False,
        ).annotate(_att_count=Count('quote_item__attachments')).order_by('-customer_order__order_date')

        # Optional status filter
        statuses = request.query_params.get('status')
        if statuses:
            qs = qs.filter(status__in=statuses.split(','))

        # Optional manufacturing_product_id filter
        mp_id = request.query_params.get('manufacturing_product_id')
        if mp_id:
            qs = qs.filter(quote_item__manufacturing_product_id=mp_id)

        import re
        from html import unescape

        def strip_html(text):
            if not text:
                return ''
            # Replace <br>, </p>, </div> with newlines for readability
            t = re.sub(r'<\s*br\s*/?\s*>', '\n', text, flags=re.IGNORECASE)
            t = re.sub(r'</\s*(p|div|li|tr)\s*>', '\n', t, flags=re.IGNORECASE)
            # Strip remaining tags
            t = re.sub(r'<[^>]+>', '', t)
            t = unescape(t)
            # Collapse 3+ newlines to 2, trim
            t = re.sub(r'\n{3,}', '\n\n', t).strip()
            return t

        def resolve_customer_name(qr):
            if not qr:
                return ''
            if qr.company:
                return qr.company.name or ''
            if qr.customer:
                return qr.customer.name or ''
            try:
                first_contact = qr.contacts.first()
                if first_contact:
                    if getattr(first_contact, 'company', None):
                        return first_contact.company.name or ''
                    # Magánszemély: nincs cég → a kapcsolattartó neve
                    return getattr(first_contact, 'name', '') or ''
            except Exception:
                pass
            return ''

        data = []
        for item in qs:
            mp = item.quote_item.manufacturing_product
            order = item.customer_order
            qr = order.quote_request
            data.append({
                'id': item.id,
                'quote_item_id': item.quote_item_id,
                'order_id': order.id,
                'order_number': order.order_number,
                'order_date': order.order_date.isoformat() if order.order_date else None,
                'order_status': order.status,
                'status': item.status,
                'customer_name': resolve_customer_name(qr),
                'manufacturing_product_id': mp.id,
                'name': mp.name,
                'code': mp.code or '',
                'description': strip_html(item.description or mp.description or ''),
                'internal_description': strip_html(mp.internal_description or ''),
                'remark': item.remark or '',
                'quantity': float(item.quantity),
                'unit': item.unit,
                'net_unit_price': float(item.net_unit_price),
                'attachment_count': getattr(item, '_att_count', 0),
            })
        return Response(data)

    @action(detail=True, methods=['post'])
    def render_confirmation_email(self, request, pk=None):
        order = self.get_object()
        template_key = request.data.get('template_key', 'order_confirmation')
        signature_key = request.data.get('signature_key')
        extra_context = request.data.get('context', {})
        
        content = self._prepare_confirmation_email_content(order, template_key, signature_key, extra_context)
        if not content:
            return Response({'error': 'Nincs email beállítás vagy címzett'}, status=400)
        
        return Response({
            'subject': content['subject'],
            'body': content['body'],
            'to': content['to_email'],
            'from': f"{content['from_name']} <{content['from_email']}>",
            'is_html': content['is_html']
        })

    @action(detail=True, methods=['post'])
    def send_confirmation_email_manual(self, request, pk=None):
        order = self.get_object()
        to_email = request.data.get('to')
        subject = request.data.get('subject')
        body = request.data.get('body')
        
        if not to_email:
             return Response({'error': 'Címzett hiányzik'}, status=400)

        cfg = EmailServerConfig.objects.filter(is_active=True).first()
        if not cfg:
             return Response({'error': 'Email szerver nincs beállítva'}, status=400)

        try:
            from_email = cfg.from_email
            from_name = cfg.from_name
            try:
                default_company = CoreCompany.objects.filter(is_default=True).first()
                if default_company:
                    if default_company.email: from_email = default_company.email
                    if default_company.name: from_name = default_company.name
            except: pass

            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{from_name} <{from_email}>" if from_name else from_email
            msg['To'] = to_email
            
            # If body looks like HTML (contains <br> or <p>), send as HTML, else plain
            # Or just send as plain if frontend editor produces plain text?
            # ReactQuill produces HTML.
            msg.attach(MIMEText(body, 'html', 'utf-8'))
            
            mime_bytes = msg.as_bytes()
            recipients = [to_email]

            if cfg.smtp_use_ssl:
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                with smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, context=context) as server:
                    if cfg.smtp_username: server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.from_email, recipients, mime_bytes)
            else:
                 with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port) as server:
                    server.ehlo()
                    if cfg.smtp_use_tls: 
                        context = ssl.create_default_context()
                        context.check_hostname = False
                        context.verify_mode = ssl.CERT_NONE
                        server.starttls(context=context)
                    if cfg.smtp_username: server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.from_email, recipients, mime_bytes)
            
            # Append to Sent (IMAP) logic skipped for brevity/duplication reduce, but ideally should be there.
            
            return Response({'status': 'sent'})
        except Exception as e:
            print(f"Error sending manual email: {e}")
            return Response({'error': str(e)}, status=500)

    def _send_confirmation_email(self, order):
        try:
            content = self._prepare_confirmation_email_content(order)
            if not content: return
            
            cfg = content['smtp_config']
            msg = MIMEMultipart('alternative')
            msg['Subject'] = content['subject']
            msg['From'] = f"{content['from_name']} <{content['from_email']}>" if content['from_name'] else content['from_email']
            msg['To'] = content['to_email']
            msg.attach(MIMEText(content['body'], 'plain', 'utf-8'))
            
            mime_bytes = msg.as_bytes()
            recipients = [content['to_email']]

            # Send SMTP
            if cfg.smtp_use_ssl:
                context = ssl.create_default_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE
                with smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, context=context) as server:
                    if cfg.smtp_username: server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.from_email, recipients, mime_bytes)
            else:
                 with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port) as server:
                    server.ehlo()
                    if cfg.smtp_use_tls: 
                        context = ssl.create_default_context()
                        context.check_hostname = False
                        context.verify_mode = ssl.CERT_NONE
                        server.starttls(context=context)
                    if cfg.smtp_username: server.login(cfg.smtp_username, cfg.smtp_password)
                    server.sendmail(cfg.from_email, recipients, mime_bytes)

            # Append to Sent (IMAP)
            try:
                if cfg.imap_host and cfg.imap_username:
                    sent_folder = cfg.imap_sent_folder or 'Sent'
                    M = None
                    try:
                        if cfg.imap_port == 993: M = imaplib.IMAP4_SSL(cfg.imap_host, cfg.imap_port)
                        else: M = imaplib.IMAP4(cfg.imap_host, cfg.imap_port)
                    except:
                        M = imaplib.IMAP4_SSL(cfg.imap_host)
                    
                    if M:
                        M.login(cfg.imap_username, cfg.imap_password)
                        M.append(sent_folder, '\\Seen', imaplib.Time2Internaldate(datetime.datetime.now()), mime_bytes)
                        M.logout()
            except Exception as e:
                print(f"IMAP Error: {e}")

        except Exception as e:
            print(f"Email Sending Error: {e}")



    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Általános státusz váltás workflow-val"""
        order = self.get_object()
        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': 'Státusz kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        if not _user_can_request_customer_order_status_change(request.user, order):
            return Response({'error': 'Nincs jogosultságod státuszt váltani ezen a megrendelésen.'}, status=status.HTTP_403_FORBIDDEN)

        if _user_can_approve_customer_orders(request.user):
            _apply_customer_order_status(order, new_status)
            if new_status == 'confirmed' and request.data.get('send_email') is True:
                self._send_confirmation_email(order)
            return Response(self.get_serializer(order).data)

        _, approval_response = _request_customer_order_status_approval(order, request.user, new_status)
        return approval_response

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        """Megrendelés megerősítése"""
        order = self.get_object()
        if order.status != 'new':
            return Response({'error': 'Csak új megrendelés erősíthető meg'}, status=status.HTTP_400_BAD_REQUEST)

        if not _user_can_request_customer_order_status_change(request.user, order):
            return Response({'error': 'Nincs jogosultságod státuszt váltani ezen a megrendelésen.'}, status=status.HTTP_403_FORBIDDEN)

        if not _user_can_approve_customer_orders(request.user):
            _, approval_response = _request_customer_order_status_approval(order, request.user, 'confirmed')
            return approval_response

        _apply_customer_order_status(order, 'confirmed')
        return Response(self.get_serializer(order).data)
    
    @action(detail=True, methods=['post'])
    def start_production(self, request, pk=None):
        """Gyártás indítása"""
        order = self.get_object()
        if order.status != 'confirmed':
            return Response({'error': 'Csak megerősített megrendelés indítható gyártásba'}, status=status.HTTP_400_BAD_REQUEST)

        if not _user_can_request_customer_order_status_change(request.user, order):
            return Response({'error': 'Nincs jogosultságod státuszt váltani ezen a megrendelésen.'}, status=status.HTTP_403_FORBIDDEN)

        if not _user_can_approve_customer_orders(request.user):
            _, approval_response = _request_customer_order_status_approval(order, request.user, 'in_production')
            return approval_response

        _apply_customer_order_status(order, 'in_production')
        return Response(self.get_serializer(order).data)
    
    @action(detail=True, methods=['post'])
    def mark_ready(self, request, pk=None):
        """Gyártás befejezése - timestamp szerkeszthető"""
        order = self.get_object()
        if order.status != 'in_production':
            return Response({'error': 'Csak gyártásban lévő megrendelés jelölhető késznek'}, status=status.HTTP_400_BAD_REQUEST)

        if not _user_can_request_customer_order_status_change(request.user, order):
            return Response({'error': 'Nincs jogosultságod státuszt váltani ezen a megrendelésen.'}, status=status.HTTP_403_FORBIDDEN)

        if not _user_can_approve_customer_orders(request.user):
            _, approval_response = _request_customer_order_status_approval(order, request.user, 'ready')
            return approval_response
        
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

        _apply_customer_order_status(order, 'ready', changed_at=ready_at)
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

        if not _user_can_request_customer_order_status_change(request.user, order):
            return Response({'error': 'Nincs jogosultságod státuszt váltani ezen a megrendelésen.'}, status=status.HTTP_403_FORBIDDEN)

        if order.status == 'ready' and not _user_can_approve_customer_orders(request.user):
            _, approval_response = _request_customer_order_status_approval(order, request.user, 'in_delivery')
            return approval_response
        
        # Ha még nincs token vagy lejárt, generálunk újat
        regenerate_token = False
        if not order.public_delivery_token:
            regenerate_token = True
        elif order.public_delivery_expires_at and timezone.now() > order.public_delivery_expires_at:
            regenerate_token = True
        
        if regenerate_token:
            order.public_delivery_token = secrets.token_hex(20)
            order.public_delivery_expires_at = timezone.now() + timedelta(days=30)
        
        # Generate delivery note number if not exists
        if not order.delivery_note_number:
            today_str = timezone.now().strftime('%Y%m%d')
            # Check DeliveryNote table for correct sequence
            last_dn = DeliveryNote.objects.filter(
                delivery_note_number__startswith=f"DN{today_str}"
            ).order_by('-delivery_note_number').first()
            
            # Also check CustomerOrder table to avoid collision if DN is not yet created there
            last_order = CustomerOrder.objects.filter(
                delivery_note_number__startswith=f"DN{today_str}"
            ).order_by('-delivery_note_number').first()
            
            seq = 0
            if last_dn:
                try: seq = max(seq, int(last_dn.delivery_note_number[-4:]))
                except: pass
            if last_order:
                try: seq = max(seq, int(last_order.delivery_note_number[-4:]))
                except: pass
                
            new_seq = seq + 1
            order.delivery_note_number = f"DN{today_str}{new_seq:04d}"

        # Csak akkor váltunk in_delivery státuszra, ha még ready-ben van
        if order.status == 'ready':
            order.status = 'in_delivery'
            order.delivery_started_at = timezone.now()
        
        # Show prices parameter from request (default: True)
        show_prices = request.data.get('show_prices', True)
        order.show_prices = show_prices
        
        order.save()
        
        # Build public delivery URL
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', 'https://e.pixisys.eu')
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
                    try:
                        from apps.core.email_utils import archive_to_imap_sent
                        archive_to_imap_sent(email_config, msg)
                    except Exception:
                        pass
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

        if not _user_can_request_customer_order_status_change(request.user, order):
            return Response({'error': 'Nincs jogosultságod státuszt váltani ezen a megrendelésen.'}, status=status.HTTP_403_FORBIDDEN)

        if not _user_can_approve_customer_orders(request.user):
            _, approval_response = _request_customer_order_status_approval(order, request.user, 'delivered')
            return approval_response
        
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

        _apply_customer_order_status(order, 'delivered', changed_at=delivered_at)
        return Response(self.get_serializer(order).data)
    
    @action(detail=True, methods=['get'])
    def detailed_items(self, request, pk=None):
        """
        Return all items related to this CustomerOrder via its QuoteRequest,
        resolving hierarchy and supplier/department info.
        """
        order = self.get_object()
        rfq = order.quote_request
        if not rfq:
            return Response([])

        # Pre-fetch CustomerOrderItems for status and real quantity
        order_items_map = {
            oi.quote_item_id: oi 
            for oi in order.items.all()
        }

        items = rfq.items.select_related(
            'material', 'material__default_supplier', 
            'service', 'service__default_supplier', 'service__internal_production_department',
            'product', 'manufacturing_product',
            'parent'
        ).all().order_by('sort_order', 'id')
        
        result = []
        for item in items:
            name = ""
            code = ""
            supplier_name = None
            department_name = None
            is_internal = False
            manufacturing_product_id = None
            
            # Resolve Name/Code/Supplier
            if item.product:
                name = item.product.name
                code = item.product.code if hasattr(item.product, 'code') else ''
                # Product usually doesn't have default supplier in this model setup? 
                # Assuming product is finished good.
            elif item.material:
                name = item.material.name
                code = item.material.code
                if item.material.default_supplier:
                    supplier_name = item.material.default_supplier.name
            elif item.manufacturing_product:
                name = item.manufacturing_product.name
                code = item.manufacturing_product.code or ''
                # Manufacturing product usually internal
                is_internal = True
                # Try to get internal department if capable
                if hasattr(item.manufacturing_product, 'internal_production_department') and item.manufacturing_product.internal_production_department:
                     department_name = item.manufacturing_product.internal_production_department.name
                manufacturing_product_id = item.manufacturing_product.id
            elif item.service:
                name = item.service.name
                code = item.service.code
                if item.service.is_internal_production:
                    is_internal = True
                    if item.service.internal_production_department:
                        department_name = item.service.internal_production_department.name
                elif item.service.default_supplier:
                    supplier_name = item.service.default_supplier.name

            # Match with CustomerOrderItem
            order_item = order_items_map.get(item.id)
            current_status = order_item.status if order_item else 'new'
            real_quantity = float(order_item.quantity) if order_item else (float(item.quantity) if item.quantity else 0)
            order_item_id = order_item.id if order_item else None

            # Manual override if description was used as name or similar? 
            # item.description often holds custom text.
            
            result.append({
                'id': item.id,
                'parent_id': item.parent_id,
                'sort_order': item.sort_order,
                'name': name,
                'code': code,
                'description': item.description,
                'quantity': real_quantity,
                'unit': item.unit,
                'net_unit_price': float(item.net_unit_price) if item.net_unit_price else 0,
                'net_total': float(item.net_total) if item.net_total else 0,
                'supplier_name': supplier_name,
                'department_name': department_name,
                'is_internal': is_internal,
                'item_type': item.item_type,
                'status': current_status,
                'order_item_id': order_item_id,
                'manufacturing_product_id': manufacturing_product_id,
            })
            
        return Response(result)

    @action(detail=True, methods=['get'])
    def item_work_sheet(self, request, pk=None):
        """Generate a split worksheet for a specific QuoteRequestItem (via order)"""
        import uuid
        from django.http import HttpResponse
        try:
            from io import BytesIO
            import qrcode
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.units import cm
            from reportlab.lib.utils import ImageReader
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
        except ImportError:
            return Response({'error': 'ReportLab not installed'}, status=500)
        
        order = self.get_object()
        item_id = request.query_params.get('item_id')
        if not item_id:
            return Response({'error': 'item_id required'}, status=400)
            
        try:
            item = QuoteRequestItem.objects.get(id=item_id, quote_request=order.quote_request)
        except QuoteRequestItem.DoesNotExist:
             return Response({'error': 'Item not found'}, status=404)

        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        
        # Font setup
        try:
            pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
            pdfmetrics.registerFont(TTFont('DejaVu-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
            font_normal = 'DejaVu'
            font_bold = 'DejaVu-Bold'
        except:
            font_normal = 'Helvetica'
            font_bold = 'Helvetica-Bold'

        # Helper: Get Item Info
        item_name = ""
        item_code = "-"
        internal_desc = ""
        product_desc = ""
        
        if item.product: 
            item_name = item.product.name
            if hasattr(item.product, 'code'): item_code = item.product.code
            elif hasattr(item.product, 'article_number'): item_code = item.product.article_number
            if hasattr(item.product, 'internal_description'): internal_desc = item.product.internal_description
            if hasattr(item.product, 'description'): product_desc = item.product.description
        elif item.material: 
            item_name = item.material.name
            if hasattr(item.material, 'code'): item_code = item.material.code
            if hasattr(item.material, 'description'): product_desc = item.material.description
        elif item.manufacturing_product: 
            item_name = item.manufacturing_product.name
            if hasattr(item.manufacturing_product, 'code'): item_code = item.manufacturing_product.code
            if hasattr(item.manufacturing_product, 'internal_description'): internal_desc = item.manufacturing_product.internal_description
            if hasattr(item.manufacturing_product, 'description'): product_desc = item.manufacturing_product.description
        elif item.service: 
            item_name = item.service.name
            if hasattr(item.service, 'code'): item_code = item.service.code
            if hasattr(item.service, 'internal_description'): internal_desc = item.service.internal_description
            if hasattr(item.service, 'description'): product_desc = item.service.description

        # Helper: Get Customer Info
        customer_name = "-"
        if order.quote_request.company: customer_name = order.quote_request.company.name
        elif order.quote_request.customer: customer_name = order.quote_request.customer.name
        
        contact_name = ""
        try:
            contact = order.quote_request.contacts.first()
            if contact: contact_name = contact.name
        except: pass
        
        project_name = "-"
        if order.quote_request.project: project_name = order.quote_request.project.name
        
        deadline = "-"
        if order.quote_request.deadline:
             deadline = order.quote_request.deadline.strftime('%Y.%m.%d')

        # Generate QR Code
        base_url = getattr(settings, 'FRONTEND_BASE_URL', 'https://e.pixisys.eu').rstrip('/')
        target_url = f"{base_url}/manufacturing/queue?order={order.id}"
        qr = qrcode.QRCode(version=1, box_size=10, border=2)
        qr.add_data(target_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        qr_io = BytesIO()
        img.save(qr_io, format='PNG')
        qr_io.seek(0)
        qr_image = ImageReader(qr_io)
        
        def draw_section(start_y, is_bottom=False):
            y = start_y
            import textwrap
            
            # Header Row
            p.setFont(font_bold, 12) # Reduced from 14
            p.drawString(2*cm, y, f"Megrendelésszám: {order.order_number}")
            
            # QR Code (Top Right) – fix méret + balról védőtávolság
            qr_size = 3*cm
            qr_x = width - 2*cm - qr_size  # = width - 5cm
            qr_y_top = y - 0.2*cm           # kicsit feljebb hogy a szövegtömb tényleg ne lógjon rá
            p.drawImage(qr_image, qr_x, qr_y_top - qr_size + 0.4*cm, width=qr_size, height=qr_size)
            # Bal-szöveg jobb határa: QR előtt 0.5cm-rel
            text_right_limit = qr_x - 0.5*cm
            y -= 1.0*cm # Reduced spacing
            
            p.setFont(font_normal, 10) # Reduced from 12
            
            # Additional Field for Bottom: Deadline
            if is_bottom:
                p.drawString(2*cm, y, f"Határidő: {deadline}")
                y -= 0.5*cm # Reduced spacing
            
            # Customer - Wrapped to 2 lines, smaller font, wider area
            p.setFont(font_bold, 10) # Reduced from 12
            p.drawString(2*cm, y, f"Megrendelő:")
            
            cust_str = f"{customer_name} - {contact_name}".strip(' -')
            
            font_size_cust = 9 # Reduced from 10
            p.setFont(font_normal, font_size_cust)

            # Pixel-pontos tördelés szóhatárokon, hogy semmiképp ne lógjon a QR alá.
            from reportlab.pdfbase.pdfmetrics import stringWidth
            cust_x = 5.5*cm
            max_text_w = max(2*cm, text_right_limit - cust_x)

            def _wrap_to_width(text, font_name, font_size, max_w):
                words = (text or '').split()
                lines = []
                cur = ''
                for w in words:
                    cand = (cur + ' ' + w).strip()
                    if stringWidth(cand, font_name, font_size) <= max_w:
                        cur = cand
                    else:
                        if cur:
                            lines.append(cur)
                        # ha egyetlen szó is hosszabb mint max_w → vágjuk karakterre
                        if stringWidth(w, font_name, font_size) > max_w:
                            buf = ''
                            for ch in w:
                                if stringWidth(buf + ch, font_name, font_size) <= max_w:
                                    buf += ch
                                else:
                                    if buf:
                                        lines.append(buf)
                                    buf = ch
                            cur = buf
                        else:
                            cur = w
                if cur:
                    lines.append(cur)
                return lines or ['']

            cust_lines = _wrap_to_width(cust_str, font_normal, font_size_cust, max_text_w)
            text_object = p.beginText(cust_x, y)
            text_object.setFont(font_normal, font_size_cust)
            for line in cust_lines[:3]:
                text_object.textLine(line)
            p.drawText(text_object)
            
            # Reduced spacing
            y -= (len(cust_lines[:3]) * 0.4 * cm) + 0.3*cm 
            
            # Project
            if project_name and project_name != "-":
                p.setFont(font_bold, 10)
                p.drawString(2*cm, y, f"Projekt:")
                p.setFont(font_normal, 10)
                p.drawString(5.5*cm, y, f"{project_name}")
                y -= 0.5*cm

            # Product
            p.setFont(font_bold, 10)
            p.drawString(2*cm, y, f"Termék:")
            p.setFont(font_normal, 10)
            p.drawString(5.5*cm, y, f"{item_code} - {item_name}")
            y -= 0.5*cm
            
            # Quantity
            p.setFont(font_bold, 10)
            p.drawString(2*cm, y, f"Mennyiség:")
            p.setFont(font_normal, 10)
            qty_str = f"{float(item.quantity):g}"
            if item.unit:
                qty_str += f" {item.unit}"
            p.drawString(5.5*cm, y, qty_str)
            y -= 0.5*cm
            
            # 1. Product Description (Leírás)
            if product_desc:
                p.setFont(font_bold, 10)
                p.drawString(2*cm, y, f"Leírás:")
                y -= 0.3*cm
                p.setFont(font_normal, 9)
                text_object = p.beginText(2*cm, y)
                text_object.setFont(font_normal, 9)
                text_object.setLeading(10) # tighter lines
                lines_pd = textwrap.wrap(product_desc, width=95) 
                for line in lines_pd[:3]: 
                    text_object.textLine(line)
                p.drawText(text_object)
                y -= (len(lines_pd[:3]) * 0.4 * cm) + 0.3*cm

            # 2. Internal Description (Belső leírás)
            if is_bottom and internal_desc:
                p.setFont(font_bold, 10)
                p.drawString(2*cm, y, f"Belső leírás:")
                y -= 0.3*cm
                p.setFont(font_normal, 9)
                text_object = p.beginText(2*cm, y)
                text_object.setFont(font_normal, 9)
                text_object.setLeading(10)
                lines_id = textwrap.wrap(internal_desc, width=95) 
                for line in lines_id[:3]: 
                    text_object.textLine(line)
                p.drawText(text_object)
                y -= (len(lines_id[:3]) * 0.4 * cm) + 0.3*cm

            # 3. Note (Megjegyzés)
            desc_text = item.description or "-"
            if desc_text and desc_text != "-": 
                 p.setFont(font_bold, 10)
                 p.drawString(2*cm, y, f"Megjegyzés:")
                 y -= 0.3*cm
                 p.setFont(font_normal, 9)
                 
                 text_object = p.beginText(2*cm, y)
                 text_object.setFont(font_normal, 9)
                 text_object.setLeading(10)
                 lines = textwrap.wrap(desc_text, width=95) 
                 for line in lines[:5]: 
                     text_object.textLine(line)
                 p.drawText(text_object)
                 
                 y -= (len(lines[:5]) * 0.4 * cm) + 0.3*cm

        # Draw Top Section (Top 1/3 ~ 9.9cm)
        # Height A4 = 29.7cm
        # Split line around 10cm from top? 
        # User said: "Upper part occupies top 1/3" -> Lower part occupies bottom 2/3.
        # Implies split line is at H - (H/3).
        
        split_y = height * (2/3) # 2/3 from bottom = 1/3 from top
        
        draw_section(height - 2*cm, is_bottom=False)
        
        # Separator Line
        p.setDash(6, 3)
        p.line(1*cm, split_y, width-1*cm, split_y)
        p.setDash([], 0)
        
        # Draw Bottom Section
        # Start slightly below split line
        draw_section(split_y - 2*cm, is_bottom=True)
        
        p.showPage()
        p.save()
        buffer.seek(0)
        
        return HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="munkalap_item_{item.id}.pdf"'
        return response

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
        base_url = getattr(settings, 'FRONTEND_BASE_URL', 'https://e.pixisys.eu').rstrip('/')
        target_url = f"{base_url}/manufacturing/queue?order={order.id}"
        
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
            """Draw one section of the worksheet.

            When `include_internal_desc=True` (the internal/factory half of
            the page) we also draw a checkbox next to every item so the
            operator can tick off completed lines."""
            with_checkboxes = include_internal_desc
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

            # Helper: wrap long text into multiple lines, returns new y
            def draw_wrapped(label, text, font_size=10, line_height=0.55*cm):
                avail_w = width - 4*cm  # 2cm left + 2cm right margin
                full = f"{label}{text}"
                p.setFont(font_name, font_size)
                words = full.split()
                lines = []
                current = ''
                for word in words:
                    test = f"{current} {word}".strip()
                    if p.stringWidth(test, font_name, font_size) <= avail_w:
                        current = test
                    else:
                        if current:
                            lines.append(current)
                        current = word
                if current:
                    lines.append(current)
                cur_y = y
                for line in lines:
                    p.drawString(2*cm, cur_y, line)
                    cur_y -= line_height
                return cur_y

            # Description
            desc_text = rfq.description if rfq and rfq.description else ''
            if desc_text:
                y = draw_wrapped("Leírás: ", desc_text)

            # Internal description (only in second section)
            if include_internal_desc:
                int_desc = rfq.internal_description if rfq and rfq.internal_description else ''
                if int_desc:
                    y = draw_wrapped("Belső leírás: ", int_desc)
            
            # Items
            y -= 0.4*cm
            p.setFont(font_name, 9)
            for item in order.items.all():
                quote_item = item.quote_item
                
                # Get item details
                item_name = ''
                item_code = ''
                item_description = ''
                
                # Base description from entities
                entity_desc = ''
                
                if quote_item.product:
                    item_name = quote_item.product.name
                    item_code = quote_item.product.code
                    entity_desc = quote_item.product.description or ''
                elif quote_item.material:
                    item_name = quote_item.material.name
                    item_code = quote_item.material.code
                    entity_desc = quote_item.material.description or ''
                elif quote_item.manufacturing_product:
                    item_name = quote_item.manufacturing_product.name
                    item_code = quote_item.manufacturing_product.code or ''
                    entity_desc = quote_item.manufacturing_product.description or ''
                elif quote_item.service:
                    item_name = quote_item.service.name
                    item_code = quote_item.service.code or ''
                    entity_desc = quote_item.service.description or ''
                
                # Use specific description (comment) if available
                # Prefer OrderItem description, then QuoteItem description, then Entity description
                item_description = item.description or quote_item.description or entity_desc
                
                # Checkbox (internal half only): empty square left of the
                # first item line, with the rest of the item indented.
                if with_checkboxes:
                    box_size = 0.4*cm
                    box_y = y - box_size + 0.05*cm
                    p.setLineWidth(0.8)
                    p.rect(2*cm, box_y, box_size, box_size, stroke=1, fill=0)
                    p.setLineWidth(1)
                    text_x = 2.6*cm
                else:
                    text_x = 2*cm

                # Draw item info
                p.setFont(font_name, 9)
                p.drawString(text_x, y, f"Cikkszám: {item_code}")
                y -= 0.5*cm
                # Item name — wrap if long
                name_words = item_name.split()
                avail_w_item = width - text_x - 2*cm
                name_lines = []
                cur_line = ''
                for w in name_words:
                    test = f"{cur_line} {w}".strip()
                    if p.stringWidth(test, font_name, 9) <= avail_w_item:
                        cur_line = test
                    else:
                        if cur_line:
                            name_lines.append(cur_line)
                        cur_line = w
                if cur_line:
                    name_lines.append(cur_line)
                for i, nl in enumerate(name_lines):
                    p.drawString(text_x, y, f"Név: {nl}" if i == 0 else f"     {nl}")
                    y -= 0.5*cm
                if item_description:
                    # Wrap item description
                    desc_words = item_description.split()
                    desc_lines = []
                    cur_dl = ''
                    for w in desc_words:
                        test = f"{cur_dl} {w}".strip()
                        if p.stringWidth(test, font_name, 9) <= avail_w_item:
                            cur_dl = test
                        else:
                            if cur_dl:
                                desc_lines.append(cur_dl)
                            cur_dl = w
                    if cur_dl:
                        desc_lines.append(cur_dl)
                    for i, dl in enumerate(desc_lines):
                        p.drawString(text_x, y, f"Leírás: {dl}" if i == 0 else f"        {dl}")
                        y -= 0.5*cm
                p.drawString(text_x, y, f"Mennyiség: {float(item.quantity)} {quote_item.unit}")
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
    
    def destroy(self, request, *args, **kwargs):
        order = self.get_object()
        qr = order.quote_request
        response = super().destroy(request, *args, **kwargs)
        # Ha törlés után nincs aktív megrendelés, az RFQ visszaáll 'quoted' státuszra
        try:
            if qr and qr.status == 'ordered':
                active_orders = qr.customer_orders.exclude(status='cancelled').count()
                if active_orders == 0:
                    qr.status = 'quoted'
                    qr.save(update_fields=['status'])
                    try:
                        QuoteLog.objects.create(
                            quote=qr,
                            user=request.user if request.user.is_authenticated else None,
                            action=f'Megrendelés törölve ({order.order_number}); RFQ visszaállítva: ordered → quoted'
                        )
                    except Exception:
                        pass
        except Exception:
            pass
        return response

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Megrendelés stornózása"""
        order = self.get_object()
        if order.status == 'delivered':
            return Response({'error': 'Kiszállított megrendelés nem törölhető'}, status=status.HTTP_400_BAD_REQUEST)
        
        order.status = 'cancelled'
        order.save()
        # Ha stornó után nincs aktív megrendelés, az RFQ visszaáll 'quoted' státuszra
        try:
            qr = order.quote_request
            if qr and qr.status == 'ordered':
                active_orders = qr.customer_orders.exclude(status='cancelled').count()
                if active_orders == 0:
                    qr.status = 'quoted'
                    qr.save(update_fields=['status'])
                    try:
                        QuoteLog.objects.create(
                            quote=qr,
                            user=request.user if request.user.is_authenticated else None,
                            action=f'Megrendelés stornózva ({order.order_number}); RFQ visszaállítva: ordered → quoted'
                        )
                    except Exception:
                        pass
        except Exception:
            pass
        return Response(self.get_serializer(order).data)
    
    @action(detail=False, methods=['get'])
    def invoiceable(self, request):
        """Get orders ready for invoicing (ready, in_delivery, delivered status)"""
        orders = self.queryset.filter(status__in=['ready', 'in_delivery', 'delivered'])

        invoice_status = request.query_params.get('invoice_status', 'all')
        if invoice_status == 'to_invoice':
            orders = orders.filter(invoice_number__isnull=True)
        elif invoice_status == 'invoiced':
            orders = orders.exclude(invoice_number__isnull=True).exclude(invoice_number='')

        orders = orders.select_related(
            'quote_request', 'quote_request__company', 'quote_request__customer'
        ).prefetch_related(
            'quote_request__contacts',
            Prefetch(
                'items',
                queryset=CustomerOrderItem.objects.select_related(
                    'quote_item',
                    'quote_item__product',
                    'quote_item__material',
                    'quote_item__manufacturing_product',
                    'quote_item__service',
                )
            )
        ).order_by('-order_date', '-id')

        serializer = InvoiceableOrderSerializer(orders, many=True)
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

        # Update linked RFQ status: ordered when invoice set, accepted when cleared
        qr = getattr(order, 'quote_request', None)
        if qr:
            if invoice_number:
                if qr.status in ('new', 'in_progress', 'quoted', 'accepted'):
                    qr.status = 'ordered'
                    qr.save(update_fields=['status'])
            else:
                if qr.status == 'ordered':
                    qr.status = 'accepted'
                    qr.save(update_fields=['status'])

        return Response(self.get_serializer(order).data)

    @action(detail=False, methods=['get'])
    def handover_serial_suggest(self, request):
        """Suggest the next handover serial number for the current user.
        Format: <username><YYYYMMDD>_<NN> where NN is a 2-digit per-user
        per-day counter starting from 00."""
        from django.utils import timezone
        from apps.finance.models import CashRegisterTransaction
        user = request.user
        if not getattr(user, 'is_authenticated', False):
            return Response({'error': 'Bejelentkezés szükséges'}, status=status.HTTP_401_UNAUTHORIZED)
        username = (user.username or '').lower()
        today = timezone.now().strftime('%Y%m%d')
        prefix = f"{username}{today}_"
        # Count existing handover transactions today by this user (note starts with prefix)
        count = CashRegisterTransaction.objects.filter(
            employee__user=user,
            note__startswith=prefix,
        ).count()
        serial = f"{prefix}{count:02d}"
        return Response({'serial': serial, 'prefix': prefix, 'count': count})

    @action(detail=False, methods=['post'])
    def handover(self, request):
        """Hand over (átadás) of one or more invoiced orders.
        Body: { order_ids: [...], serial: str, cash_register: int, note?: str }
        - All selected orders MUST already be invoiced (have invoice_number).
        - Appends ` | Átadás: <serial>` to each order.invoice_number.
        - Creates a single CashRegisterTransaction (deposit) for the sum of
          the selected orders' net totals, with the serial recorded in note.
        """
        from decimal import Decimal
        from django.db import transaction as db_tx
        from apps.finance.models import CashRegister, CashRegisterEmployee, CashRegisterTransaction

        user = request.user
        if not getattr(user, 'is_authenticated', False):
            return Response({'error': 'Bejelentkezés szükséges'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            employee = user.employee_profile
        except Exception:
            return Response({'error': 'Nincs alkalmazotti profil'}, status=status.HTTP_400_BAD_REQUEST)

        order_ids = request.data.get('order_ids') or []
        serial = (request.data.get('serial') or '').strip()
        cash_register_id = request.data.get('cash_register')
        extra_note = (request.data.get('note') or '').strip()

        if not order_ids:
            return Response({'error': 'order_ids kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not serial:
            return Response({'error': 'serial kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        if not cash_register_id:
            return Response({'error': 'cash_register kötelező'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cash_register = CashRegister.objects.get(id=cash_register_id, is_active=True)
        except CashRegister.DoesNotExist:
            return Response({'error': 'Kassza nem található'}, status=status.HTTP_404_NOT_FOUND)

        # Permission check: user must have can_deposit on this register
        if not CashRegisterEmployee.objects.filter(
            cash_register=cash_register, employee=employee, can_deposit=True
        ).exists():
            return Response({'error': 'Nincs jogosultság a kasszába betenni'}, status=status.HTTP_403_FORBIDDEN)

        orders = list(CustomerOrder.objects.filter(id__in=order_ids))
        if len(orders) != len(set(order_ids)):
            return Response({'error': 'Egy vagy több megrendelés nem található'}, status=status.HTTP_404_NOT_FOUND)

        # Compute total via the serializer's net_total logic
        from .serializers import InvoiceableOrderSerializer
        ser = InvoiceableOrderSerializer(orders, many=True)
        total = sum((Decimal(str(d.get('net_total') or 0)) for d in ser.data), Decimal('0'))

        with db_tx.atomic():
            # Append serial to each invoice_number (or set to serial if empty)
            for o in orders:
                marker = f"Átadás: {serial}"
                current = (o.invoice_number or '').strip()
                if not current:
                    o.invoice_number = marker
                elif marker not in current:
                    o.invoice_number = f"{current} | {marker}"
                else:
                    continue
                o.save(update_fields=['invoice_number'])

            # Create the cash register deposit transaction
            note_lines = [serial]
            order_refs = []
            for o in orders:
                ref = (o.invoice_number or '').split(' | Átadás:')[0].strip()
                if not ref or ref.startswith('Átadás:'):
                    ref = o.order_number
                order_refs.append(ref)
            note_lines.append('Megrendelések: ' + ', '.join(order_refs))
            if extra_note:
                note_lines.append(extra_note)
            tx_note = '\n'.join(note_lines)

            balance_before = cash_register.current_balance
            balance_after = balance_before + total
            tx = CashRegisterTransaction.objects.create(
                cash_register=cash_register,
                employee=employee,
                amount=total,
                reason=None,
                note=tx_note,
                balance_before=balance_before,
                balance_after=balance_after,
            )
            cash_register.current_balance = balance_after
            cash_register.save(update_fields=['current_balance'])

        return Response({
            'serial': serial,
            'cash_register_id': cash_register.id,
            'cash_register_name': cash_register.name,
            'transaction_id': tx.id,
            'amount': str(total),
            'order_ids': [o.id for o in orders],
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'])
    def activity_logs(self, request, pk=None):
        """Get activity logs for this customer order"""
        from apps.core.models import ActivityLog
        from apps.core.serializers import ActivityLogSerializer
        from django.contrib.contenttypes.models import ContentType
        
        order = self.get_object()
        content_type = ContentType.objects.get_for_model(CustomerOrder)
        logs = ActivityLog.objects.filter(
            content_type=content_type,
            object_id=order.id
        ).select_related('user').order_by('-timestamp')
        
        serializer = ActivityLogSerializer(logs, many=True)
        return Response(serializer.data)
    
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

    @action(detail=False, methods=['get'])
    def dashboard_stats(self, request):
        """Aggregated order counts by status for the dashboard"""
        from django.db.models import Count
        status_counts = CustomerOrder.objects.values('status').annotate(count=Count('id'))
        result = {item['status']: item['count'] for item in status_counts}
        # Latest orders
        latest = CustomerOrder.objects.select_related('quote_request__company', 'quote_request__customer').order_by('-order_date')[:10]
        from .serializers import CustomerOrderListSerializer
        latest_data = CustomerOrderListSerializer(latest, many=True).data
        return Response({
            'counts': result,
            'latest_orders': latest_data,
        })


class CustomerOrderItemViewSet(viewsets.ModelViewSet):
    queryset = CustomerOrderItem.objects.all()
    serializer_class = CustomerOrderItemSerializer
    permission_classes = [AllowAny]

    PRICE_FIELDS = {'net_unit_price', 'vat_rate', 'discount_percent', 'discount_amount'}

    def partial_update(self, request, *args, **kwargs):
        item = self.get_object()
        order = item.customer_order

        # Számlázás után az ár-mezők nem módosíthatók
        if order.invoice_number:
            price_fields_in_request = self.PRICE_FIELDS & set(request.data.keys())
            if price_fields_in_request:
                return Response(
                    {'error': 'A megrendelés már számlázva van, az árak nem módosíthatók.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Ár-mezők módosításához sales.orders edit jogosultság kell
        price_fields_in_request = self.PRICE_FIELDS & set(request.data.keys())
        if price_fields_in_request:
            from apps.core.permissions import check_permission
            user = request.user
            if not user or not user.is_authenticated:
                return Response({'error': 'Bejelentkezés szükséges.'}, status=status.HTTP_403_FORBIDDEN)
            if not (user.is_superuser or user.is_staff or
                    check_permission(user, 'sales', 'sales.orders', 'edit')):
                return Response(
                    {'error': 'Nincs jogosultságod az árak módosításához.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=['patch'], url_path='remark')
    def update_remark(self, request, pk=None):
        """PATCH remark field on a customer order item."""
        item = self.get_object()
        item.remark = request.data.get('remark', '')
        item.save(update_fields=['remark'])
        return Response({'remark': item.remark})

    @action(detail=True, methods=['get', 'post'], url_path='attachments')
    def attachments(self, request, pk=None):
        """GET: list QRI attachments for this COI; POST: upload."""
        from .models import QuoteRequestItemAttachment
        from .serializers import QuoteRequestItemAttachmentSerializer
        item = self.get_object()
        qi = item.quote_item
        if request.method == 'GET':
            atts = QuoteRequestItemAttachment.objects.filter(quote_item=qi).order_by('-created_at')
            data = []
            for a in atts:
                data.append({
                    'id': a.id,
                    'file_url': request.build_absolute_uri(a.file.url) if a.file else None,
                    'original_filename': a.file.name.split('/')[-1] if a.file else '',
                    'file_size': a.file.size if a.file else 0,
                    'remark': a.remark,
                    'storage_file_id': a.storage_file_id,
                    'uploaded_by_name': a.uploaded_by.get_full_name() if a.uploaded_by else '',
                    'created_at': a.created_at.isoformat() if a.created_at else '',
                })
            return Response(data)
        # POST
        file_obj = request.FILES.get('file')
        remark = request.data.get('remark', '')
        if not file_obj:
            return Response({'error': 'file kötelező'}, status=status.HTTP_400_BAD_REQUEST)
        att = QuoteRequestItemAttachment.objects.create(
            quote_item=qi, file=file_obj, remark=remark,
            uploaded_by=request.user if request.user and request.user.is_authenticated else None
        )
        # Storage bejegyzés
        try:
            from apps.core.models import StorageFolder, StorageFile as SF
            owner = request.user
            orders_root, _ = StorageFolder.objects.get_or_create(name='orders', parent=None, defaults={'owner': owner})
            order = item.customer_order
            folder, _ = StorageFolder.objects.get_or_create(name=order.order_number, parent=orders_root, defaults={'owner': owner})
            sf = SF(name=file_obj.name, folder=folder, size=att.file.size if att.file else 0,
                    content_type=file_obj.content_type or '', owner=owner)
            sf.file.name = att.file.name
            sf.save()
            att.storage_file_id = sf.id
            att.save(update_fields=['storage_file_id'])
        except Exception:
            pass
        return Response({
            'id': att.id,
            'file_url': request.build_absolute_uri(att.file.url) if att.file else None,
            'original_filename': att.file.name.split('/')[-1] if att.file else '',
            'file_size': att.file.size if att.file else 0,
            'remark': att.remark,
            'storage_file_id': att.storage_file_id,
            'uploaded_by_name': att.uploaded_by.get_full_name() if att.uploaded_by else '',
            'created_at': att.created_at.isoformat() if att.created_at else '',
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'], url_path=r'attachments/(?P<att_id>\d+)/remark')
    def update_attachment_remark(self, request, pk=None, att_id=None):
        from .models import QuoteRequestItemAttachment
        item = self.get_object()
        qi = item.quote_item
        att = get_object_or_404(QuoteRequestItemAttachment, id=att_id, quote_item=qi)
        att.remark = request.data.get('remark', '')
        att.save(update_fields=['remark'])
        return Response({'remark': att.remark})

    @action(detail=True, methods=['delete'], url_path=r'attachments/(?P<att_id>\d+)')
    def delete_attachment(self, request, pk=None, att_id=None):
        from .models import QuoteRequestItemAttachment
        item = self.get_object()
        qi = item.quote_item
        att = get_object_or_404(QuoteRequestItemAttachment, id=att_id, quote_item=qi)
        if att.storage_file_id:
            try:
                from apps.core.models import StorageFile as SF
                SF.objects.filter(id=att.storage_file_id).delete()
            except Exception:
                pass
        att.file.delete(save=False)
        att.delete()
        return Response({'status': 'ok'})


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
        'delivery_note_number': order.delivery_note_number,
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
    
    # Delivery note number
    if order.delivery_note_number:
        p.setFont(font_name, 9)
        p.drawString(width - 8*cm, y - 1.0*cm, "Szállítólevél sorszám:")
        p.setFont(font_name, 11)
        p.drawString(width - 8*cm, y - 1.5*cm, f"{order.delivery_note_number}")
        y -= 0.6*cm
    
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
@authentication_classes([])
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
    def frequent_workflows(self, request):
        """Get top 10 most frequent Workflows for the current user"""
        from django.db.models import Count
        logs = WorkLog.objects.filter(user=request.user)\
            .values('workflow_name')\
            .annotate(count=Count('workflow_name'))\
            .order_by('-count')[:10]
        
        return Response([log['workflow_name'] for log in logs if log['workflow_name']])

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get the currently active work log for the user (or for a specific user if user_id provided)"""
        user_id = request.query_params.get('user_id')
        if user_id and (request.user.is_staff or request.user.is_superuser):
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                target_user = User.objects.get(id=user_id)
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=404)
            log = WorkLog.objects.filter(user=target_user, ended_at__isnull=True).first()
        else:
            log = WorkLog.objects.filter(user=request.user, ended_at__isnull=True).first()
        if log:
            return Response(self.get_serializer(log).data)
        return Response({})  # Return empty object

    @action(detail=False, methods=['get'])
    def all_active(self, request):
        """Get all currently active work logs (all users) for dashboard"""
        logs = WorkLog.objects.filter(ended_at__isnull=True).select_related(
            'user', 'customer_order', 'item'
        ).order_by('started_at')
        return Response(self.get_serializer(logs, many=True).data)
    
    @action(detail=False, methods=['post'])
    def start(self, request):
        """Start a new timer. Supports for_user_id (help colleague) and order_label (free-text Egyéb)."""
        order_id = request.data.get('order_id')
        order_label = request.data.get('order_label', '')
        item_id = request.data.get('item_id')
        workflow_name = request.data.get('workflow_name', '')
        sub_item_id = request.data.get('sub_item_id')
        for_user_id = request.data.get('for_user_id')

        if not order_id and not order_label:
            return Response({'error': 'order_id or order_label required'}, status=400)

        # Determine target user
        if for_user_id:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                target_user = User.objects.get(id=for_user_id)
            except User.DoesNotExist:
                return Response({'error': 'Target user not found'}, status=404)
        else:
            target_user = request.user

        # Stop any active log for the target user first
        active = WorkLog.objects.filter(user=target_user, ended_at__isnull=True).first()
        if active:
            active.ended_at = timezone.now()
            delta = active.ended_at - active.started_at
            active.duration_seconds = int(delta.total_seconds())
            active.save()

        new_log = WorkLog.objects.create(
            user=target_user,
            customer_order_id=order_id if order_id else None,
            order_label=order_label or '',
            item_id=item_id if item_id else None,
            sub_item_id=sub_item_id if sub_item_id else None,
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


class ExtraWorkViewSet(viewsets.ModelViewSet):
    """CRUD for Plusz munkák on customer orders"""
    serializer_class = ExtraWorkSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = ExtraWork.objects.select_related('customer_order', 'customer_order_item', 'created_by')
        order_id = self.request.query_params.get('order_id')
        if order_id:
            qs = qs.filter(customer_order_id=order_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


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

class DeliveryNoteViewSet(viewsets.ModelViewSet):
    queryset = DeliveryNote.objects.all().order_by('-created_at')
    serializer_class = DeliveryNoteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        # Filter logic
        q = self.request.query_params.get('q')
        if q:
            qs = qs.filter(
                Q(delivery_note_number__icontains=q) |
                Q(customer__name__icontains=q) |
                Q(contact__name__icontains=q)
            )
        return qs

    def perform_destroy(self, instance):
        # We can just delete the DeliveryNote instance. 
        # Django's CASCADE on DeliveryNoteItem should handle items.
        # But we need to make sure we don't need any complex inventory reversal here?
        # Inventory is not yet deducted upon "DeliveryNote creation" but rather upon actual stock movement.
        # But if it was deducted, we would reverse it here.
        # For now, just delete.
        instance.delete()

    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path=r'public/(?P<token>[^/.]+)')
    def public_delivery_note(self, request, token=None):
        dn = get_object_or_404(DeliveryNote, public_token=token)
        
        # Auto confirm if > 48h and not confirmed
        from datetime import timedelta
        reference_time = dn.created_at
        limit = reference_time + timedelta(hours=48)
        if not dn.is_confirmed and timezone.now() > limit:
             dn.is_confirmed = True
             dn.confirmed_at = timezone.now()
             dn.confirmed_by_info = "Automata (48h lejárt)"
             dn.save()
             
        return Response(DeliveryNoteSerializer(dn).data)


    @action(detail=False, methods=['post'], permission_classes=[AllowAny], url_path=r'public/(?P<token>[^/.]+)/confirm')
    def public_delivery_note_confirm(self, request, token=None):
        dn = get_object_or_404(DeliveryNote, public_token=token)
        
        # Determine client IP for info
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
            
        notes = request.data.get('notes', '')
        # confirmed_items = request.data.get('confirmed_items', []) # Currently we just confirm the whole note
        
        dn.is_confirmed = True
        dn.confirmed_at = timezone.now()
        dn.confirmed_by_info = f"Publikus felület (IP: {ip})"
        if notes:
            # Append notes if existing notes are present
            if dn.notes:
                dn.notes += f"\n\n{notes}"
            else:
                dn.notes = notes
        dn.save()

        # Auto-update CustomerOrderItem status based on delivered quantities
        for dn_item in dn.items.all():
            coi = dn_item.customer_order_item
            if coi.status == 'cancelled':
                continue
            ordered = coi.quantity
            delivered_total = DeliveryNoteItem.objects.filter(
                customer_order_item=coi,
                delivery_note__is_confirmed=True,
            ).aggregate(total=models.Sum('quantity'))['total'] or 0
            if delivered_total >= ordered:
                if coi.status != 'delivered':
                    coi.status = 'delivered'
                    coi.save()
            else:
                if coi.status not in ('in_delivery', 'delivered'):
                    coi.status = 'in_delivery'
                    coi.save()

        return Response({'status': 'ok'})

    @action(detail=False, methods=['get'], permission_classes=[AllowAny], url_path=r'public/(?P<token>[^/.]+)/pdf')
    def public_delivery_note_pdf(self, request, token=None):
        from django.http import HttpResponse
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.units import cm
        from io import BytesIO
        from apps.core.models import Company as CoreCompany
        
        dn = get_object_or_404(DeliveryNote, public_token=token)
        show_prices = request.query_params.get('show_prices') == 'true'
        supplier = CoreCompany.objects.filter(is_default=True).first() or CoreCompany.objects.first()
        
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
            font_name = 'Helvetica' # Fallback, might not support special chars
            
        y = height - 2*cm
        
        # Supplier Header Left
        p.setFont(font_name, 10)
        if supplier:
            p.setFont(font_name, 9)
            p.drawString(2*cm, y, "Szállító:")
            y -= 0.5*cm
            p.setFont(font_name, 10)
            p.drawString(2*cm, y, supplier.name)
            y -= 0.5*cm
            p.setFont(font_name, 8)
            p.drawString(2*cm, y, supplier.address)
            y -= 0.4*cm
            if supplier.tax_number:
                p.drawString(2*cm, y, f"Adószám: {supplier.tax_number}")
                y -= 0.4*cm
            contact_info = []
            if supplier.email: contact_info.append(supplier.email)
            if supplier.phone: contact_info.append(supplier.phone)
            if contact_info:
                p.drawString(2*cm, y, " | ".join(contact_info))
                
        # Title Right
        y_title = height - 2*cm
        p.setFont(font_name, 18)
        p.drawRightString(width - 2*cm, y_title, "SZÁLLÍTÓLEVÉL")
        
        # Number
        y_title -= 1.5*cm 
        p.setFont(font_name, 11)
        p.drawRightString(width - 2*cm, y_title, f"Szám: {dn.delivery_note_number}")

        # Dates (Moved under the number)
        y_date = y_title - 1.0*cm
        p.setFont(font_name, 10)
        p.drawRightString(width - 2*cm, y_date, f"Kiállítás: {dn.issue_date.strftime('%Y-%m-%d')}")
        y_date -= 0.5*cm
        if dn.delivery_date:
            p.drawRightString(width - 2*cm, y_date, f"Szállítás: {dn.delivery_date.strftime('%Y-%m-%d')}")
        
        y = height - 6*cm
        
        p.setFont(font_name, 9)
        p.drawString(2*cm, y, "Megrendelő:")
        y -= 0.5*cm
        p.setFont(font_name, 11)
        if dn.customer:
             p.drawString(2*cm, y, dn.customer.name)
             y -= 0.5*cm
             p.setFont(font_name, 9)
             p.drawString(2*cm, y, dn.customer.full_address)
             y -= 0.5*cm
        if dn.contact:
             p.drawString(2*cm, y, f"Kapcsolattartó: {dn.contact.name}")
             y -= 0.5*cm
             
        y = height - 10*cm
        
        # Items Header
        p.setFont(font_name, 11)
        p.drawString(2*cm, y+0.4*cm, "Szállított tételek")
        y -= 0.5*cm
        
        p.setFont(font_name, 9)
        p.drawString(2*cm, y, "Megnevezés")
        p.drawRightString(11*cm, y, "Mennyiség")
        p.drawString(11.5*cm, y, "Egység")
        
        if show_prices:
             p.drawRightString(15*cm, y, "Ár/egység")
             p.drawRightString(18*cm, y, "Összesen")
             
        p.line(2*cm, y-0.2*cm, width-2*cm, y-0.2*cm)
        y -= 0.8*cm
        
        total_net = 0
        
        for item in dn.items.all():
            p.setFont(font_name, 9)
            # Find item code
            item_code = ""
            try:
                # Same logic as serializer
                coi = item.customer_order_item
                qi = coi.quote_item
                if qi.material: item_code = qi.material.code
                if qi.service: item_code = qi.service.code
            except:
                pass
                
            # Item name
            item_text = item.item_name[:40]
            if item_code:
                item_text = f"[{item_code}] {item_text}"
                
            # Order number
            order_num = item.customer_order_item.customer_order.order_number if item.customer_order_item and item.customer_order_item.customer_order else ""
            if order_num:
                item_text += f" - {order_num}"
                
            p.drawString(2*cm, y, item_text)
            p.drawRightString(11*cm, y, f"{item.quantity}")
            p.drawString(11.5*cm, y, item.unit)
            
            if show_prices:
                p.drawRightString(15*cm, y, f"{item.net_unit_price:,.2f}")
                net_line = item.quantity * item.net_unit_price
                total_net += net_line
                p.drawRightString(18*cm, y, f"{net_line:,.2f}")
                
            y -= 0.6*cm
            if y < 4*cm:
                p.showPage()
                y = height - 2*cm
                p.setFont(font_name, 10)
        
        if show_prices:
             y -= 0.5*cm
             p.line(12*cm, y+0.4*cm, 18*cm, y+0.4*cm)
             p.setFont(font_name, 10)
             p.drawRightString(18*cm, y, f"Összesen (Nettó): {total_net:,.2f}")
             
        # Contacts Footer
        y = 3*cm
        p.line(2*cm, y, width-2*cm, y)
        y -= 0.5*cm
        p.setFont(font_name, 8)
        p.drawString(2*cm, y, "Kapcsolattartók:")
        y -= 0.4*cm
        contacts_str = ""
        if dn.customer:
             contacts = dn.customer.contact_set.all()[:3] 
             c_list = []
             for c in contacts:
                 c_text = c.name
                 if c.phone: c_text += f" ({c.phone})"
                 c_list.append(c_text)
             contacts_str = ", ".join(c_list)
        p.drawString(2*cm, y, contacts_str)
        
        p.save()
        pdf = buffer.getvalue()
        buffer.close()

        response = HttpResponse(content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{dn.delivery_note_number}.pdf"'
        response.write(pdf)
        return response

    @action(detail=False, methods=['get'])
    def deliverable_customers(self, request):
        """
        Get list of customers (Companies or Contacts) that have orders in 
        'in_production' or 'ready' status.
        Returns: { id, name, type, real_id }
        """
        orders = CustomerOrder.objects.filter(
            status__in=['in_production', 'ready']
        ).select_related('quote_request', 'quote_request__company').prefetch_related('quote_request__contacts')
        
        results = {}
        
        for order in orders:
            qr = order.quote_request
            if qr.company:
                # Company
                key = f"company_{qr.company.id}"
                if key not in results:
                    results[key] = {
                        'id': key,
                        'name': qr.company.name,
                        'type': 'company',
                        'real_id': qr.company.id
                    }
            else:
                # Check contacts (Private Individual case)
                # If multiple contacts, we might list them separately or aggregate?
                # Usually purely "Private Individual" deals have one main contact or we pick the first.
                for contact in qr.contacts.all():
                    key = f"contact_{contact.id}"
                    if key not in results:
                        results[key] = {
                            'id': key,
                            'name': f"Magánszemély - {contact.name}",
                            'type': 'contact',
                            'real_id': contact.id
                        }
        
        return Response(list(results.values()))

    @action(detail=False, methods=['get'])
    def items_for_customer(self, request):
        """
        Get all order items for a specific customer/contact that are not fully delivered.
        Query params: 
           customer_id (Company ID) OR
           contact_id (Contact ID)
        """
        customer_id = request.query_params.get('customer_id')
        contact_id = request.query_params.get('contact_id')
        
        if not customer_id and not contact_id:
            return Response({'error': 'customer_id or contact_id required'}, status=400)
            
        # Filter orders
        # Only active statuses for delivery selection?
        # User asked for 'in_production' or 'ready' in the dropdown list, 
        # so logically these are the only ones we can deliver from here.
        # But maybe also 'confirmed'? Let's keep the filter wide enough but prioritize user's logic.
        # If user picked a customer from the list (which only included in_production/ready),
        # querying only those is safe. But technically we could deliver 'confirmed' items too.
        # Let's stick to what allows delivery.
        
        filters = Q(status__in=['in_production', 'ready', 'in_delivery'])
        
        if customer_id:
            filters &= (Q(quote_request__company_id=customer_id) | Q(quote_request__customer_id=customer_id))
        elif contact_id:
            # quote_request__contacts is M2M
            filters &= Q(quote_request__contacts__id=contact_id)
            
        orders = CustomerOrder.objects.filter(filters).distinct()
        
        # We need items that have delivered_qty < ordered_qty
        # But delivered_qty is sum of previous delivery note items.
        
        result = []
        
        for order in orders:
            for item in order.items.all():
                # sum delivered from confirmed delivery notes
                # Or maybe even unconfirmed ones? Usually confirmed.
                # Let's count all delivery note items linked to this order item.
                delivered_agg = DeliveryNoteItem.objects.filter(
                    customer_order_item=item
                ).aggregate(total=models.Sum('quantity'))
                
                delivered = delivered_agg['total'] or 0
                ordered = item.quantity
                remaining = ordered - delivered
                
                # If remaining > 0 (or some small epsilon), include it
                if remaining > 0:
                    # Get item name/desc
                    # CustomerOrderItem description or QuoteItem product name
                    quote_item = item.quote_item
                    item_name = item.description
                    if not item_name and quote_item:
                         ref = (
                            quote_item.product.name if quote_item.product else (
                                quote_item.material.name if quote_item.material else (
                                    quote_item.manufacturing_product.name if quote_item.manufacturing_product else (
                                        quote_item.service.name if quote_item.service else '-'
                                    )
                                )
                            )
                        )
                         item_name = ref
                        
                    result.append({
                        'order_id': order.id,
                        'order_number': order.order_number,
                        'order_item_id': item.id,
                        'item_name': item_name,
                        'item_description': quote_item.description if quote_item else '',
                        'unit': item.unit,
                        'unit_price': item.net_unit_price,
                        'ordered_quantity': ordered,
                        'delivered_quantity': delivered,
                        'remaining_quantity': remaining,
                    })
                    
        return Response(result)

    def perform_create(self, serializer):
        # Auto generate delivery note number if not provided
        # Similar to Order number generation
        if not serializer.validated_data.get('delivery_note_number'):
            today_str = timezone.now().strftime('%Y%m%d')
            last = DeliveryNote.objects.filter(delivery_note_number__startswith=f"DN{today_str}").order_by('-delivery_note_number').first()
            if last:
                try:
                    seq = int(last.delivery_note_number[-4:]) + 1
                except:
                    seq = 1
            else:
                seq = 1
            serializer.save(
                delivery_note_number=f"DN{today_str}{seq:04d}",
                created_by=self.request.user,
                public_token=secrets.token_urlsafe(24)
            )
        else:
             serializer.save(
                 created_by=self.request.user,
                 public_token=secrets.token_urlsafe(24)
             )
             
    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        note = self.get_object()
        if note.is_confirmed:
            return Response({'error': 'Már visszaigazolva'}, status=400)
            
        note.is_confirmed = True
        note.confirmed_at = timezone.now()
        note.confirmed_by_user = request.user
        note.save()

        # Auto-update CustomerOrderItem status based on delivered quantities
        for dn_item in note.items.all():
            coi = dn_item.customer_order_item
            if coi.status == 'cancelled':
                continue
            ordered = coi.quantity
            delivered_total = DeliveryNoteItem.objects.filter(
                customer_order_item=coi,
                delivery_note__is_confirmed=True,
            ).aggregate(total=models.Sum('quantity'))['total'] or 0
            if delivered_total >= ordered:
                if coi.status != 'delivered':
                    coi.status = 'delivered'
                    coi.save()
            else:
                if coi.status not in ('in_delivery', 'delivered'):
                    coi.status = 'in_delivery'
                    coi.save()

        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def send_email(self, request, pk=None):
        dn = self.get_object()
        to = request.data.get('to')
        cc = request.data.get('cc', '')
        reply_to = request.data.get('reply_to', '')
        template_key = request.data.get('template_key', 'delivery_send')
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

        # Substitute variables in signature
        if sig and sig.body_html:
            try:
                user = request.user
                try:
                    employee = user.employee_profile
                except Exception:
                    employee = None

                user_name = f"{user.last_name} {user.first_name}".strip()
                if not user_name:
                    user_name = user.username
                
                user_email = user.email or ''
                user_position = ''
                user_phonenumber = ''
                
                if employee:
                    user_phonenumber = employee.phone or ''
                    if employee.position:
                        user_position = employee.position.title
                
                sig_ctx = {
                    'user_name': user_name,
                    'user_email': user_email,
                    'user_position': user_position,
                    'user_phonenumber': user_phonenumber
                }
                for key, val in sig_ctx.items():
                    sig.body_html = sig.body_html.replace(f"{{{key}}}", str(val))
            except Exception:
                pass

        if not dn.public_token:
            dn.public_token = secrets.token_urlsafe(24)
            dn.save(update_fields=['public_token'])
            
        public_url = f"{settings.FRONTEND_BASE_URL}/public/delivery-note/{dn.public_token}"
        
        contact_names = dn.contact.name if dn.contact else (dn.customer.name if dn.customer else 'Ügyfelünk')
        
        # Check datetime for template compatibility
        d_val = dn.delivery_date or dn.created_at
        if d_val and isinstance(d_val, datetime.date) and not isinstance(d_val, datetime.datetime):
             d_val = datetime.datetime.combine(d_val, datetime.time.min)

        ctx = {
            'dn_number': dn.delivery_note_number,
            'customer_name': dn.customer.name if dn.customer else '',
            'public_url': public_url,
            'contact_names': contact_names,
            # Backwards compatibility for templates expecting order object or specific keys
            'company_name': dn.customer.name if dn.customer else '',
            'delivery_url': public_url,
            'order': {
                'order_number': dn.delivery_note_number,
                'delivery_started_at': d_val,
            },
            **extra_context,
        }
        
        def render_tpl(content, context):
            if not content: return ""
            # Detect Django template syntax
            if "{{" in content or "{%" in content:
                try:
                    t = Template(content)
                    return t.render(Context(context))
                except Exception:
                    pass
            
            # Fallback to python format
            try:
                return content.format(**context)
            except Exception:
                return content

        subject = override_subject if override_subject is not None else render_tpl(tpl.subject_template, ctx)
        
        if override_body is not None:
            body = override_body
            body_core = override_body
        else:
            body_core = render_tpl(tpl.body_template, ctx)
            if tpl.is_html:
                body = f"{body_core}{sig.body_html if sig else ''}"
            else:
                body = f"{body_core}\n\n{sig.body_html if sig else ''}"

        # Determine sender
        from_email = cfg.from_email
        from_name = cfg.from_name
        try:
            default_company = CoreCompany.objects.filter(is_default=True).first()
            if default_company and default_company.email:
                from_email = default_company.email
                if default_company.name:
                    from_name = default_company.name
        except Exception:
            pass

        # Build MIME
        msg = MIMEMultipart('alternative') if tpl.is_html else email.message.EmailMessage()
        if isinstance(msg, MIMEMultipart):
            msg['Subject'] = subject
            msg['From'] = f"{from_name} <{from_email}>" if from_name else from_email
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
            msg['From'] = f"{from_name} <{from_email}>" if from_name else from_email
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

        # IMAP Append
        try:
            if cfg.imap_host and cfg.imap_username:
                imap_host = cfg.imap_host
                imap_port = cfg.imap_port
                imap_user = cfg.imap_username
                imap_pwd = cfg.imap_password
                sent_folder = cfg.imap_sent_folder or 'Sent'
                
                M = None
                try:
                    if imap_port == 993:
                        M = imaplib.IMAP4_SSL(imap_host, imap_port)
                    else:
                        M = imaplib.IMAP4(imap_host, imap_port)
                        try:
                            M.starttls(ssl_context=ssl.create_default_context())
                        except Exception:
                            pass
                except Exception:
                    try:
                        M = imaplib.IMAP4_SSL(imap_host)
                    except Exception:
                         M = imaplib.IMAP4(imap_host)
                
                if M:
                    M.login(imap_user, imap_pwd)
                    used_folder = sent_folder
                    ok = False
                    try:
                        typ_chk, _ = M.select(used_folder, readonly=True)
                        ok = (typ_chk == 'OK')
                    except Exception:
                        ok = False
                    
                    if not ok:
                        try:
                            typ_list, boxes = M.list()
                            candidates = []
                            if typ_list == 'OK' and boxes:
                                import re as _re
                                for rawline in boxes:
                                    s = rawline.decode(errors='ignore') if isinstance(rawline, (bytes, bytearray)) else str(rawline)
                                    m_flags = _re.search(r"\(([^)]*)\)", s)
                                    flags_txt = m_flags.group(1) if m_flags else ''
                                    m_q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                                    name = m_q[-1] if m_q else (s.split()[-1] if s.split() else '')
                                    try:
                                        from imaplib import IMAP4
                                        decoded = IMAP4._decode_utf7(name.encode())
                                        if decoded: name = decoded
                                    except Exception:
                                        pass
                                    if name in ('.','', 'NIL'): continue
                                    if 'Noselect' in (flags_txt or '') or '\\Noselect' in (flags_txt or ''): continue
                                    candidates.append({'name': name, 'flags': flags_txt})
                            cand = None
                            for mb in candidates:
                                if '\\Sent' in (mb['flags'] or ''):
                                    cand = mb['name']
                                    break
                            if not cand:
                                common = ['Sent','Sent Items','Sent Mail','Sent Messages','[Gmail]/Sent Mail','Elküldött','Elküldött levelek','Elküldött üzenetek','Küldött elemek']
                                lower = {mb['name'].lower(): mb['name'] for mb in candidates}
                                for cn in common:
                                    if cn.lower() in lower:
                                        cand = lower[cn.lower()]
                                        break
                            if cand:
                                used_folder = cand
                        except Exception:
                            pass
                    
                    flags = '(\\Seen)'
                    date_time = imaplib.Time2Internaldate(timezone.now().timestamp())
                    
                    def _detect_delim(imap):
                        try:
                            typ0, boxes0 = imap.list('', '')
                            if typ0 == 'OK' and boxes0:
                                s = boxes0[0].decode(errors='ignore') if isinstance(boxes0[0], (bytes, bytearray)) else str(boxes0[0])
                                import re as _re
                                q = _re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', s)
                                if len(q) >= 2: return q[-2]
                        except Exception: pass
                        return None

                    def _try_create_and_append(imap, mailbox):
                        try:
                            typ_app, _ = imap.append(mailbox, flags, date_time, mime_bytes)
                            if typ_app == 'OK': return True
                        except Exception: pass
                        try:
                            try: imap.create(mailbox)
                            except Exception: pass
                            try: imap.subscribe(mailbox)
                            except Exception: pass
                            typ_app2, _ = imap.append(mailbox, flags, date_time, mime_bytes)
                            return typ_app2 == 'OK'
                        except Exception: return False

                    if not _try_create_and_append(M, used_folder):
                        delim = _detect_delim(M) or '.'
                        variants = []
                        base = used_folder
                        if delim not in (None, '', 'NIL'):
                             variants.extend([f'INBOX{delim}{base}', f'Sent{delim}{base}', f'Inbox{delim}{base}'])
                        for v in variants:
                            if _try_create_and_append(M, v): break
                    M.logout()
        except Exception as e:
            print(f"IMAP Append Error: {e}")

        return Response({'status': 'sent'})

    @action(detail=True, methods=['post'])
    def render_email(self, request, pk=None):
        dn = self.get_object()
        template_key = request.data.get('template_key', 'delivery_send')
        signature_key = request.data.get('signature_key')
        extra_context = request.data.get('context', {}) or {}
        override_subject = request.data.get('subject')
        override_body = request.data.get('body')

        tpl = EmailTemplate.objects.filter(key=template_key).first()
        if not tpl:
            return Response({'error': 'Hiányzó email sablon'}, status=400)
        sig = SignatureTemplate.objects.filter(key=signature_key).first() if signature_key else None

        if sig and sig.body_html:
            try:
                user = request.user
                try:
                    employee = user.employee_profile
                except Exception:
                    employee = None

                user_name = f"{user.last_name} {user.first_name}".strip()
                if not user_name:
                    user_name = user.username
                
                user_email = user.email or ''
                user_position = ''
                user_phonenumber = ''
                
                if employee:
                    user_phonenumber = employee.phone or ''
                    if employee.position:
                        user_position = employee.position.title
                
                sig_ctx = {
                    'user_name': user_name,
                    'user_email': user_email,
                    'user_position': user_position,
                    'user_phonenumber': user_phonenumber
                }
                for key, val in sig_ctx.items():
                    sig.body_html = sig.body_html.replace(f"{{{key}}}", str(val))
            except Exception:
                pass

        if not dn.public_token:
            dn.public_token = secrets.token_urlsafe(24)
            dn.save(update_fields=['public_token'])
            
        public_url = f"{settings.FRONTEND_BASE_URL}/public/delivery-note/{dn.public_token}"
        contact_names = dn.contact.name if dn.contact else (dn.customer.name if dn.customer else 'Ügyfelünk')
        
        # Collect email addresses
        suggested_recipients = []
        if dn.contact and dn.contact.email:
             suggested_recipients.append(dn.contact.email)
        if dn.customer and dn.customer.email:
             if dn.customer.email not in suggested_recipients:
                 suggested_recipients.append(dn.customer.email)
        
        # Check datetime for template compatibility
        d_val = dn.delivery_date or dn.created_at
        if d_val and isinstance(d_val, datetime.date) and not isinstance(d_val, datetime.datetime):
             d_val = datetime.datetime.combine(d_val, datetime.time.min)

        ctx = {
            'dn_number': dn.delivery_note_number,
            'customer_name': dn.customer.name if dn.customer else '',
            'public_url': public_url,
            'contact_names': contact_names,
            # Backwards compatibility for templates expecting order object or specific keys
            'company_name': dn.customer.name if dn.customer else '',
            'delivery_url': public_url,
            'order': {
                'order_number': dn.delivery_note_number,
                'delivery_started_at': d_val,
            },
            **extra_context,
        }
        
        def render_tpl(content, context):
            if not content: return ""
            # Detect Django template syntax
            if "{{" in content or "{%" in content:
                try:
                    t = Template(content)
                    return t.render(Context(context))
                except Exception:
                    pass
            
            # Fallback to python format
            try:
                return content.format(**context)
            except Exception:
                return content

        subject = override_subject if override_subject is not None else render_tpl(tpl.subject_template, ctx)
        
        if override_body is not None:
            body = override_body
        else:
            body_core = render_tpl(tpl.body_template, ctx)
            if tpl.is_html:
                body = f"{body_core}{sig.body_html if sig else ''}"
            else:
                body = f"{body_core}\n\n{sig.body_html if sig else ''}"
                
        return Response({
            'subject': subject, 
            'body': body, 
            'is_html': tpl.is_html,
            'proposed_recipients': suggested_recipients
        })

class DeliveryNoteItemViewSet(viewsets.ModelViewSet):
    queryset = DeliveryNoteItem.objects.all().order_by('-created_at')
    serializer_class = DeliveryNoteItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        
        # Filtering
        note_number = self.request.query_params.get('note_number')
        order_number = self.request.query_params.get('order_number')
        item_name = self.request.query_params.get('item_name')
        q = self.request.query_params.get('q')

        if note_number:
            qs = qs.filter(delivery_note__delivery_note_number__icontains=note_number)
        if order_number:
            qs = qs.filter(customer_order_item__customer_order__order_number__icontains=order_number)
        if item_name:
             qs = qs.filter(item_name__icontains=item_name)
             
        if q:
            qs = qs.filter(
                Q(delivery_note__delivery_note_number__icontains=q) |
                Q(customer_order_item__customer_order__order_number__icontains=q) |
                Q(item_name__icontains=q) |
                Q(delivery_note__customer__name__icontains=q) |
                Q(delivery_note__contact__name__icontains=q)
            )

        return qs

class ApprovalRequestViewSet(viewsets.ModelViewSet):
    from .models import ApprovalRequest
    queryset = ApprovalRequest.objects.all()
    serializer_class = ApprovalRequestSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        if not _user_can_approve_customer_orders(self.request.user):
            qs = qs.filter(requester=self.request.user)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs.order_by('-created_at')

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if not _user_can_approve_customer_orders(request.user):
            return Response({'error': 'Nincs jogosultságod jóváhagyni.'}, status=status.HTTP_403_FORBIDDEN)

        req = self.get_object()
        if req.status != 'pending':
            return Response({'error': 'Nem függőben lévő kérelem'}, status=400)
            
        # Apply change
        order = req.customer_order
        _apply_customer_order_status(order, req.requested_status)
        
        req.status = 'approved'
        req.save()
        
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if not _user_can_approve_customer_orders(request.user):
            return Response({'error': 'Nincs jogosultságod visszaküldeni.'}, status=status.HTTP_403_FORBIDDEN)

        req = self.get_object()
        note = request.data.get('note', '')
        req.status = 'rejected'
        req.rejection_details = note
        req.save()
        return Response({'status': 'rejected'})


# ==================== POS ViewSets ====================

class POSCustomerIdentificationViewSet(viewsets.ModelViewSet):
    """ViewSet for POS customer identification (QR codes)"""
    queryset = POSCustomerIdentification.objects.all()
    serializer_class = POSCustomerIdentificationSerializer
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'])
    def verify_qr(self, request):
        """Verify QR code and return customer info"""
        qr_code = request.data.get('qr_code')
        if not qr_code:
            return Response({'error': 'QR code required'}, status=400)
        
        try:
            identification = POSCustomerIdentification.objects.select_related('customer').get(
                qr_code=qr_code, 
                is_active=True
            )
            identification.last_used_at = timezone.now()
            identification.save()
            
            return Response({
                'valid': True,
                'customer': {
                    'id': identification.customer.id,
                    'name': identification.customer.name,
                    'email': identification.customer.email,
                    'tax_number': identification.customer.tax_number,
                    'address': identification.customer.address,
                }
            })
        except POSCustomerIdentification.DoesNotExist:
            return Response({'valid': False}, status=404)


class POSCouponViewSet(viewsets.ModelViewSet):
    """ViewSet for POS coupons"""
    queryset = POSCoupon.objects.all()
    serializer_class = POSCouponSerializer
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'])
    def validate_coupon(self, request):
        """Validate coupon code"""
        code = request.data.get('code')
        if not code:
            return Response({'error': 'Coupon code required'}, status=400)
        
        try:
            coupon = POSCoupon.objects.get(code=code)
            is_valid = coupon.is_valid()
            
            if is_valid:
                return Response({
                    'valid': True,
                    'coupon': POSCouponSerializer(coupon).data
                })
            else:
                return Response({
                    'valid': False,
                    'message': 'Kupon nem érvényes vagy lejárt'
                }, status=400)
        except POSCoupon.DoesNotExist:
            return Response({
                'valid': False,
                'message': 'Kupon nem található'
            }, status=404)


class POSTransactionViewSet(viewsets.ModelViewSet):
    """ViewSet for POS transactions"""
    queryset = POSTransaction.objects.all()
    permission_classes = [AllowAny]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return POSTransactionCreateSerializer
        return POSTransactionSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by date range
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        # Filter by cashier
        cashier_id = self.request.query_params.get('cashier_id')
        if cashier_id:
            queryset = queryset.filter(cashier_id=cashier_id)
        
        # Filter by status
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        return queryset.select_related('customer', 'coupon', 'cashier').prefetch_related('items', 'payments')
    
    @action(detail=False, methods=['get'])
    def last_transaction(self, request):
        """Get last completed transaction for display"""
        last_transaction = POSTransaction.objects.filter(
            status='completed'
        ).order_by('-completed_at').first()
        
        if last_transaction:
            return Response({
                'exists': True,
                'total': float(last_transaction.total_gross),
                'change': float(last_transaction.amount_change or 0)
            })
        return Response({'exists': False})
    
    @action(detail=True, methods=['post'])
    def process_payment(self, request, pk=None):
        """Process payment for a transaction"""
        transaction = self.get_object()
        payment_method = transaction.payment_method
        
        if transaction.status == 'completed':
            return Response({'error': 'Transaction already completed'}, status=400)
        
        transaction.status = 'pending'
        transaction.save()
        
        # Create payment record
        payment = POSPayment.objects.create(
            transaction=transaction,
            amount=transaction.total_gross
        )
        
        try:
            if payment_method == 'cash':
                # Cash payment - automatically successful
                payment.status = 'success'
                payment.completed_at = timezone.now()
                payment.save()
                
                transaction.status = 'completed'
                transaction.completed_at = timezone.now()
                
                # Open cash drawer
                transaction.drawer_opened_at = timezone.now()
                transaction.save()
                
                # Increment coupon usage if applicable
                if transaction.coupon:
                    transaction.coupon.usage_count += 1
                    transaction.coupon.save()
                
                return Response({
                    'success': True,
                    'message': 'Készpénzes fizetés sikeres',
                    'transaction': POSTransactionSerializer(transaction).data
                })
            
            elif payment_method == 'card':
                # Credit card payment - simulate terminal communication
                # In production, this would integrate with actual payment terminal
                terminal_response = self._simulate_terminal_payment(transaction.total_gross)
                
                payment.terminal_id = request.data.get('terminal_id', 'TERMINAL_001')
                payment.terminal_transaction_id = terminal_response.get('transaction_id')
                payment.terminal_response_code = terminal_response.get('response_code')
                payment.terminal_response_message = terminal_response.get('message')
                
                if terminal_response.get('success'):
                    payment.status = 'success'
                    payment.completed_at = timezone.now()
                    payment.save()
                    
                    transaction.status = 'completed'
                    transaction.completed_at = timezone.now()
                    transaction.terminal_transaction_id = terminal_response.get('transaction_id')
                    transaction.terminal_response = str(terminal_response)
                    transaction.save()
                    
                    # Increment coupon usage if applicable
                    if transaction.coupon:
                        transaction.coupon.usage_count += 1
                        transaction.coupon.save()
                    
                    return Response({
                        'success': True,
                        'message': 'Kártyás fizetés sikeres',
                        'transaction': POSTransactionSerializer(transaction).data
                    })
                else:
                    payment.status = 'failed'
                    payment.save()
                    
                    transaction.status = 'failed'
                    transaction.save()
                    
                    return Response({
                        'success': False,
                        'message': terminal_response.get('message', 'Fizetés sikertelen'),
                        'error_code': terminal_response.get('response_code')
                    }, status=400)
            
            elif payment_method == 'customer_card':
                # Customer card - create delivery note
                delivery_note = self._create_delivery_note_for_pos(transaction)
                
                payment.status = 'success'
                payment.completed_at = timezone.now()
                payment.save()
                
                transaction.status = 'completed'
                transaction.completed_at = timezone.now()
                transaction.save()
                
                return Response({
                    'success': True,
                    'message': 'Ügyfélkártyás fizetés rögzítve',
                    'delivery_note_number': delivery_note.delivery_note_number,
                    'transaction': POSTransactionSerializer(transaction).data
                })
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            
            payment.status = 'failed'
            payment.terminal_response_message = str(e)
            payment.save()
            
            transaction.status = 'failed'
            transaction.save()
            
            return Response({
                'success': False,
                'message': f'Fizetés feldolgozási hiba: {str(e)}'
            }, status=500)
    
    @action(detail=True, methods=['post'])
    def send_receipt_email(self, request, pk=None):
        """Send receipt/invoice via email"""
        transaction = self.get_object()
        
        recipient = request.data.get('email')
        if not recipient:
            # Try to get email from customer or shopper
            recipient = transaction.customer_email
            if not recipient and transaction.customer:
                recipient = transaction.customer.email
        
        if not recipient:
            return Response({'error': 'No email address provided'}, status=400)
        
        # TODO: Implement email sending logic
        # This would integrate with the email system and potentially NAV API
        
        return Response({
            'success': True,
            'message': f'E-mail elküldve: {recipient}'
        })
    
    @action(detail=True, methods=['post'])
    def print_receipt(self, request, pk=None):
        """Mark transaction as printed and trigger printer"""
        transaction = self.get_object()
        transaction.printed_at = timezone.now()
        transaction.save()
        
        # TODO: Implement printer integration
        # This would send the receipt data to the thermal printer
        
        return Response({
            'success': True,
            'message': 'Nyomtatás elindítva'
        })
    
    @action(detail=True, methods=['post'])
    def cancel_transaction(self, request, pk=None):
        """Cancel a transaction"""
        transaction = self.get_object()
        
        if transaction.status == 'completed':
            return Response({'error': 'Cannot cancel completed transaction'}, status=400)
        
        transaction.status = 'cancelled'
        transaction.save()
        
        # Cancel all pending payments
        transaction.payments.filter(status='pending').update(status='cancelled')
        
        return Response({
            'success': True,
            'message': 'Tranzakció törölve'
        })
    
    def _simulate_terminal_payment(self, amount):
        """Simulate payment terminal response"""
        import random
        import uuid
        
        # Simulate 95% success rate
        success = random.random() < 0.95
        
        if success:
            return {
                'success': True,
                'transaction_id': str(uuid.uuid4())[:8].upper(),
                'response_code': '00',
                'message': 'Fizetés elfogadva'
            }
        else:
            error_codes = [
                ('51', 'Nincs fedezet'),
                ('05', 'Kártya elutasítva'),
                ('14', 'Érvénytelen kártya'),
                ('91', 'Terminal nem elérhető'),
            ]
            code, msg = random.choice(error_codes)
            return {
                'success': False,
                'transaction_id': str(uuid.uuid4())[:8].upper(),
                'response_code': code,
                'message': msg
            }
    
    def _create_delivery_note_for_pos(self, transaction):
        """Create delivery note for customer card payment"""
        from .models import DeliveryNote, DeliveryNoteItem, CustomerOrder, CustomerOrderItem
        import uuid
        
        # Generate delivery note number
        today = timezone.now().strftime('%Y%m%d')
        delivery_note_number = f"SZALL-POS-{today}-{str(uuid.uuid4())[:4].upper()}"
        
        # Create delivery note
        delivery_note = DeliveryNote.objects.create(
            delivery_note_number=delivery_note_number,
            customer=transaction.customer,
            issue_date=timezone.now().date(),
            created_by=transaction.cashier,
            notes=f"POS tranzakció: {transaction.transaction_number}"
        )
        
        # Since DeliveryNoteItem expects CustomerOrderItem, we would need to create
        # a customer order first, or modify the approach
        # For now, we'll just return the delivery note header
        
        return delivery_note


class POSTransactionItemViewSet(viewsets.ModelViewSet):
    """ViewSet for POS transaction items"""
    queryset = POSTransactionItem.objects.all()
    serializer_class = POSTransactionItemSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        transaction_id = self.request.query_params.get('transaction_id')
        if transaction_id:
            queryset = queryset.filter(transaction_id=transaction_id)
        return queryset


class POSPaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for POS payments (read-only, payments are created through transactions)"""
    queryset = POSPayment.objects.all()
    serializer_class = POSPaymentSerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        transaction_id = self.request.query_params.get('transaction_id')
        if transaction_id:
            queryset = queryset.filter(transaction_id=transaction_id)
        return queryset
