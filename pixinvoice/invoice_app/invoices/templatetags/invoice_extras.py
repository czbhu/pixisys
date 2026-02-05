from django import template
import decimal

register = template.Library()

@register.filter
def invoice_number_format(value):
    """
    Formats a number with space as thousand separator and dot as decimal separator.
    Example: 1234567.89 -> 1 234 567.89
    """
    if value is None:
        return ""
    try:
        # Convert to float to handle decimals and strings
        val = float(value)
        # Format with comma as thousand separator
        formatted = "{:,.2f}".format(val)
        # Replace comma with space
        return formatted.replace(",", " ")
    except (ValueError, TypeError):
        return value

@register.filter
def invoice_quantity_format(value):
    """
    Formats quantity (no decimals usually, or 2 if needed).
    """
    if value is None:
        return "0"
    try:
        val = float(value)
        if val.is_integer():
            formatted = "{:,.0f}".format(val)
        else:
            formatted = "{:,.2f}".format(val)
        return formatted.replace(",", " ")
    except (ValueError, TypeError):
        return value
