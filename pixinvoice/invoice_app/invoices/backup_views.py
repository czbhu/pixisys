from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.http import HttpResponse
from django.core.management import call_command
from django.utils import timezone
from io import StringIO
import tempfile


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_database_view(request):
    """Export database as JSON"""
    try:
        output = StringIO()
        call_command('dumpdata', 
                    '--natural-foreign', 
                    '--natural-primary',
                    '--indent', '2',
                    '--exclude', 'contenttypes',
                    '--exclude', 'auth.permission',
                    '--exclude', 'sessions',
                    stdout=output)
        
        response = HttpResponse(output.getvalue(), content_type='application/json')
        response['Content-Disposition'] = f'attachment; filename="pixinvoice_backup_{timezone.now().strftime("%Y%m%d_%H%M%S")}.json"'
        return response
    except Exception as e:
        return Response({
            'error': f'Hiba az adatbázis exportálása során: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_database_view(request):
    """Import database from JSON file"""
    if 'file' not in request.FILES:
        return Response({
            'error': 'Nincs fájl feltöltve'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        uploaded_file = request.FILES['file']
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.json', delete=False) as temp_file:
            content = uploaded_file.read().decode('utf-8')
            temp_file.write(content)
            temp_file.flush()
            
            # Load data
            call_command('loaddata', temp_file.name)
        
        return Response({
            'message': 'Adatbázis sikeresen importálva'
        })
    except Exception as e:
        return Response({
            'error': f'Hiba az adatbázis importálása során: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
