from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'size-presets', views.PrintSizePresetViewSet, basename='print-size-preset')
router.register(r'materials', views.PrintMaterialViewSet, basename='print-material')
router.register(r'orders', views.PrintOrderViewSet, basename='print-order')

urlpatterns = [
    path('', include(router.urls)),
    path('pricing/', views.PrintPricingConfigViewSet.as_view({
        'get': 'list',
        'post': 'create',
    }), name='print-pricing'),
    path('pdf-to-svg/', views.PdfToSvgView.as_view(), name='pdf-to-svg'),
    path('pdf-analyze/', views.PdfAnalyzeView.as_view(), name='pdf-analyze'),
    path('pdf-delete-page/', views.PdfDeletePageView.as_view(), name='pdf-delete-page'),
    path('pdf-reorder/', views.PdfReorderPagesView.as_view(), name='pdf-reorder'),
    path('pdf-crop/', views.PdfCropView.as_view(), name='pdf-crop'),
    path('pdf-merge/', views.PdfMergeView.as_view(), name='pdf-merge'),
    path('pdf-export/', views.PdfExportView.as_view(), name='pdf-export'),
]
