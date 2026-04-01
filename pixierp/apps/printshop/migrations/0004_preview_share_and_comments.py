from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('printshop', '0003_material_and_fk'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='printorderitem',
            name='preview_share_commentable',
            field=models.BooleanField(default=True, verbose_name='Ügyfél kommentelheti a preview-t'),
        ),
        migrations.AddField(
            model_name='printorderitem',
            name='preview_share_editable',
            field=models.BooleanField(default=False, verbose_name='Ügyfél szerkesztheti a preview-t'),
        ),
        migrations.AddField(
            model_name='printorderitem',
            name='preview_share_enabled',
            field=models.BooleanField(default=False, verbose_name='Preview megosztás engedélyezve'),
        ),
        migrations.AddField(
            model_name='printorderitem',
            name='preview_share_exportable',
            field=models.BooleanField(default=False, verbose_name='Ügyfél exportálhatja a preview-t'),
        ),
        migrations.AddField(
            model_name='printorderitem',
            name='preview_share_token',
            field=models.CharField(blank=True, max_length=64, null=True, unique=True, verbose_name='Preview megosztási token'),
        ),
        migrations.CreateModel(
            name='PrintOrderItemComment',
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
                ('item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='printshop.printorderitem', verbose_name='Nyomtatási tétel')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='print_order_item_comments', to=settings.AUTH_USER_MODEL, verbose_name='Létrehozó user')),
            ],
            options={
                'verbose_name': 'Nyomtatási preview komment',
                'verbose_name_plural': 'Nyomtatási preview kommentek',
                'ordering': ['created_at'],
            },
        ),
    ]