from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('printshop', '0004_preview_share_and_comments'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SharedPrintPreview',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(blank=True, max_length=200, verbose_name='Preview neve')),
                ('pdf', models.FileField(upload_to='printshop/shared_preview/', verbose_name='Megosztott PDF')),
                ('token', models.CharField(max_length=64, unique=True, verbose_name='Megosztási token')),
                ('editable', models.BooleanField(default=False, verbose_name='Szerkeszthető')),
                ('commentable', models.BooleanField(default=True, verbose_name='Kommentelhető')),
                ('exportable', models.BooleanField(default=False, verbose_name='Exportálható')),
                ('is_active', models.BooleanField(default=True, verbose_name='Aktív')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='shared_print_previews', to=settings.AUTH_USER_MODEL, verbose_name='Létrehozó user')),
            ],
            options={
                'verbose_name': 'Megosztott preview',
                'verbose_name_plural': 'Megosztott previewk',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='SharedPrintPreviewComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('author_name', models.CharField(max_length=200, verbose_name='Szerző neve')),
                ('x', models.FloatField(verbose_name='X pozíció')),
                ('y', models.FloatField(verbose_name='Y pozíció')),
                ('w', models.FloatField(default=0, verbose_name='Szélesség')),
                ('h', models.FloatField(default=0, verbose_name='Magasság')),
                ('x2', models.FloatField(blank=True, null=True, verbose_name='Nyíl X2')),
                ('y2', models.FloatField(blank=True, null=True, verbose_name='Nyíl Y2')),
                ('type', models.CharField(choices=[('area', 'Terület'), ('pin', 'Jelölő'), ('arrow', 'Nyíl')], default='area', max_length=20, verbose_name='Típus')),
                ('page', models.PositiveIntegerField(default=1, verbose_name='Oldal')),
                ('text', models.TextField(verbose_name='Komment szövege')),
                ('resolved', models.BooleanField(default=False, verbose_name='Megoldva')),
                ('color', models.CharField(default='#1890ff', max_length=20, verbose_name='Szín')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('preview', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='printshop.sharedprintpreview', verbose_name='Megosztott preview')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='shared_print_preview_comments', to=settings.AUTH_USER_MODEL, verbose_name='Létrehozó user')),
            ],
            options={
                'verbose_name': 'Megosztott preview komment',
                'verbose_name_plural': 'Megosztott preview kommentek',
                'ordering': ['created_at'],
            },
        ),
    ]
