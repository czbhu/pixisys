from django.db import models
from django.contrib.auth import get_user_model

from apps.finance.models import CashRegister
from apps.hr.models import Employee
from apps.warehouse.models import MaterialGroup


User = get_user_model()


class POSTerminal(models.Model):
    name = models.CharField(max_length=120, verbose_name='POS név')
    location = models.CharField(max_length=200, blank=True, default='', verbose_name='Helye')
    hepg = models.CharField(max_length=120, blank=True, default='', verbose_name='HePG')
    cash_register = models.OneToOneField(
        CashRegister,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pos_terminal',
        verbose_name='Kassza'
    )
    show_all_categories = models.BooleanField(default=True, verbose_name='Összes termék kategória')
    material_groups = models.ManyToManyField(
        MaterialGroup,
        blank=True,
        related_name='pos_terminals',
        verbose_name='Termék kategóriák'
    )
    authorized_employees = models.ManyToManyField(
        Employee,
        blank=True,
        related_name='pos_terminals',
        verbose_name='Jogosult alkalmazottak'
    )
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_pos_terminals',
        verbose_name='Létrehozta'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'pos_terminals'
        ordering = ['name']

    def __str__(self):
        return self.name
