# Generated manually for Currency model

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Currency',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=3, unique=True, verbose_name='Valuta kód')),
                ('name', models.CharField(max_length=100, verbose_name='Valuta név')),
                ('symbol', models.CharField(max_length=10, verbose_name='Szimbólum')),
                ('is_default', models.BooleanField(default=False, verbose_name='Alapértelmezett')),
                ('exchange_rate', models.DecimalField(decimal_places=4, default=1.0, max_digits=10, validators=[django.core.validators.MinValueValidator(0.0001)], verbose_name='Árfolyam')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Létrehozva')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Módosítva')),
            ],
            options={
                'verbose_name': 'Valuta',
                'verbose_name_plural': 'Valuták',
                'ordering': ['code'],
            },
        ),
    ]
