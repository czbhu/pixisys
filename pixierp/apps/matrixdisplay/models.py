"""Matrix (LED) kijelzők nyilvántartása, média könyvtár, programok és küldési napló."""
import os
import uuid

from django.db import models


def media_upload_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f'matrixdisplay/{uuid.uuid4().hex}{ext}'


class MatrixDisplay(models.Model):
    """Egy LED kijelző / vezérlő kártya."""

    KIND_CHOICES = [
        ('full_color', 'Teljes színes (HDPlayer)'),
        ('mono', 'Egyszínű (HD2020)'),
    ]
    PROTOCOL_CHOICES = [
        ('huidu_sdk2', 'Huidu SDK2 TCP (10001)'),
        ('huidu_gen6', 'Huidu Gen6 (HD2020 szöveg)'),
        ('manual', 'Csak nyilvántartás (kézi küldés)'),
    ]

    name = models.CharField(max_length=100, verbose_name='Név')
    serial = models.CharField(max_length=60, blank=True, default='', verbose_name='Sorozatszám')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='full_color', verbose_name='Típus')
    protocol = models.CharField(max_length=20, choices=PROTOCOL_CHOICES, default='huidu_sdk2', verbose_name='Protokoll')
    host = models.CharField(max_length=100, blank=True, default='', verbose_name='IP cím')
    port = models.PositiveIntegerField(default=10001, verbose_name='Port')
    mac = models.CharField(max_length=20, blank=True, default='', verbose_name='MAC')
    gateway = models.CharField(max_length=20, blank=True, default='', verbose_name='Átjáró')
    subnet = models.CharField(max_length=20, blank=True, default='', verbose_name='Alhálózati maszk')
    wifi_ssid = models.CharField(max_length=64, blank=True, default='', verbose_name='WiFi SSID')
    wifi_password = models.CharField(max_length=64, blank=True, default='', verbose_name='WiFi jelszó')
    screen_width = models.PositiveIntegerField(null=True, blank=True, verbose_name='Szélesség (px)')
    screen_height = models.PositiveIntegerField(null=True, blank=True, verbose_name='Magasság (px)')
    notes = models.TextField(blank=True, default='', verbose_name='Megjegyzés')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    last_seen_at = models.DateTimeField(null=True, blank=True, verbose_name='Utoljára elérhető')
    last_status = models.CharField(max_length=200, blank=True, default='', verbose_name='Utolsó státusz')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'matrix_displays'
        ordering = ['name']
        verbose_name = 'Matrix kijelző'
        verbose_name_plural = 'Matrix kijelzők'

    def __str__(self):
        return f'{self.name} ({self.host or "?"})'


class MatrixMedia(models.Model):
    """Kijelzőre küldhető médiaállomány (kép, videó, egyéb)."""

    KIND_CHOICES = [
        ('image', 'Kép'), ('video', 'Videó'), ('audio', 'Hang'), ('other', 'Egyéb'),
    ]

    name = models.CharField(max_length=150, verbose_name='Név')
    file = models.FileField(upload_to=media_upload_path, verbose_name='Fájl')
    kind = models.CharField(max_length=10, choices=KIND_CHOICES, default='image', verbose_name='Típus')
    file_size = models.PositiveBigIntegerField(default=0, verbose_name='Méret (bájt)')
    md5 = models.CharField(max_length=32, blank=True, default='', verbose_name='MD5')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'matrix_media'
        ordering = ['-created_at']
        verbose_name = 'Kijelző média'
        verbose_name_plural = 'Kijelző médiumok'

    def save(self, *args, **kwargs):
        if self.file and not self.file_size:
            try:
                self.file_size = self.file.size
            except Exception:
                pass
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class MatrixProgram(models.Model):
    """Kijelzőre küldhető program (médialista + szövegzónák)."""

    name = models.CharField(max_length=100, verbose_name='Név')
    display = models.ForeignKey(MatrixDisplay, on_delete=models.CASCADE, related_name='programs', verbose_name='Kijelző')
    # JSON leírás: pl. {"areas": [{"type": "media"|"text", "x":0,"y":0,"w":100,"h":100,
    #   "media_ids": [..], "text": "..", "font_size": 16, "color": "#ff0000", "scroll": true}]}
    config = models.JSONField(default=dict, blank=True, verbose_name='Beállítás')
    is_active = models.BooleanField(default=True, verbose_name='Aktív')
    last_sent_at = models.DateTimeField(null=True, blank=True, verbose_name='Utoljára elküldve')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'matrix_programs'
        ordering = ['display', 'name']
        verbose_name = 'Kijelző program'
        verbose_name_plural = 'Kijelző programok'

    def __str__(self):
        return f'{self.display.name}: {self.name}'


class MatrixSendLog(models.Model):
    """Minden küldés / parancs naplója (kérés-válasz XML-lel a hibakereséshez)."""

    display = models.ForeignKey(MatrixDisplay, on_delete=models.CASCADE, related_name='send_logs', verbose_name='Kijelző')
    program = models.ForeignKey(MatrixProgram, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Program')
    action = models.CharField(max_length=40, verbose_name='Művelet')
    status = models.CharField(max_length=20, verbose_name='Állapot')
    message = models.TextField(blank=True, default='', verbose_name='Üzenet')
    request = models.TextField(blank=True, default='', verbose_name='Kérés')
    response = models.TextField(blank=True, default='', verbose_name='Válasz')
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, verbose_name='Felhasználó')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'matrix_send_logs'
        ordering = ['-created_at']
        verbose_name = 'Kijelző küldési napló'
        verbose_name_plural = 'Kijelző küldési naplók'
