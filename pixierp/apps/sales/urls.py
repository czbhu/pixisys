from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'customers', views.CustomerViewSet)
router.register(r'products', views.ProductViewSet)
router.register(r'manufacturing-products', views.ManufacturingProductViewSet, basename='manufacturing-products')
router.register(r'services', views.ServiceViewSet)
router.register(r'quote-requests', views.QuoteRequestViewSet, basename='quoterequest')
router.register(r'quote-request-items', views.QuoteRequestItemViewSet)
router.register(r'quotes', views.QuoteViewSet)
router.register(r'quote-items', views.QuoteItemViewSet)
router.register(r'orders', views.OrderViewSet)
router.register(r'order-items', views.OrderItemViewSet)
router.register(r'customer-orders', views.CustomerOrderViewSet)
router.register(r'customer-order-items', views.CustomerOrderItemViewSet)
router.register(r'quote-request-costs', views.QuoteRequestCostViewSet)
router.register(r'leads', views.LeadViewSet)
router.register(r'opportunities', views.OpportunityViewSet)
router.register(r'approval-requests', views.ApprovalRequestViewSet)
router.register(r'forecasts', views.ForecastViewSet)
router.register(r'work-logs', views.WorkLogViewSet)
router.register(r'extra-works', views.ExtraWorkViewSet, basename='extra-works')
router.register(r'chats', views.ChatThreadViewSet)
router.register(r'delivery-notes', views.DeliveryNoteViewSet)
router.register(r'delivery-note-items', views.DeliveryNoteItemViewSet)
router.register(r'pickup-locations', views.PickupLocationViewSet)

# POS endpoints
router.register(r'pos/customer-identifications', views.POSCustomerIdentificationViewSet, basename='pos-customer-identification')
router.register(r'pos/coupons', views.POSCouponViewSet, basename='pos-coupon')
router.register(r'pos/transactions', views.POSTransactionViewSet, basename='pos-transaction')
router.register(r'pos/transaction-items', views.POSTransactionItemViewSet, basename='pos-transaction-item')
router.register(r'pos/payments', views.POSPaymentViewSet, basename='pos-payment')

urlpatterns = [
    path('', include(router.urls)),
    path('quote-requests/public/<str:token>/order/', views.public_order_view, name='rfq_public_order'),
    path('quote-requests/public/<str:token>/submit-order/', views.public_submit_order, name='rfq_public_submit_order'),
    path('quote-requests/public/<str:token>/attachments/', views.public_list_attachments, name='rfq_public_list_attachments'),
    path('quote-requests/public/<str:token>/attachments/upload/', views.public_upload_attachment, name='rfq_public_upload_attachment'),
    path('quote-requests/public/<str:token>/attachments/<int:att_id>/delete/', views.public_delete_attachment, name='rfq_public_delete_attachment'),
    path('customer-orders/public/delivery/<str:token>/', views.public_delivery_view, name='public_delivery_view'),
    path('customer-orders/public/delivery/<str:token>/pdf/', views.public_delivery_pdf, name='public_delivery_pdf'),
    path('customer-orders/public/delivery/<str:token>/confirm/', views.confirm_delivery, name='confirm_delivery'),
]
