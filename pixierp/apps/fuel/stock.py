"""Üzemanyag készletkezelés – eladott mennyiség levonása az üzemanyag raktárból.

A levonás FIFO elven történik: a legrégebbi bevételezett készletsorból von le,
amennyiben az nem elegendő, az utolsó sor negatívba mehet át (jelzi a hiányzó
bevételezést). Minden érintett készletsorhoz StockMovement rekord készül.
"""
from decimal import Decimal

from django.db import transaction as db_transaction

from apps.warehouse.models import MaterialStock, StockMovement

from .models import FuelSaleTransaction, FuelStationConfig


def deduct_fuel_stock(fuel_transaction: FuelSaleTransaction, user=None) -> Decimal:
    """Levonja az üzemanyag raktárból a tranzakció mennyiségét.

    Visszaadja a ténylegesen le nem vont (fedezetlen) mennyiséget.
    """
    if fuel_transaction.stock_deducted:
        return Decimal('0')

    volume = fuel_transaction.volume or Decimal('0')
    if volume <= 0:
        fuel_transaction.stock_deducted = True
        fuel_transaction.save(update_fields=['stock_deducted'])
        return Decimal('0')

    config = FuelStationConfig.get_solo()
    warehouse = config.fuel_warehouse
    material = fuel_transaction.fuel_grade.material if fuel_transaction.fuel_grade else None
    if warehouse is None or material is None:
        return volume

    remaining = Decimal(volume)
    with db_transaction.atomic():
        stocks = list(
            MaterialStock.objects.select_for_update()
            .filter(material=material, warehouse=warehouse, status='normal')
            .order_by('created_at')
        )
        for stock in stocks:
            if remaining <= 0:
                break
            take = min(stock.quantity, remaining)
            if take > 0:
                stock.quantity -= take
                stock.save(update_fields=['quantity', 'total_value'])
                StockMovement.objects.create(
                    stock=stock,
                    movement_type='fuel_sale',
                    from_warehouse=warehouse,
                    quantity=take,
                    notes=(
                        f'Üzemanyag eladás: {fuel_transaction.pump} '
                        f'(kút tranzakció #{fuel_transaction.pk})'
                    ),
                    created_by=user,
                )
                remaining -= take

        if remaining > 0 and stocks:
            # Nincs elég bevételezett készlet: az utolsó sor negatívba csúszik,
            # így egyértelműen jelzi a hiányzó bevételezést.
            last = stocks[-1]
            last.quantity -= remaining
            last.save(update_fields=['quantity', 'total_value'])
            StockMovement.objects.create(
                stock=last,
                movement_type='fuel_sale',
                from_warehouse=warehouse,
                quantity=remaining,
                notes=(
                    f'Üzemanyag eladás fedezetlen mennyiséggel: {fuel_transaction.pump} '
                    f'(kút tranzakció #{fuel_transaction.pk}) – hiányzó bevételezés?'
                ),
                created_by=user,
            )
            remaining = Decimal('0')

        fuel_transaction.stock_deducted = True
        fuel_transaction.save(update_fields=['stock_deducted'])

    return remaining
