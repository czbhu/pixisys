from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'companies', views.CompanyViewSet, basename='companies')
router.register(r'contacts', views.ContactViewSet, basename='contacts')
router.register(r'discount-groups', views.DiscountGroupViewSet, basename='discount-groups')

urlpatterns = [
    path('', include(router.urls)),
]
