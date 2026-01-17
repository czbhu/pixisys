from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from invoices.webhooks import send_erp_webhook


class ERPWebhookTestView(APIView):
    """Manual trigger to verify ERP webhook connectivity."""

    def post(self, request):
        payload = {
            'message': 'Webhook connectivity test',
            'user': getattr(request.user, 'username', None),
        }
        success = send_erp_webhook('webhook.test', payload)
        http_status = status.HTTP_200_OK if success else status.HTTP_503_SERVICE_UNAVAILABLE
        return Response({'success': success}, status=http_status)
