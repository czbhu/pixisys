from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0049_quoterequestitem_locked_exchange_rate'),
    ]

    operations = [
        migrations.CreateModel(
            name='PickupLocation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255, verbose_name='Hely neve')),
                ('address', models.CharField(max_length=500, verbose_name='Cím')),
                ('pickup_hours', models.JSONField(blank=True, default=list, verbose_name='Átvételi időpontok')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Átvételi hely',
                'verbose_name_plural': 'Átvételi helyek',
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='deliverynote',
            name='delivery_type',
            field=models.CharField(
                choices=[('home', 'Házhozszállítás'), ('pickup', 'Átvételi pont')],
                default='home',
                max_length=20,
                verbose_name='Szállítás típusa',
            ),
        ),
        migrations.AddField(
            model_name='deliverynote',
            name='pickup_location',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='sales.pickuplocation',
                verbose_name='Átvételi hely',
            ),
        ),
    ]
