from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import POSTerminalViewSet


router = DefaultRouter()
router.register(r'terminals', POSTerminalViewSet, basename='pos-terminal')

urlpatterns = [
    path('', include(router.urls)),
]
