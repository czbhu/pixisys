from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'companies', views.CompanyViewSet)
router.register(r'contacts', views.ContactViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
