from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0048_storage_models'),
        ('hr', '0030_taskconfiguration_due_month_of_year'),
    ]

    operations = [
        # 1. Make shared_with nullable
        migrations.AlterField(
            model_name='storageshare',
            name='shared_with',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='storage_shared_with_me',
                to='auth.user',
                verbose_name='Megosztva ezzel (felhasználó)',
            ),
        ),
        # 2. Add shared_with_department FK
        migrations.AddField(
            model_name='storageshare',
            name='shared_with_department',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='storage_shared_with_dept',
                to='hr.department',
                verbose_name='Megosztva ezzel (osztály)',
            ),
        ),
        # 3. Remove old unique_together
        migrations.AlterUniqueTogether(
            name='storageshare',
            unique_together=set(),
        ),
        # 4. Add new partial unique constraints
        migrations.AddConstraint(
            model_name='storageshare',
            constraint=models.UniqueConstraint(
                condition=models.Q(shared_with__isnull=False),
                fields=['folder', 'shared_with'],
                name='unique_folder_user_share',
            ),
        ),
        migrations.AddConstraint(
            model_name='storageshare',
            constraint=models.UniqueConstraint(
                condition=models.Q(shared_with__isnull=False),
                fields=['file', 'shared_with'],
                name='unique_file_user_share',
            ),
        ),
        migrations.AddConstraint(
            model_name='storageshare',
            constraint=models.UniqueConstraint(
                condition=models.Q(shared_with_department__isnull=False),
                fields=['folder', 'shared_with_department'],
                name='unique_folder_dept_share',
            ),
        ),
        migrations.AddConstraint(
            model_name='storageshare',
            constraint=models.UniqueConstraint(
                condition=models.Q(shared_with_department__isnull=False),
                fields=['file', 'shared_with_department'],
                name='unique_file_dept_share',
            ),
        ),
    ]
