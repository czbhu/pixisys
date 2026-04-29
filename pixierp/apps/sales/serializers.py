from rest_framework import serializers
from django.utils import timezone
from .models import (
    Customer, Product, QuoteRequest, Quote, QuoteItem, QuoteRequestItem,
    Order, OrderItem, Lead, Opportunity, Forecast, QuoteLog,
    QuoteRequestItemAttachment, QuoteRequestAttachment, QuoteRequestInvitation,
    CustomerOrder, CustomerOrderItem, QuoteRequestCost, WorkLog,
    ApprovalRequest,
    POSCustomerIdentification, POSCoupon, POSTransaction, POSTransactionItem, POSPayment
)
from apps.manufacturing.models import ManufacturingProduct, Project, Service
from apps.manufacturing.serializers import ProjectSerializer, ManufacturingProductSerializer, ServiceSerializer as ManufacturingServiceSerializer
from apps.crm.serializers import CompanySerializer, ContactSerializer
from apps.core.serializers import EmailServerConfigSerializer, EmailTemplateSerializer, SignatureTemplateSerializer

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = '__all__'

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'

class QuoteRequestItemAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    class Meta:
        model = QuoteRequestItemAttachment
        fields = ['id', 'file', 'file_url', 'remark', 'uploaded_by', 'created_at']
        read_only_fields = ['file_url', 'uploaded_by', 'created_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and hasattr(obj.file, 'url'):
            url = obj.file.url
            if request is not None:
                return request.build_absolute_uri(url)
            return url
        return None

class QuoteRequestAttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    class Meta:
        model = QuoteRequestAttachment
        fields = ['id', 'file', 'file_url', 'remark', 'uploaded_by', 'created_at']
        read_only_fields = ['file_url', 'uploaded_by', 'created_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and hasattr(obj.file, 'url'):
            url = obj.file.url
            if request is not None:
                return request.build_absolute_uri(url)
            return url
        return None

class QuoteRequestItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_code = serializers.CharField(source='product.code', read_only=True)
    product_description = serializers.CharField(source='product.description', read_only=True)
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    material_unit_cost_price = serializers.DecimalField(source='material.unit_cost_price', max_digits=12, decimal_places=2, read_only=True, allow_null=True, default=None)
    material_currency = serializers.CharField(source='material.currency', read_only=True, allow_null=True, default=None)
    manufacturing_product_name = serializers.CharField(source='manufacturing_product.name', read_only=True)
    manufacturing_product_code = serializers.CharField(source='manufacturing_product.code', read_only=True)
    manufacturing_product_description = serializers.CharField(source='manufacturing_product.description', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_code = serializers.CharField(source='service.code', read_only=True)
    service_unit_cost_price = serializers.DecimalField(source='service.unit_cost_price', max_digits=12, decimal_places=2, read_only=True, allow_null=True, default=None)
    service_currency = serializers.CharField(source='service.currency', read_only=True, allow_null=True, default=None)
    net_unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    net_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gross_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discounted_net_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discounted_gross_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    attachments = QuoteRequestItemAttachmentSerializer(many=True, read_only=True)
    is_ordered = serializers.SerializerMethodField()

    def get_is_ordered(self, obj):
        return obj.customerorderitem_set.exclude(customer_order__status='cancelled').exists()

    class Meta:
        model = QuoteRequestItem
        fields = '__all__'


class QuoteRequestSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    company_name = serializers.CharField(source='customer.company', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.get_full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    items = QuoteRequestItemSerializer(many=True, read_only=True)
    attachments = QuoteRequestAttachmentSerializer(many=True, read_only=True)
    company = CompanySerializer(read_only=True)
    contacts = ContactSerializer(many=True, read_only=True)
    contact_names = serializers.SerializerMethodField()
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    currency_symbol = serializers.CharField(source='currency.symbol', read_only=True)
    public_token = serializers.CharField(read_only=True)
    public_order_url = serializers.SerializerMethodField()
    assignee_names = serializers.SerializerMethodField()
    assignee_details = serializers.SerializerMethodField()
    assignees = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(source='owner', read_only=True)
    owner_name = serializers.SerializerMethodField()
    invitations_pending = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    total_net_amount = serializers.SerializerMethodField()
    
    class Meta:
        model = QuoteRequest
        fields = '__all__'

    def get_public_order_url(self, obj):
        from django.conf import settings
        if not obj.public_token:
            return None
        # Use FRONTEND_BASE_URL if configured, otherwise fallback to request URL
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', None)
        if not frontend_url:
            request = self.context.get('request')
            if request:
                frontend_url = f"{request.scheme}://{request.get_host()}"
            else:
                return None
        return f"{frontend_url}/public/quote/{obj.public_token}/order"

    def get_contact_names(self, obj):
        try:
            return ", ".join([c.name for c in obj.contacts.all()])
        except Exception:
            return ""

    def get_assignee_names(self, obj):
        try:
            return ", ".join([u.get_full_name() or u.username for u in obj.assignees.all()])
        except Exception:
            return ""

    def get_assignee_details(self, obj):
        try:
            return [{'id': u.id, 'name': u.get_full_name() or u.username} for u in obj.assignees.all()]
        except Exception:
            return []

    def get_owner_name(self, obj):
        try:
            u = obj.owner
            if not u:
                return ""
            return u.get_full_name() or u.username
        except Exception:
            return ""

    def get_invitations_pending(self, obj):
        try:
            invs = obj.invitations.filter(status='pending').select_related('invitee')
            return [
                {
                    'id': inv.id,
                    'invitee_id': inv.invitee_id,
                    'invitee_name': (inv.invitee.get_full_name() or inv.invitee.username),
                    'created_at': inv.created_at,
                }
                for inv in invs
            ]
        except Exception:
            return []
    
    def get_total_amount(self, obj):
        """Calculate total amount from items"""
        try:
            from decimal import Decimal
            total = Decimal('0.00')
            for item in obj.items.all():
                # Use discounted_gross_total if discount exists, otherwise gross_total
                if item.discount_percent and item.discount_percent > 0:
                    total += item.discounted_gross_total or Decimal('0.00')
                else:
                    total += item.gross_total or Decimal('0.00')
            return float(total)
        except Exception:
            return 0.00
    
    def get_total_net_amount(self, obj):
        """Calculate total net amount from items"""
        try:
            from decimal import Decimal
            total = Decimal('0.00')
            for item in obj.items.all():
                # Use discounted_net_total if discount exists, otherwise net_total
                if item.discount_percent and item.discount_percent > 0:
                    total += item.discounted_net_total or Decimal('0.00')
                else:
                    total += item.net_total or Decimal('0.00')
            return float(total)
        except Exception:
            return 0.00

class QuoteRequestInvitationSerializer(serializers.ModelSerializer):
    invitee_name = serializers.SerializerMethodField()
    quote_request_number = serializers.CharField(source='quote_request.number', read_only=True)
    
    # Tooltip fields
    company_name = serializers.SerializerMethodField()
    contact_names = serializers.SerializerMethodField()
    qr_title = serializers.CharField(source='quote_request.title', read_only=True)
    qr_description = serializers.CharField(source='quote_request.description', read_only=True)
    qr_internal_description = serializers.CharField(source='quote_request.internal_description', read_only=True)
    item_count = serializers.SerializerMethodField()
    issue_date = serializers.DateField(source='quote_request.issue_date', read_only=True)
    qr_deadline = serializers.DateField(source='quote_request.deadline', read_only=True)

    class Meta:
        model = QuoteRequestInvitation
        fields = ['id', 'quote_request', 'quote_request_number', 'invitee', 'invitee_name', 
                  'invited_by', 'status', 'created_at', 'responded_at',
                  'company_name', 'contact_names', 'qr_title', 'qr_description', 
                  'qr_internal_description', 'item_count', 'issue_date', 'qr_deadline']

    def get_invitee_name(self, obj):
        return obj.invitee.get_full_name() or obj.invitee.username

    def get_company_name(self, obj):
        if obj.quote_request and obj.quote_request.company:
            return obj.quote_request.company.name
        if obj.quote_request and obj.quote_request.customer:
             return obj.quote_request.customer.company
        return ""

    def get_contact_names(self, obj):
        try:
             if obj.quote_request:
                return ", ".join([str(c) for c in obj.quote_request.contacts.all()])
        except:
             pass
        return ""
    
    def get_item_count(self, obj):
        if obj.quote_request:
            return obj.quote_request.items.count()
        return 0

class ServiceSerializer(ManufacturingServiceSerializer):
    class Meta(ManufacturingServiceSerializer.Meta):
        pass

class QuoteLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    class Meta:
        model = QuoteLog
        fields = ['id', 'action', 'created_at', 'user', 'user_name']

class QuoteItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_unit = serializers.CharField(source='product.unit', read_only=True)
    product_code = serializers.CharField(source='product.code', read_only=True, default='')
    product_description = serializers.CharField(source='product.description', read_only=True, default='')
    
    class Meta:
        model = QuoteItem
        fields = '__all__'

class QuoteSerializer(serializers.ModelSerializer):
    items = QuoteItemSerializer(many=True, read_only=True)
    quote_request_title = serializers.CharField(source='quote_request.title', read_only=True)
    customer_name = serializers.CharField(source='quote_request.customer.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = Quote
        fields = '__all__'

class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_unit = serializers.CharField(source='product.unit', read_only=True)
    
    class Meta:
        model = OrderItem
        fields = '__all__'

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    quote_number = serializers.CharField(source='quote.quote_number', read_only=True)
    customer_name = serializers.CharField(source='quote.quote_request.customer.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    
    class Meta:
        model = Order
        fields = '__all__'

# Régi modelljeink serializerei
class LeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = '__all__'

class OpportunitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Opportunity
        fields = '__all__'

class ForecastSerializer(serializers.ModelSerializer):
    class Meta:
        model = Forecast
        fields = '__all__'


class CustomerOrderItemSerializer(serializers.ModelSerializer):
    quote_item = QuoteRequestItemSerializer(read_only=True)
    # Flatten nested quote_item fields for easier access
    product_name = serializers.SerializerMethodField()
    product_code = serializers.SerializerMethodField()
    material_name = serializers.SerializerMethodField()
    material_code = serializers.SerializerMethodField()
    manufacturing_product_name = serializers.SerializerMethodField()
    manufacturing_product_code = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()
    service_code = serializers.SerializerMethodField()
    item_type = serializers.SerializerMethodField()
    # Descriptions
    product_description = serializers.SerializerMethodField()
    internal_description = serializers.SerializerMethodField()
    
    attachments = serializers.SerializerMethodField()
    # Price calculations
    net_total = serializers.SerializerMethodField()
    discounted_net_total = serializers.SerializerMethodField()
    gross_total = serializers.SerializerMethodField()
    discounted_gross_total = serializers.SerializerMethodField()
    
    suggested_workflow = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomerOrderItem
        fields = '__all__'
        read_only_fields = ['id']
    
    def get_suggested_workflow(self, obj):
        try:
            # Check for related QuoteRequest costs
            # Logic: First cost where unit != 'db'
            # Access quote_request via customer_order
            if obj.customer_order and obj.customer_order.quote_request:
                costs = obj.customer_order.quote_request.costs.all()
                # Prioritize non-piece units
                non_piece_cost = costs.exclude(unit='db').first()
                if non_piece_cost:
                    return non_piece_cost.name
                
                # Fallback to first cost if any exists
                first_cost = costs.first()
                if first_cost:
                    return first_cost.name
        except Exception:
            pass
        return None

    def get_net_total(self, obj):
        """Calculate net total: quantity * net_unit_price"""
        return float(obj.quantity * obj.net_unit_price)
    
    def get_discounted_net_total(self, obj):
        """Calculate discounted net total"""
        net_total = obj.quantity * obj.net_unit_price
        discount = net_total * (obj.discount_percent / 100)
        return float(net_total - discount)
    
    def get_gross_total(self, obj):
        """Calculate gross total with VAT"""
        net_total = obj.quantity * obj.net_unit_price
        return float(net_total * (1 + obj.vat_rate / 100))
    
    def get_discounted_gross_total(self, obj):
        """Calculate discounted gross total with VAT"""
        net_total = obj.quantity * obj.net_unit_price
        discount = net_total * (obj.discount_percent / 100)
        discounted_net = net_total - discount
        return float(discounted_net * (1 + obj.vat_rate / 100))
    
    def get_product_name(self, obj):
        return obj.quote_item.product.name if obj.quote_item and obj.quote_item.product else None
    
    def get_product_code(self, obj):
        # Retrieve code from Product model if available, else None
        if obj.quote_item and obj.quote_item.product and hasattr(obj.quote_item.product, 'code'):
            return obj.quote_item.product.code
        return None
    
    def get_material_name(self, obj):
        return obj.quote_item.material.name if obj.quote_item and obj.quote_item.material else None
    
    def get_material_code(self, obj):
        return obj.quote_item.material.code if obj.quote_item and obj.quote_item.material else None
    
    def get_manufacturing_product_name(self, obj):
        return obj.quote_item.manufacturing_product.name if obj.quote_item and obj.quote_item.manufacturing_product else None
    
    def get_manufacturing_product_code(self, obj):
        return obj.quote_item.manufacturing_product.code if obj.quote_item and obj.quote_item.manufacturing_product else None
    
    def get_service_name(self, obj):
        return obj.quote_item.service.name if obj.quote_item and obj.quote_item.service else None

    def get_service_code(self, obj):
        return obj.quote_item.service.code if obj.quote_item and obj.quote_item.service else None
    
    def get_item_type(self, obj):
        return obj.quote_item.item_type if obj.quote_item else None

    def get_product_description(self, obj):
        if not obj.quote_item: return ""
        qi = obj.quote_item
        if qi.product: return qi.product.description
        if qi.manufacturing_product: return qi.manufacturing_product.description
        if qi.service: return qi.service.description
        if qi.material: return ""
        return ""
    
    def get_internal_description(self, obj):
        if not obj.quote_item: return ""
        qi = obj.quote_item
        if qi.manufacturing_product: return qi.manufacturing_product.internal_description
        return ""
    
    def get_attachments(self, obj):
        """Get attachments from the related quote_item"""
        if obj.quote_item:
            return QuoteRequestItemAttachmentSerializer(obj.quote_item.attachments.all(), many=True).data
        return []


class CustomerOrderSerializer(serializers.ModelSerializer):
    items = CustomerOrderItemSerializer(many=True, read_only=True)
    quote_request = QuoteRequestSerializer(read_only=True)
    quote_request_id = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    total_net_amount = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    is_private = serializers.SerializerMethodField()
    quote_request_title = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    contact_names = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    deadline = serializers.SerializerMethodField()
    pending_approval = serializers.SerializerMethodField()
    last_rejection = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomerOrder
        fields = [
            'id', 'quote_request', 'quote_request_id', 'quote_request_title', 'customer_name', 'is_private',
            'order_number', 'delivery_note_number', 'status', 'order_date', 'total_amount', 'total_net_amount',
            'project_id', 'project_name', 'created_by_name',
            'contact_names', 'contact_email', 'deadline',
            'confirmed_at', 'production_started_at', 'ready_at',
            'delivery_started_at', 'delivered_at',
            'notes', 'created_by', 'created_at', 'updated_at', 'items',
            'invoice_number', 'pending_approval', 'last_rejection'
        ]
    
    def get_pending_approval(self, obj):
        # Return pending request info if any
        # Accessing reverse relation 'approval_requests'
        req = obj.approval_requests.filter(status='pending').first()
        if req:
            return {
                'id': req.id,
                'requested_status': req.requested_status,
                'previous_status': req.previous_status,
                'requester': req.requester.get_full_name() or req.requester.username
            }
        return None

    def get_last_rejection(self, obj):
        req = obj.approval_requests.order_by('-created_at').first()
        if req and req.status == 'rejected':
            return {'note': req.rejection_details, 'date': req.updated_at}
        return None

    def get_total_amount(self, obj):
        """Calculate total amount from items (Bruttó)"""
        total = 0
        for item in obj.items.all():
            net = item.net_unit_price * item.quantity
            discount = net * (item.discount_percent / 100)
            net_discounted = net - discount
            gross = net_discounted * (1 + item.vat_rate / 100)
            total += gross
        return round(total, 2)

    def get_total_net_amount(self, obj):
        """Calculate total net amount from items"""
        total = 0
        for item in obj.items.all():
            net = item.net_unit_price * item.quantity
            discount = net * (item.discount_percent / 100)
            net_discounted = net - discount
            total += net_discounted
        return round(total, 2)
    
    def get_customer_name(self, obj):
        if not obj.quote_request:
            return ''
        # Try company first (new), then customer (old) for backward compatibility
        if obj.quote_request.company:
            return obj.quote_request.company.name
        elif obj.quote_request.customer:
            return obj.quote_request.customer.name
        # Fallback: first contact's company name (legacy data without company FK)
        try:
            first_contact = obj.quote_request.contacts.first()
            if first_contact and getattr(first_contact, 'company', None):
                return first_contact.company.name or ''
        except Exception:
            pass
        return ''

    def get_is_private(self, obj):
        try:
            if not obj.quote_request:
                return False
            qr = obj.quote_request
            if qr.company:
                return qr.company.vat_status == 'PRIVATE_PERSON'
            if qr.customer_id:
                return False
            # Fallback: if any contact has a linked company, treat as company order
            if qr.contacts.filter(company__isnull=False).exists():
                return False
            # No company, no old customer, no contact-company → private person
            return True
        except Exception:
            return False

    def get_quote_request_id(self, obj):
        """Get quote_request ID for navigation"""
        return obj.quote_request.id if obj.quote_request else None
    
    def get_quote_request_title(self, obj):
        return obj.quote_request.title if obj.quote_request else ''
    
    def get_project_id(self, obj):
        return obj.quote_request.project_id if obj.quote_request else None
    
    def get_project_name(self, obj):
        if obj.quote_request and obj.quote_request.project:
            return obj.quote_request.project.name
        return None
    
    def get_created_by_name(self, obj):
        """Get created_by name from CustomerOrder.created_by, fallback to quote_request creator"""
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        # Fallback to quote_request creator
        if obj.quote_request:
            if obj.quote_request.created_by:
                return obj.quote_request.created_by.get_full_name() or obj.quote_request.created_by.username
            elif obj.quote_request.requested_by:
                return obj.quote_request.requested_by.get_full_name() or obj.quote_request.requested_by.username
        return ''
    
    def get_contact_names(self, obj):
        """Get contact names from quote_request"""
        if obj.quote_request:
            try:
                return ", ".join([c.name for c in obj.quote_request.contacts.all()])
            except Exception:
                return ''
        return ''
    
    def get_contact_email(self, obj):
        """Get first contact email from quote_request for delivery notifications"""
        if obj.quote_request:
            try:
                first_contact = obj.quote_request.contacts.first()
                return first_contact.email if first_contact else ''
            except Exception:
                return ''
        return ''
    
    def get_deadline(self, obj):
        """Get deadline from quote_request"""
        return obj.quote_request.deadline if obj.quote_request else None


class CustomerOrderListItemSerializer(serializers.ModelSerializer):
    quote_item_id = serializers.IntegerField(source='quote_item.id', read_only=True)
    product_name = serializers.CharField(source='quote_item.product.name', read_only=True)
    product_code = serializers.CharField(source='quote_item.product.code', read_only=True)
    material_name = serializers.CharField(source='quote_item.material.name', read_only=True)
    material_code = serializers.CharField(source='quote_item.material.code', read_only=True)
    manufacturing_product_name = serializers.CharField(source='quote_item.manufacturing_product.name', read_only=True)
    manufacturing_product_code = serializers.CharField(source='quote_item.manufacturing_product.code', read_only=True)
    service_name = serializers.CharField(source='quote_item.service.name', read_only=True)
    service_code = serializers.CharField(source='quote_item.service.code', read_only=True)
    product_description = serializers.SerializerMethodField()
    internal_description = serializers.SerializerMethodField()
    net_total = serializers.SerializerMethodField()
    supplier_name = serializers.SerializerMethodField()

    class Meta:
        model = CustomerOrderItem
        fields = [
            'id', 'quote_item_id', 'quantity', 'unit', 'net_unit_price', 'vat_rate', 'discount_percent',
            'description', 'status', 'product_name', 'product_code', 'material_name', 'material_code',
            'manufacturing_product_name', 'manufacturing_product_code', 'service_name', 'service_code',
            'product_description', 'internal_description', 'net_total', 'supplier_name'
        ]

    def get_product_description(self, obj):
        qi = getattr(obj, 'quote_item', None)
        if not qi:
            return ""
        if getattr(qi, 'product', None):
            return qi.product.description or ""
        if getattr(qi, 'manufacturing_product', None):
            return qi.manufacturing_product.description or ""
        if getattr(qi, 'service', None):
            return qi.service.description or ""
        return ""

    def get_internal_description(self, obj):
        qi = getattr(obj, 'quote_item', None)
        if qi and getattr(qi, 'manufacturing_product', None):
            return qi.manufacturing_product.internal_description or ""
        return ""

    def get_net_total(self, obj):
        try:
            return float(obj.quantity * obj.net_unit_price)
        except Exception:
            return 0.0

    def get_supplier_name(self, obj):
        try:
            qi = getattr(obj, 'quote_item', None)
            if qi and getattr(qi, 'supplier_name', None):
                return qi.supplier_name
        except Exception:
            pass
        return None


class CustomerOrderListSerializer(serializers.ModelSerializer):
    quote_request_id = serializers.SerializerMethodField()
    total_amount = serializers.SerializerMethodField()
    total_net_amount = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    is_private = serializers.SerializerMethodField()
    quote_request_title = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    contact_names = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    deadline = serializers.SerializerMethodField()
    pending_approval = serializers.SerializerMethodField()
    last_rejection = serializers.SerializerMethodField()

    class Meta:
        model = CustomerOrder
        fields = [
            'id', 'quote_request_id', 'quote_request_title', 'customer_name', 'is_private',
            'order_number', 'delivery_note_number', 'status', 'order_date', 'total_amount', 'total_net_amount',
            'project_id', 'project_name', 'created_by_name',
            'contact_names', 'contact_email', 'deadline',
            'confirmed_at', 'production_started_at', 'ready_at',
            'delivery_started_at', 'delivered_at',
            'notes', 'created_by', 'created_at', 'updated_at',
            'invoice_number', 'pending_approval', 'last_rejection'
        ]

    def _iter_items(self, obj):
        return obj.items.all()

    def get_pending_approval(self, obj):
        req = obj.approval_requests.filter(status='pending').first()
        if req:
            return {
                'id': req.id,
                'requested_status': req.requested_status,
                'previous_status': req.previous_status,
                'requester': req.requester.get_full_name() or req.requester.username
            }
        return None

    def get_last_rejection(self, obj):
        req = obj.approval_requests.order_by('-created_at').first()
        if req and req.status == 'rejected':
            return {'note': req.rejection_details, 'date': req.updated_at}
        return None

    def get_total_amount(self, obj):
        total = 0
        for item in self._iter_items(obj):
            net = item.net_unit_price * item.quantity
            discount = net * (item.discount_percent / 100)
            net_discounted = net - discount
            gross = net_discounted * (1 + item.vat_rate / 100)
            total += gross
        return round(total, 2)

    def get_total_net_amount(self, obj):
        total = 0
        for item in self._iter_items(obj):
            net = item.net_unit_price * item.quantity
            discount = net * (item.discount_percent / 100)
            total += (net - discount)
        return round(total, 2)

    def get_customer_name(self, obj):
        if not obj.quote_request:
            return ''
        if obj.quote_request.company:
            return obj.quote_request.company.name
        if obj.quote_request.customer:
            return obj.quote_request.customer.name
        # Fallback: first contact's company name (legacy data without company FK)
        try:
            first_contact = obj.quote_request.contacts.first()
            if first_contact and getattr(first_contact, 'company', None):
                return first_contact.company.name or ''
        except Exception:
            pass
        return ''

    def get_is_private(self, obj):
        try:
            if not obj.quote_request:
                return False
            qr = obj.quote_request
            if qr.company:
                return qr.company.vat_status == 'PRIVATE_PERSON'
            if qr.customer_id:
                return False
            # Fallback: if any contact has a linked company, treat as company order
            if qr.contacts.filter(company__isnull=False).exists():
                return False
            # No company, no old customer, no contact-company → private person
            return True
        except Exception:
            return False

    def get_quote_request_id(self, obj):
        return obj.quote_request.id if obj.quote_request else None

    def get_quote_request_title(self, obj):
        return obj.quote_request.title if obj.quote_request else ''

    def get_project_id(self, obj):
        return obj.quote_request.project_id if obj.quote_request else None

    def get_project_name(self, obj):
        if obj.quote_request and obj.quote_request.project:
            return obj.quote_request.project.name
        return None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        if obj.quote_request:
            if obj.quote_request.created_by:
                return obj.quote_request.created_by.get_full_name() or obj.quote_request.created_by.username
            if obj.quote_request.requested_by:
                return obj.quote_request.requested_by.get_full_name() or obj.quote_request.requested_by.username
        return ''

    def get_contact_names(self, obj):
        if obj.quote_request:
            try:
                return ", ".join([c.name for c in obj.quote_request.contacts.all()])
            except Exception:
                return ''
        return ''

    def get_contact_email(self, obj):
        if obj.quote_request:
            try:
                first_contact = obj.quote_request.contacts.first()
                return first_contact.email if first_contact else ''
            except Exception:
                return ''
        return ''

    def get_deadline(self, obj):
        return obj.quote_request.deadline if obj.quote_request else None


class CustomerOrderListWithItemsSerializer(CustomerOrderListSerializer):
    items = CustomerOrderListItemSerializer(many=True, read_only=True)

    class Meta(CustomerOrderListSerializer.Meta):
        fields = CustomerOrderListSerializer.Meta.fields + ['items']


class InvoiceableOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='quote_item.product.name', read_only=True)
    product_code = serializers.CharField(source='quote_item.product.code', read_only=True)
    material_name = serializers.CharField(source='quote_item.material.name', read_only=True)
    material_code = serializers.CharField(source='quote_item.material.code', read_only=True)
    manufacturing_product_name = serializers.CharField(source='quote_item.manufacturing_product.name', read_only=True)
    manufacturing_product_code = serializers.CharField(source='quote_item.manufacturing_product.code', read_only=True)
    service_name = serializers.CharField(source='quote_item.service.name', read_only=True)
    service_code = serializers.CharField(source='quote_item.service.code', read_only=True)

    class Meta:
        model = CustomerOrderItem
        fields = [
            'id', 'quantity', 'unit', 'net_unit_price', 'discount_percent', 'vat_rate',
            'product_name', 'product_code', 'material_name', 'material_code',
            'manufacturing_product_name', 'manufacturing_product_code', 'service_name', 'service_code'
        ]


class InvoiceableOrderSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    contact_names = serializers.SerializerMethodField()
    is_private = serializers.SerializerMethodField()
    company = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    net_total = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = CustomerOrder
        fields = [
            'id', 'order_number', 'order_date', 'invoice_number',
            'customer_name', 'contact_names', 'is_private', 'company', 'customer', 'net_total', 'items'
        ]

    def get_customer_name(self, obj):
        qr = getattr(obj, 'quote_request', None)
        if not qr:
            return ''
        if getattr(qr, 'company', None):
            return qr.company.name or ''
        if getattr(qr, 'customer', None):
            return qr.customer.name or qr.customer.company or ''
        return ''

    def get_contact_names(self, obj):
        qr = getattr(obj, 'quote_request', None)
        if not qr:
            return ''
        try:
            return ', '.join([c.name for c in qr.contacts.all()])
        except Exception:
            return ''

    def get_is_private(self, obj):
        try:
            if not obj.quote_request:
                return False
            qr = obj.quote_request
            if qr.company:
                return qr.company.vat_status == 'PRIVATE_PERSON'
            return not qr.customer_id
        except Exception:
            return False

    def get_company(self, obj):
        qr = getattr(obj, 'quote_request', None)
        comp = getattr(qr, 'company', None) if qr else None
        if not comp:
            return None
        return {
            'id': comp.id,
            'name': comp.name,
            'tax_number': comp.tax_number,
            'city': comp.city,
            'postal_code': comp.postal_code,
            'address': comp.address,
        }

    def get_customer(self, obj):
        qr = getattr(obj, 'quote_request', None)
        cust = getattr(qr, 'customer', None) if qr else None
        if not cust:
            return None
        return {
            'id': cust.id,
            'name': getattr(cust, 'name', ''),
            'company': getattr(cust, 'company', ''),
            'email': getattr(cust, 'email', ''),
            'phone': getattr(cust, 'phone', ''),
            'address': getattr(cust, 'address', ''),
            'tax_number': getattr(cust, 'tax_number', ''),
        }

    def get_net_total(self, obj):
        total = 0
        for item in obj.items.all():
            net = item.quantity * item.net_unit_price
            discount = net * (item.discount_percent / 100)
            total += (net - discount)
        return round(total, 2)

    def get_items(self, obj):
        # Already invoiced orders don't need item payload on list page.
        if obj.invoice_number:
            return []
        return InvoiceableOrderItemSerializer(obj.items.all(), many=True).data

class QuoteRequestCostSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    material_name = serializers.CharField(source='material.name', read_only=True)
    
    class Meta:
        model = QuoteRequestCost
        fields = ['id', 'quote_request', 'material', 'material_name', 'code', 'name', 'quantity', 'unit', 'net_unit_price', 'net_total', 'supplier', 'supplier_name', 'is_stock', 'currency_code', 'created_at']
        read_only_fields = ['net_total', 'created_at']

class WorkLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    customer_order_number = serializers.CharField(source='customer_order.order_number', read_only=True)
    customer_name = serializers.SerializerMethodField()
    item_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkLog
        fields = '__all__'
        read_only_fields = ['created_at']

    def get_customer_name(self, obj):
        try:
            if obj.customer_order and obj.customer_order.quote_request and obj.customer_order.quote_request.company:
                return obj.customer_order.quote_request.company.name
        except Exception:
            pass
        return None

    def get_item_name(self, obj):
        try:
            if obj.item:
                return obj.item.description
        except Exception:
            pass
        return None

from .models import ChatThread, ChatMessage, ChatMessageAttachment

class ChatMessageAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessageAttachment
        fields = '__all__'

class ChatMessageSerializer(serializers.ModelSerializer):
    attachments = ChatMessageAttachmentSerializer(many=True, read_only=True)
    sender_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ChatMessage
        fields = '__all__'
        read_only_fields = ['created_at', 'sender']

    def get_sender_name(self, obj):
        if obj.sender:
            full_name = obj.sender.get_full_name()
            return full_name if full_name else obj.sender.username
        return "Unknown"

class ChatThreadSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    # Could optimize to not returning all messages always, but for now OK
    
    class Meta:
        model = ChatThread
        fields = '__all__'

from .models import DeliveryNote, DeliveryNoteItem

class DeliveryNoteItemSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='customer_order_item.customer_order.order_number', read_only=True)
    delivery_note_number = serializers.CharField(source='delivery_note.delivery_note_number', read_only=True)
    issue_date = serializers.DateField(source='delivery_note.issue_date', read_only=True)
    customer_name = serializers.CharField(source='delivery_note.customer.name', read_only=True)
    contact_name = serializers.CharField(source='delivery_note.contact.name', read_only=True)
    contact_names = serializers.SerializerMethodField()
    notes = serializers.CharField(source='delivery_note.notes', read_only=True)
    is_confirmed = serializers.BooleanField(source='delivery_note.is_confirmed', read_only=True)
    confirmed_by_info = serializers.CharField(source='delivery_note.confirmed_by_info', read_only=True)
    confirmed_at = serializers.DateTimeField(source='delivery_note.confirmed_at', read_only=True)
    confirmed_by_user_name = serializers.CharField(source='delivery_note.confirmed_by_user.get_full_name', read_only=True)
    delivery_note_public_url = serializers.SerializerMethodField()
    item_code = serializers.SerializerMethodField()

    class Meta:
        model = DeliveryNoteItem
        fields = '__all__'

    def get_item_code(self, obj):
        try:
            qi = obj.customer_order_item.quote_item
            if qi.product: return "" # Product model has no code field apparently
            if qi.material: return qi.material.code
            if qi.service: return qi.service.code
            # Manufacturing?
        except:
            pass
        return ""

    def get_contact_names(self, obj):
        # Infer contacts from the Customer Order -> Quote Request
        try:
            # Go up to Order -> QuoteRequest
            qr = obj.customer_order_item.customer_order.quote_request
            if qr and qr.contacts.exists():
                return ", ".join([c.name for c in qr.contacts.all()])
        except:
            pass
        # Fallback to DeliveryNote contact 
        if obj.delivery_note.contact:
            return obj.delivery_note.contact.name
        return ""

    def get_delivery_note_public_url(self, obj):
        dn = obj.delivery_note
        if not dn.public_token:
            import secrets
            dn.public_token = secrets.token_urlsafe(24)
            dn.save(update_fields=['public_token'])
        from django.conf import settings
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', '')
        return f"{frontend_url}/public/delivery-note/{dn.public_token}"

class DeliveryNoteSerializer(serializers.ModelSerializer):
    items = DeliveryNoteItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    customer_address = serializers.CharField(source='customer.full_address', read_only=True)
    contact_name = serializers.CharField(source='contact.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    confirmed_by_user_name = serializers.CharField(source='confirmed_by_user.get_full_name', read_only=True)
    
    # Computed totals
    total_quantity = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    public_url = serializers.SerializerMethodField()
    customer_contacts = serializers.SerializerMethodField()
    supplier_info = serializers.SerializerMethodField()

    
    # For writing
    items_data = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False
    )
    
    class Meta:
        model = DeliveryNote
        fields = '__all__'
        read_only_fields = ['delivery_note_number', 'created_by', 'confirmed_by_user', 'confirmed_at', 'created_at', 'updated_at']
        
    def get_total_quantity(self, obj):
        return sum(item.quantity for item in obj.items.all())
        
    def get_item_count(self, obj):
        return obj.items.count()

    def get_public_url(self, obj):
        if not obj.public_token:
            import secrets
            obj.public_token = secrets.token_urlsafe(24)
            obj.save(update_fields=['public_token'])
        from django.conf import settings
        frontend_url = getattr(settings, 'FRONTEND_BASE_URL', '')
        return f"{frontend_url}/public/delivery-note/{obj.public_token}"

    def get_customer_contacts(self, obj):
        contacts = []
        # Gather contacts from QuoteRequests associated with the items
        # Usually a DN is for one Customer, possibly multiple Orders
        # We find unique contacts attached to the orders' quote requests.
        seen_ids = set()
        
        # Optimize: get relevant order IDs first
        from .models import CustomerOrderItem
        # Use relation paths
        order_ids = obj.items.values_list('customer_order_item__customer_order_id', flat=True).distinct()
        
        # Now get contacts across those orders (via QuoteRequest)
        # We need to import models or do deep query
        # Easier to iterate if few
        for item in obj.items.all():
            try:
                co = item.customer_order_item.customer_order
                qr = co.quote_request
                for c in qr.contacts.all():
                    if c.id not in seen_ids:
                        contacts.append({
                            'name': c.name,
                            'email': c.email,
                            'phone': c.phone,
                            'position': c.position
                        })
                        seen_ids.add(c.id)
            except:
                pass
                
        # If no specific contacts on quote, maybe fallback to Customer company contacts? 
        # User said "Csak azokat... akik az ajánlathoz...". So if empty, maybe show none.
        return contacts

    def get_supplier_info(self, obj):
        from apps.core.models import Company
        company = Company.objects.filter(is_default=True).first()
        if not company:
            company = Company.objects.first()
        if company:
            return {
                'name': company.name,
                'address': company.address,
                'tax_number': company.tax_number,
                'email': company.email,
                'phone': company.phone
            }
        return {}


    def create(self, validated_data):
        items_data = validated_data.pop('items_data', [])
        
        # Ensure issue_date is a date object to prevent AssertionError in to_representation
        if 'issue_date' not in validated_data:
            validated_data['issue_date'] = timezone.now().date()
            
        delivery_note = super().create(validated_data)
        
        for item_data in items_data:
            # item_data should have 'customer_order_item' (ID) and 'quantity'
            # If the key is 'customer_order_item' and value is an ID, we need to use 'customer_order_item_id'
            if 'customer_order_item' in item_data and isinstance(item_data['customer_order_item'], (int, str)):
                item_data['customer_order_item_id'] = item_data.pop('customer_order_item')
                
            DeliveryNoteItem.objects.create(
                delivery_note=delivery_note,
                **item_data
            )
        return delivery_note




class ApprovalRequestSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='requester.username', read_only=True)
    full_name = serializers.SerializerMethodField()
    order_number = serializers.CharField(source='customer_order.order_number', read_only=True)
    description = serializers.CharField(source='customer_order.quote_request.title', read_only=True)
    internal_description = serializers.CharField(source='customer_order.quote_request.internal_description', read_only=True)
    
    class Meta:
        model = ApprovalRequest
        fields = '__all__'
        
    def get_full_name(self, obj):
        if obj.requester:
            return f"{obj.requester.last_name} {obj.requester.first_name}"
        return ""


# ==================== POS Serializers ====================

class POSCustomerIdentificationSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    
    class Meta:
        model = POSCustomerIdentification
        fields = '__all__'


class POSCouponSerializer(serializers.ModelSerializer):
    is_valid_now = serializers.SerializerMethodField()
    
    class Meta:
        model = POSCoupon
        fields = '__all__'
    
    def get_is_valid_now(self, obj):
        return obj.is_valid()


class POSTransactionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = POSTransactionItem
        fields = '__all__'
        read_only_fields = ['net_total', 'vat_amount', 'gross_total']


class POSPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = POSPayment
        fields = '__all__'


class POSTransactionSerializer(serializers.ModelSerializer):
    items = POSTransactionItemSerializer(many=True, read_only=True)
    payments = POSPaymentSerializer(many=True, read_only=True)
    cashier_name = serializers.SerializerMethodField()
    customer_name_display = serializers.SerializerMethodField()
    
    class Meta:
        model = POSTransaction
        fields = '__all__'
        read_only_fields = ['subtotal', 'discount_amount', 'total_net', 'total_vat', 'total_gross', 'amount_change']
    
    def get_cashier_name(self, obj):
        if obj.cashier:
            return f"{obj.cashier.last_name} {obj.cashier.first_name}"
        return ""
    
    def get_customer_name_display(self, obj):
        if obj.customer:
            return obj.customer.name
        return obj.customer_name or "Nyugtás"


class POSTransactionCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating POS transactions with items"""
    items = POSTransactionItemSerializer(many=True)
    
    class Meta:
        model = POSTransaction
        fields = ['transaction_type', 'payment_method', 'customer', 'customer_name', 
                  'customer_address', 'customer_tax_number', 'customer_email',
                  'shopper_identification', 'shopper_name', 'coupon', 'amount_received', 'items']
    
    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        
        # Generate transaction number
        from django.utils import timezone
        import random
        today = timezone.now().strftime('%Y%m%d')
        random_part = str(random.randint(1000, 9999))
        transaction_number = f"POS-{today}-{random_part}"
        
        transaction = POSTransaction.objects.create(
            transaction_number=transaction_number,
            cashier=self.context['request'].user if 'request' in self.context else None,
            status='draft',
            **validated_data
        )
        
        # Create items
        for item_data in items_data:
            POSTransactionItem.objects.create(transaction=transaction, **item_data)
        
        # Calculate totals
        transaction.calculate_totals()
        
        return transaction
