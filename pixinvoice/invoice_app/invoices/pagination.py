from rest_framework.pagination import PageNumberPagination


class CustomPageNumberPagination(PageNumberPagination):
    """
    Custom pagination class that allows clients to set the page size
    """
    page_size = 20  # Default page size
    page_size_query_param = 'page_size'  # Allow client to override
    max_page_size = 200  # Maximum limit
