from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'size-presets', views.PrintSizePresetViewSet, basename='print-size-preset')
router.register(r'materials', views.PrintMaterialViewSet, basename='print-material')
router.register(r'orders', views.PrintOrderViewSet, basename='print-order')
router.register(r'template-categories', views.PrintTemplateCategoryViewSet, basename='print-template-category')
router.register(r'templates', views.PrintTemplateViewSet, basename='print-template')
router.register(r'machines', views.MachineViewSet, basename='machine')
router.register(r'uv-calculator', views.UVCalculatorViewSet, basename='uv-calculator')

urlpatterns = [
    path('', include(router.urls)),
    path('shared-preview/', views.SharedPrintPreviewCreateView.as_view(), name='shared-print-preview-create'),
    path('shared-preview/<str:token>/', views.SharedPrintPreviewDetailView.as_view(), name='shared-print-preview-detail'),
    path('shared-preview/<str:token>/pdf/', views.SharedPrintPreviewPdfView.as_view(), name='shared-print-preview-pdf'),
    path('shared-preview/<str:token>/extend/', views.SharedPrintPreviewExtendView.as_view(), name='shared-print-preview-extend'),
    path('shared-preview/<str:token>/versions/', views.SharedPrintPreviewVersionListView.as_view(), name='shared-print-preview-versions'),
    path('shared-preview/<str:token>/versions/<int:pk>/pdf/', views.SharedPrintPreviewVersionPdfView.as_view(), name='shared-print-preview-version-pdf'),
    path('shared-preview/<str:token>/versions/<int:pk>/restore/', views.SharedPrintPreviewVersionRestoreView.as_view(), name='shared-print-preview-version-restore'),
    path('preview-folders/', views.SharedPrintPreviewFolderListView.as_view(), name='shared-print-preview-folder-list'),
    path('preview-folders/<int:pk>/', views.SharedPrintPreviewFolderDetailView.as_view(), name='shared-print-preview-folder-detail'),
    path('order-items/<int:item_id>/comments/', views.PrintOrderItemCommentsView.as_view(), name='print-order-item-comments'),
    path('order-items/<int:item_id>/comments/<int:comment_id>/', views.PrintOrderItemCommentDetailView.as_view(), name='print-order-item-comment-detail'),
    path('public-preview/<str:token>/', views.PublicPrintPreviewView.as_view(), name='public-print-preview'),
    path('public-preview/<str:token>/pdf/', views.PublicPrintPreviewPdfView.as_view(), name='public-print-preview-pdf'),
    path('public-preview/<str:token>/comments/', views.PublicPrintPreviewCommentsView.as_view(), name='public-print-preview-comments'),
    path('public-preview/<str:token>/comments/<int:comment_id>/', views.PublicPrintPreviewCommentDetailView.as_view(), name='public-print-preview-comment-detail'),
    path('pricing/', views.PrintPricingConfigViewSet.as_view({
        'get': 'list',
        'post': 'create',
    }), name='print-pricing'),
    path('pdf-to-svg/', views.PdfToSvgView.as_view(), name='pdf-to-svg'),
    path('pdf-decompose/', views.PdfDecomposeView.as_view(), name='pdf-decompose'),
    path('pdf-analyze/', views.PdfAnalyzeView.as_view(), name='pdf-analyze'),
    path('pdf-delete-page/', views.PdfDeletePageView.as_view(), name='pdf-delete-page'),
    path('pdf-reorder/', views.PdfReorderPagesView.as_view(), name='pdf-reorder'),
    path('pdf-crop/', views.PdfCropView.as_view(), name='pdf-crop'),
    path('pdf-merge/', views.PdfMergeView.as_view(), name='pdf-merge'),
    path('pdf-export/', views.PdfExportView.as_view(), name='pdf-export'),
]
