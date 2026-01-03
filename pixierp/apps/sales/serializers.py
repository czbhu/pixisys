from rest_framework import serializers
from .models import (
    Customer, Product, QuoteRequest, Quote, QuoteItem, QuoteRequestItem,
    Order, OrderItem, Lead, Opportunity, Forecast, Service, QuoteLog,
    QuoteRequestItemAttachment, QuoteRequestAttachment, QuoteRequestInvitation
)
from apps.manufacturing.models import ManufacturingProduct, Project
from apps.manufacturing.serializers import ProjectSerializer, ManufacturingProductSerializer
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
    manufacturing_product_name = serializers.CharField(source='manufacturing_product.name', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
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
    assignees = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(source='owner', read_only=True)
    owner_name = serializers.SerializerMethodField()
    invitations_pending = serializers.SerializerMethodField()
    
    class Meta:
        model = QuoteRequest
        fields = '__all__'

    def get_public_order_url(self, obj):
        request = self.context.get('request')
        if not obj.public_token:
            return None
        path = f"/api/v1/sales/quote-requests/public/{obj.public_token}/order/"
        if request:
            return request.build_absolute_uri(path)
        return path

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

class QuoteRequestInvitationSerializer(serializers.ModelSerializer):
    invitee_name = serializers.SerializerMethodField()
    quote_request_number = serializers.CharField(source='quote_request.number', read_only=True)
    class Meta:
        model = QuoteRequestInvitation
        fields = ['id', 'quote_request', 'quote_request_number', 'invitee', 'invitee_name', 'invited_by', 'status', 'created_at', 'responded_at']

    def get_invitee_name(self, obj):
        return obj.invitee.get_full_name() or obj.invitee.username

class ServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = '__all__'

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
