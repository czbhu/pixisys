from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from invoices.models import Customer
from invoices.webhooks import dispatch_model_event


@override_settings(
    ERP_WEBHOOK_URL="https://erp.local/webhook",
    ERP_WEBHOOK_TOKEN="secret-token",
    ERP_WEBHOOK_TIMEOUT=3,
)
class ERPWebhookTests(TestCase):
    @patch('invoices.webhooks.requests.post')
    def test_dispatch_customer_event_posts_payload(self, mock_post):
        response = MagicMock()
        response.raise_for_status.return_value = None
        mock_post.return_value = response

        customer = Customer.objects.create(
            name="ACME",
            tax_number="12345678",
            city="Budapest",
            postal_code="1111",
        )

        # The creation already triggers a signal; focus on the explicit dispatch below
        mock_post.reset_mock()

        success = dispatch_model_event(customer, 'created')

        self.assertTrue(success)
        mock_post.assert_called_once()
        call_args, call_kwargs = mock_post.call_args
        self.assertEqual(call_args[0], "https://erp.local/webhook")
        headers = call_kwargs['headers']
        self.assertEqual(headers['Authorization'], 'Bearer secret-token')

        payload = call_kwargs['json']
        self.assertEqual(payload['event'], 'customer.created')
        self.assertIn('payload', payload)
        self.assertEqual(payload['payload']['data']['name'], 'ACME')
