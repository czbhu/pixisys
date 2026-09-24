from rest_framework import serializers

from .models import MatrixDisplay, MatrixMedia, MatrixProgram, MatrixSendLog


class MatrixDisplaySerializer(serializers.ModelSerializer):
    class Meta:
        model = MatrixDisplay
        fields = '__all__'


class MatrixMediaSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = MatrixMedia
        fields = ['id', 'name', 'kind', 'file', 'file_url', 'file_size', 'md5', 'created_at']
        read_only_fields = ['file_size', 'md5']

    def get_file_url(self, obj):
        try:
            return obj.file.url
        except Exception:
            return None


class MatrixProgramSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source='display.name', read_only=True)

    class Meta:
        model = MatrixProgram
        fields = ['id', 'name', 'display', 'display_name', 'config', 'is_active',
                  'last_sent_at', 'created_at', 'updated_at']


class MatrixSendLogSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source='display.name', read_only=True)
    program_name = serializers.CharField(source='program.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = MatrixSendLog
        fields = ['id', 'display', 'display_name', 'program', 'program_name', 'action',
                  'status', 'message', 'request', 'response', 'created_by', 'created_by_name',
                  'created_at']

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None
        return obj.created_by.get_full_name() or obj.created_by.username
