from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'customers', views.CustomerViewSet)
router.register(r'products', views.ProductViewSet)
router.register(r'manufacturing-products', views.ManufacturingProductViewSet, basename='manufacturing-products')
router.register(r'services', views.ServiceViewSet)
router.register(r'quote-requests', views.QuoteRequestViewSet)
router.register(r'quote-request-items', views.QuoteRequestItemViewSet)
router.register(r'quotes', views.QuoteViewSet)
router.register(r'quote-items', views.QuoteItemViewSet)
router.register(r'orders', views.OrderViewSet)
router.register(r'order-items', views.OrderItemViewSet)
router.register(r'leads', views.LeadViewSet)
router.register(r'opportunities', views.OpportunityViewSet)
router.register(r'forecasts', views.ForecastViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('quote-requests/public/<str:token>/order/', views.public_order_view, name='rfq_public_order'),
]
