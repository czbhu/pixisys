from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0056_add_customer_type_flags'),
    ]

    operations = [
        migrations.CreateModel(
            name='Role',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=100, unique=True, verbose_name='Role Name')),
                ('description', models.TextField(blank=True, null=True, verbose_name='Description')),
                ('menu_permissions', models.JSONField(default=list, verbose_name='Menu Permissions')),
                ('is_active', models.BooleanField(default=True, verbose_name='Active')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Role',
                'verbose_name_plural': 'Roles',
                'ordering': ['name'],
            },
        ),
        migrations.AddField(
            model_name='systemuser',
            name='roles',
            field=models.ManyToManyField(blank=True, related_name='users', to='invoices.role', verbose_name='Roles'),
        ),
    ]
