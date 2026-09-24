from rest_framework import serializers

from .models import (
    CustomerProductDiscount, FuelCard, FuelCardTransaction, LoyaltyConfig, LoyaltyPointEntry,
)


class LoyaltyConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyConfig
        fields = ['id', 'points_per_100_ft', 'welcome_points', 'qr_token_ttl_seconds', 'updated_at']


class LoyaltyPointEntrySerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LoyaltyPointEntry
        fields = ['id', 'customer', 'customer_name', 'points', 'reason', 'note',
                  'pos_transaction', 'created_by', 'created_by_name', 'created_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username


class FuelCardSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)

    class Meta:
        model = FuelCard
        fields = ['id', 'customer', 'customer_name', 'card_number', 'balance', 'is_active',
                  'created_at', 'updated_at']
        read_only_fields = ['balance']
        extra_kwargs = {'card_number': {'required': False, 'allow_blank': True}}


class FuelCardTransactionSerializer(serializers.ModelSerializer):
    card_number = serializers.CharField(source='card.card_number', read_only=True)

    class Meta:
        model = FuelCardTransaction
        fields = ['id', 'card', 'card_number', 'amount', 'note', 'pos_transaction',
                  'created_by', 'created_at']


class CustomerProductDiscountSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_code = serializers.CharField(source='material.code', read_only=True)

    class Meta:
        model = CustomerProductDiscount
        fields = ['id', 'customer', 'customer_name', 'material', 'material_name',
                  'material_code', 'discount_percent', 'is_active', 'created_at']
