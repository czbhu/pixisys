from rest_framework import serializers
from .models import (
    Customer, Product, QuoteRequest, Quote, QuoteItem, QuoteRequestItem,
    Order, OrderItem, Lead, Opportunity, Forecast, QuoteLog,
    QuoteRequestItemAttachment, QuoteRequestAttachment, QuoteRequestInvitation,
    CustomerOrder, CustomerOrderItem, QuoteRequestCost, WorkLog
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
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)
    manufacturing_product_name = serializers.CharField(source='manufacturing_product.name', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_code = serializers.CharField(source='service.code', read_only=True)
    net_unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    net_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gross_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discounted_net_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discounted_gross_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    attachments = QuoteRequestItemAttachmentSerializer(many=True, read_only=True)
    
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
    service_name = serializers.SerializerMethodField()
    service_code = serializers.SerializerMethodField()
    item_type = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()
    # Price calculations
    net_total = serializers.SerializerMethodField()
    discounted_net_total = serializers.SerializerMethodField()
    gross_total = serializers.SerializerMethodField()
    discounted_gross_total = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomerOrderItem
        fields = '__all__'
        read_only_fields = ['id']
    
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
    
    def get_service_name(self, obj):
        return obj.quote_item.service.name if obj.quote_item and obj.quote_item.service else None

    def get_service_code(self, obj):
        return obj.quote_item.service.code if obj.quote_item and obj.quote_item.service else None
    
    def get_item_type(self, obj):
        return obj.quote_item.item_type if obj.quote_item else None
    
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
    customer_name = serializers.SerializerMethodField()
    quote_request_title = serializers.SerializerMethodField()
    project_id = serializers.SerializerMethodField()
    project_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    contact_names = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    deadline = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomerOrder
        fields = [
            'id', 'quote_request', 'quote_request_id', 'quote_request_title', 'customer_name',
            'order_number', 'status', 'order_date', 'total_amount',
            'project_id', 'project_name', 'created_by_name',
            'contact_names', 'contact_email', 'deadline',
            'confirmed_at', 'production_started_at', 'ready_at',
            'delivery_started_at', 'delivered_at',
            'notes', 'created_by', 'created_at', 'updated_at', 'items',
            'invoice_number'
        ]
    
    def get_total_amount(self, obj):
        """Calculate total amount from items"""
        total = 0
        for item in obj.items.all():
            net = item.net_unit_price * item.quantity
            discount = net * (item.discount_percent / 100)
            net_discounted = net - discount
            gross = net_discounted * (1 + item.vat_rate / 100)
            total += gross
        return round(total, 2)
    
    def get_customer_name(self, obj):
        if not obj.quote_request:
            return ''
        # Try company first (new), then customer (old) for backward compatibility
        if obj.quote_request.company:
            return obj.quote_request.company.name
        elif obj.quote_request.customer:
            return obj.quote_request.customer.name
        return ''
    
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

class QuoteRequestCostSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    material_name = serializers.CharField(source='material.name', read_only=True)
    
    class Meta:
        model = QuoteRequestCost
        fields = ['id', 'quote_request', 'material', 'material_name', 'code', 'name', 'quantity', 'unit', 'net_unit_price', 'net_total', 'supplier', 'supplier_name', 'is_stock', 'created_at']
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



