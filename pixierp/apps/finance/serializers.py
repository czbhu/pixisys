from rest_framework import serializers
from .models import (
    Invoice, InvoiceItem, Payment, CashRegister, CashRegisterEmployee,
    CashRegisterTransaction, CashTransactionReason
)
from apps.core.models import Currency, EmailServerConfig
from apps.hr.models import Employee
from django.contrib.auth import get_user_model
from django.core.mail import send_mail, get_connection, EmailMultiAlternatives
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

User = get_user_model()


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = '__all__'


class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = '__all__'


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = '__all__'


class CashTransactionReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashTransactionReason
        fields = '__all__'


class CashRegisterEmployeeSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.user.get_full_name', read_only=True)
    employee_username = serializers.CharField(source='employee.user.username', read_only=True)

    class Meta:
        model = CashRegisterEmployee
        fields = ['id', 'cash_register', 'employee', 'employee_name', 'employee_username', 
                  'can_deposit', 'can_withdraw', 'can_view', 'created_at', 'updated_at']


class CashRegisterSerializer(serializers.ModelSerializer):
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    currency_symbol = serializers.CharField(source='currency.symbol', read_only=True)
    employee_permissions = CashRegisterEmployeeSerializer(many=True, read_only=True)
    employees = serializers.PrimaryKeyRelatedField(
        many=True, 
        queryset=Employee.objects.all(), 
        write_only=True, 
        required=False
    )
    notify_user_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Employee.objects.all(),
        source='notify_users',
        required=False
    )
    transaction_view_employee_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Employee.objects.all(),
        source='transaction_view_employees',
        required=False
    )

    class Meta:
        model = CashRegister
        fields = ['id', 'name', 'location', 'currency', 'currency_code', 'currency_symbol',
                  'initial_balance', 'current_balance', 'is_active', 'email_notify_on_deposit',
                  'email_notify_on_withdrawal', 'notify_user_ids', 'transaction_view_employee_ids',
                  'created_at', 'updated_at', 'created_by', 'employee_permissions', 'employees']
        read_only_fields = ['current_balance', 'created_by']

    def create(self, validated_data):
        employees = validated_data.pop('employees', [])
        notify_users = validated_data.pop('notify_users', [])
        transaction_view_employees = validated_data.pop('transaction_view_employees', [])
        user = self.context['request'].user
        # Get or create employee profile for the current user
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
            # Handle case where user doesn't have employee profile
            employee = None
        validated_data['created_by'] = employee
        validated_data['current_balance'] = validated_data.get('initial_balance', 0)
        
        cash_register = CashRegister.objects.create(**validated_data)
        
        # Set notify users
        if notify_users:
            cash_register.notify_users.set(notify_users)
        
        # Set transaction view employees
        if transaction_view_employees:
            cash_register.transaction_view_employees.set(transaction_view_employees)
        
        # Create employee permissions with requested behavior:
        # - employees: can_deposit/can_withdraw (no can_view)
        # - transaction_view_employees: can_view + can_deposit + can_withdraw
        employee_set = set(employees)
        transaction_view_set = set(transaction_view_employees)
        all_employees = employee_set | transaction_view_set
        for emp in all_employees:
            CashRegisterEmployee.objects.create(
                cash_register=cash_register,
                employee=emp,
                can_deposit=(emp in employee_set) or (emp in transaction_view_set),
                can_withdraw=(emp in employee_set) or (emp in transaction_view_set),
                can_view=emp in transaction_view_set
            )
        
        return cash_register

    def update(self, instance, validated_data):
        employees = validated_data.pop('employees', None)
        notify_users = validated_data.pop('notify_users', None)
        transaction_view_employees = validated_data.pop('transaction_view_employees', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update notify users if provided
        if notify_users is not None:
            instance.notify_users.set(notify_users)
        
        # Update transaction view employees if provided
        if transaction_view_employees is not None:
            instance.transaction_view_employees.set(transaction_view_employees)
        
        # Update employee permissions if provided
        if employees is not None or transaction_view_employees is not None:
            # Remove existing permissions
            instance.employee_permissions.all().delete()
            # Create new permissions with requested behavior
            emp_list = employees if employees is not None else []
            tv_emp_list = transaction_view_employees if transaction_view_employees is not None else list(instance.transaction_view_employees.all())
            emp_set = set(emp_list)
            tv_emp_set = set(tv_emp_list)
            all_employees = emp_set | tv_emp_set
            for emp in all_employees:
                CashRegisterEmployee.objects.create(
                    cash_register=instance,
                    employee=emp,
                    can_deposit=(emp in emp_set) or (emp in tv_emp_set),
                    can_withdraw=(emp in emp_set) or (emp in tv_emp_set),
                    can_view=emp in tv_emp_set
                )
        
        return instance


class CashRegisterTransactionSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.user.get_full_name', read_only=True)
    employee_username = serializers.CharField(source='employee.user.username', read_only=True)
    cash_register_name = serializers.CharField(source='cash_register.name', read_only=True)
    reason_name = serializers.CharField(source='reason.name', read_only=True, allow_null=True)
    target_cash_register_name = serializers.CharField(source='target_cash_register.name', read_only=True, allow_null=True)
    formatted_amount = serializers.SerializerMethodField()

    class Meta:
        model = CashRegisterTransaction
        fields = ['id', 'cash_register', 'cash_register_name', 'employee', 'employee_name', 
                  'employee_username', 'amount', 'formatted_amount', 'reason', 'reason_name', 
                  'note', 'balance_before', 'balance_after', 'target_cash_register', 
                  'target_cash_register_name', 'timestamp']
        read_only_fields = ['employee', 'balance_before', 'balance_after', 'timestamp']

    def get_formatted_amount(self, obj):
        sign = '+' if obj.amount >= 0 else ''
        return f"{sign}{obj.amount}"

    def create(self, validated_data):
        user = self.context['request'].user
        # Get employee profile
        try:
            employee = user.employee_profile
        except Employee.DoesNotExist:
            raise serializers.ValidationError("User does not have an employee profile")
        
        cash_register = validated_data['cash_register']
        amount = validated_data['amount']
        
        # Set balance before and after
        validated_data['employee'] = employee
        validated_data['balance_before'] = cash_register.current_balance
        validated_data['balance_after'] = cash_register.current_balance + amount
        
        # Create transaction
        transaction = CashRegisterTransaction.objects.create(**validated_data)
        
        # Update cash register balance
        cash_register.current_balance = validated_data['balance_after']
        cash_register.save()
        
        # If this is a transfer, create the corresponding entry in target register
        if validated_data.get('target_cash_register'):
            target = validated_data['target_cash_register']
            CashRegisterTransaction.objects.create(
                cash_register=target,
                employee=employee,
                amount=abs(amount),  # Positive amount for the target
                reason=validated_data.get('reason'),
                note=f"Átutálás innen: {cash_register.name}. {validated_data.get('note', '')}",
                balance_before=target.current_balance,
                balance_after=target.current_balance + abs(amount),
                target_cash_register=cash_register
            )
            # Update target balance
            target.current_balance += abs(amount)
            target.save()
        
        # Send email notification if configured
        self._send_email_notification(transaction, cash_register, employee)
        
        return transaction
    
    def _send_email_notification(self, transaction, cash_register, employee):
        """Send email notification for cash transaction if enabled"""
        is_deposit = transaction.amount >= 0
        
        # Check if email notification is enabled for this transaction type
        if is_deposit and not cash_register.email_notify_on_deposit:
            return
        if not is_deposit and not cash_register.email_notify_on_withdrawal:
            return
        
        # Get notification recipients
        notify_users = cash_register.notify_users.all()
        if not notify_users:
            return
        
        recipient_emails = [emp.user.email for emp in notify_users if emp.user.email]
        if not recipient_emails:
            return
        
        # Get EmailServerConfig from database
        email_config = EmailServerConfig.objects.filter(is_active=True).first()
        
        try:
            # Create SMTP connection
            if email_config:
                # Use database configuration
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
            else:
                # Fallback to settings.py EMAIL_* variables
                logger.info("EmailServerConfig not found, using settings.py EMAIL_* variables")
                connection = get_connection(
                    backend=settings.EMAIL_BACKEND,
                    host=settings.EMAIL_HOST,
                    port=settings.EMAIL_PORT,
                    username=settings.EMAIL_HOST_USER,
                    password=settings.EMAIL_HOST_PASSWORD,
                    use_tls=settings.EMAIL_USE_TLS,
                    use_ssl=settings.EMAIL_USE_SSL,
                    fail_silently=False,
                    timeout=10,
                )
                from_email = settings.DEFAULT_FROM_EMAIL
            
            # Format amount with sign
            amount_str = f"+{transaction.amount}" if is_deposit else str(transaction.amount)
            
            # Prepare email
            subject = f"Kassza {cash_register.name}: {amount_str}"
            
            reason_name = transaction.reason.name if transaction.reason else '-'
            employee_name = employee.user.get_full_name() or employee.user.username
            timestamp = transaction.timestamp.strftime('%Y-%m-%d %H:%M:%S')
            
            body = f"""Timestamp: {timestamp}
Kassza név: {cash_register.name}
Összeg: {amount_str}
Miért: {reason_name}
Megjegyzés: {transaction.note or '-'}
Alkalmazott: {employee_name}
Kassza tartalma előtte: {transaction.balance_before}
Kassza tartalma utána: {transaction.balance_after}
"""
            
            message = EmailMultiAlternatives(
                subject=subject,
                body=body,
                from_email=from_email,
                to=recipient_emails,
                connection=connection
            )
            
            message.send()
            logger.info(f"Cash register notification email sent to {len(recipient_emails)} recipients")
        except Exception as e:
            # Log error but don't fail the transaction
            logger.error(f"Failed to send cash register notification email: {e}", exc_info=True)
