"""Matrix kijelzők API: nyilvántartás, média, programküldés, forgalom-rögzítés."""
import os
import re
import uuid as uuid_lib
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

from django.conf import settings
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from . import recorder
from .huidu_client import HuiduError, HuiduGen6Client, HuiduSDK2Client, file_md5
from .models import MatrixDisplay, MatrixMedia, MatrixProgram, MatrixSendLog
from .serializers import (
    MatrixDisplaySerializer, MatrixMediaSerializer, MatrixProgramSerializer,
    MatrixSendLogSerializer,
)


def _log_send(display, action, status_text, message='', request='', response='', program=None, user=None):
    return MatrixSendLog.objects.create(
        display=display, program=program, action=action, status=status_text,
        message=message, request=request[:20000], response=response[:20000],
        created_by=user if (user and user.is_authenticated) else None,
    )


def _xml_escape(text):
    return escape(str(text or ''))


class MatrixDisplayViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MatrixDisplay.objects.all()
    serializer_class = MatrixDisplaySerializer

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        """Ping + protokoll kézfogás próbálása; frissíti a last_seen/státusz mezőket."""
        display = self.get_object()
        if not display.host:
            return Response({'ok': False, 'message': 'Nincs IP cím beállítva'}, status=400)
        try:
            if display.protocol == 'huidu_gen6':
                with HuiduGen6Client(display.host, display.port or 10001) as client:
                    result = client.ping()
            else:
                with HuiduSDK2Client(display.host, display.port or 10001) as client:
                    result = client.ping()
            display.last_seen_at = timezone.now()
            display.last_status = ('elérhető, ' + (f"GUID {result.get('guid', '')[:12]}…"
                                  if result.get('ok') else str(result.get('reply', ''))[:150]))
            display.save(update_fields=['last_seen_at', 'last_status', 'updated_at'])
            _log_send(display, 'test', 'ok' if result.get('ok') else 'error',
                      message=str(result.get('reply', ''))[:1000], user=request.user)
            return Response(result)
        except Exception as exc:
            display.last_status = f'hiba: {exc}'
            display.save(update_fields=['last_status', 'updated_at'])
            _log_send(display, 'test', 'error', message=str(exc), user=request.user)
            return Response({'ok': False, 'message': str(exc)}, status=200)

    @action(detail=True, methods=['post'])
    def send_text(self, request, pk=None):
        """Gyors szöveges üzenet küldése a kijelzőre (SDK2 XML út)."""
        display = self.get_object()
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'error': 'A szöveg megadása kötelező'}, status=400)
        try:
            with HuiduSDK2Client(display.host, display.port or 10001) as client:
                # Megjegyzés: a C-sorozatú firmware egy része nem támogatja az XML
                # metódusokat (kUnsupportDeviceType) – a válasz ezt jelzi, és a
                # naplóban látod a pontos hibát.
                reply = client.xml_command(
                    'AddProgram',
                    f'<Program name="pixierp-{uuid_lib.uuid4().hex[:8]}">'
                    f'<Area x="0" y="0" w="100" h="100">'
                    f'<Text><String>{_xml_escape(text)}</String></Text>'
                    f'</Area></Program>',
                )
            result = re.search(r'result="([^"]+)"', reply or '')
            ok = bool(result and 'kSuccess' in result.group(1))
            _log_send(display, 'send_text', 'ok' if ok else 'error',
                      message=text, request='', response=reply or '', user=request.user)
            return Response({'ok': ok, 'reply': reply})
        except HuiduError as exc:
            _log_send(display, 'send_text', 'error', message=str(exc), user=request.user)
            return Response({'ok': False, 'message': str(exc)})
        except Exception as exc:
            _log_send(display, 'send_text', 'error', message=str(exc), user=request.user)
            return Response({'ok': False, 'message': str(exc)})

    # ------------------------------------------------- HDPlayer forgalom-rögzítő

    @action(detail=True, methods=['post'], url_path='recorder/start')
    def recorder_start(self, request, pk=None):
        """TCP proxy indítása: a HDPlayer-t a szerverre irányítod, minden forgalom
        naplózódik – így a teljes protokoll kinyerhető a nagy kijelzőhöz."""
        display = self.get_object()
        listen_port = int(request.data.get('listen_port') or 10001)
        target_port = int(request.data.get('target_port') or display.port or 10001)
        if not display.host:
            return Response({'error': 'Nincs IP cím beállítva'}, status=400)
        try:
            log_path = recorder.start_recorder(display.id, listen_port, display.host, target_port)
        except RuntimeError as exc:
            return Response({'error': str(exc)}, status=400)
        rel = os.path.relpath(log_path, settings.MEDIA_ROOT)
        _log_send(display, 'recorder', 'ok',
                  message=f'Rögzítő indítva :{listen_port} → {display.host}:{target_port}',
                  user=request.user)
        return Response({
            'ok': True,
            'listen_port': listen_port,
            'log_url': f'/media/{rel}',
            'instructions': (
                f'A HDPlayer-ben állítsd a kártya IP-jét a szerverre: 192.168.5.196 '
                f'(port {listen_port}), majd küldj ki egy programot szokás szerint. '
                f'A kijelző közben rendesen megkapja az adatokat, a forgalom naplózódik.'
            ),
        })

    @action(detail=True, methods=['post'], url_path='recorder/stop')
    def recorder_stop(self, request, pk=None):
        display = self.get_object()
        log_path = recorder.stop_recorder(display.id)
        if not log_path:
            return Response({'ok': False, 'message': 'Nem fut rögzítő ehhez a kijelzőhöz'})
        rel = os.path.relpath(log_path, settings.MEDIA_ROOT)
        _log_send(display, 'recorder', 'ok', message='Rögzítő leállítva', user=request.user)
        return Response({'ok': True, 'log_url': f'/media/{rel}'})

    @action(detail=True, methods=['get'], url_path='recorder/status')
    def recorder_status(self, request, pk=None):
        display = self.get_object()
        return Response({'running': bool(recorder.recorder_status(display.id)),
                         'status': recorder.recorder_status(display.id)})


class MatrixMediaViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MatrixMedia.objects.all()
    serializer_class = MatrixMediaSerializer
    filterset_fields = ['kind']

    def perform_create(self, serializer):
        upload = self.request.FILES.get('file')
        md5 = ''
        if upload:
            upload.seek(0)
            md5 = file_md5(upload)
            upload.seek(0)
        kind = serializer.validated_data.get('kind')
        if not kind and upload:
            name = (upload.name or '').lower()
            kind = ('video' if any(ext in name for ext in ('.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv'))
                    else 'audio' if any(ext in name for ext in ('.mp3', '.wav', '.wma', '.aac'))
                    else 'image' if any(ext in name for ext in ('.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'))
                    else 'other')
            serializer.validated_data['kind'] = kind
        obj = serializer.save(md5=md5)
        if upload and not obj.file_size:
            obj.file_size = upload.size
            obj.save(update_fields=['file_size'])


class MatrixProgramViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MatrixProgram.objects.select_related('display')
    serializer_class = MatrixProgramSerializer
    filterset_fields = ['display']

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Program küldése a kijelzőre. Jelenleg SDK2 XML úton (AddProgram);
        a médiafájlok fájlprotokollon történő feltöltése a rögzített HDPlayer
        forgalom alapján bővíthető."""
        program = self.get_object()
        display = program.display
        if not display.host:
            return Response({'error': 'A kijelzőhöz nincs IP beállítva'}, status=400)
        areas = (program.config or {}).get('areas') or []
        if not areas:
            return Response({'error': 'A program nem tartalmaz zónákat'}, status=400)
        area_xml = []
        for a in areas:
            x, y, w, h = (int(a.get(k, 0)) for k in ('x', 'y', 'w', 'h'))
            if a.get('type') == 'text':
                area_xml.append(
                    f'<Area x="{x}" y="{y}" w="{w}" h="{h}">'
                    f'<Text><String>{_xml_escape(a.get("text", ""))}</String></Text></Area>'
                )
            else:
                names = ', '.join(str(m) for m in (a.get('media_names') or []))
                area_xml.append(
                    f'<Area x="{x}" y="{y}" w="{w}" h="{h}">'
                    f'<File>{_xml_escape(names)}</File></Area>'
                )
        inner = (f'<Program name="{_xml_escape(program.name)}">'
                 + ''.join(area_xml) + '</Program>')
        try:
            with HuiduSDK2Client(display.host, display.port or 10001) as client:
                reply = client.xml_command('AddProgram', inner)
            result = re.search(r'result="([^"]+)"', reply or '')
            ok = bool(result and 'kSuccess' in result.group(1))
            program.last_sent_at = timezone.now()
            program.save(update_fields=['last_sent_at', 'updated_at'])
            _log_send(display, 'send_program', 'ok' if ok else 'error', program=program,
                      message=inner[:500], response=reply or '', user=request.user)
            return Response({'ok': ok, 'reply': reply})
        except Exception as exc:
            _log_send(display, 'send_program', 'error', program=program,
                      message=str(exc), request=inner[:2000], user=request.user)
            return Response({'ok': False, 'message': str(exc)})


class MatrixSendLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = MatrixSendLog.objects.select_related('display', 'program', 'created_by')
    serializer_class = MatrixSendLogSerializer
    filterset_fields = ['display', 'action', 'status']
