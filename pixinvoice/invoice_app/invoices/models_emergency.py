"""Emergency Access Token model for temporary admin access"""
from django.db import models
from django.utils import timezone
from datetime import timedelta
import secrets


class EmergencyAccessToken(models.Model):
    """Időkorlátozott, egyszer használatos admin hozzáférési token"""
    
    token = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    is_used = models.BooleanField(default=False)
    created_by_ip = models.GenericIPAddressField(null=True, blank=True)
    used_from_ip = models.GenericIPAddressField(null=True, blank=True)
    
    class Meta:
        db_table = 'emergency_access_tokens'
        ordering = ['-created_at']
    
    @classmethod
    def create_token(cls, validity_minutes=15, ip_address=None):
        """Új emergency token létrehozása"""
        token = secrets.token_urlsafe(48)
        expires_at = timezone.now() + timedelta(minutes=validity_minutes)
        
        return cls.objects.create(
            token=token,
            expires_at=expires_at,
            created_by_ip=ip_address
        )
    
    def is_valid(self):
        """Ellenőrzi hogy a token még érvényes-e"""
        if self.is_used:
            return False
        if timezone.now() > self.expires_at:
            return False
        return True
    
    def mark_as_used(self, ip_address=None):
        """Token használatának regisztrálása"""
        self.is_used = True
        self.used_at = timezone.now()
        self.used_from_ip = ip_address
        self.save()
    
    def __str__(self):
        status = "used" if self.is_used else ("expired" if timezone.now() > self.expires_at else "valid")
        return f"Emergency token ({status}) - {self.created_at}"
