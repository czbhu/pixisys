"""Guillotine cutting optimizer for sheet and roll materials.

Calculates how many product pieces fit on a raw material sheet/roll,
and generates remnant rectangles from the leftover after guillotine cutting.

Guillotine cut = egymás utáni egyenes vágások. A hulladékot 2 téglalapra
bontjuk: jobb csík + alsó csík (standard nyomdaipari megközelítés).
"""
import math
from typing import Optional


def optimize_sheet_cut(
    mat_w_mm: float,
    mat_h_mm: float,
    prod_w_mm: float,
    prod_h_mm: float,
    bleed_mm: float = 0.0,
    allow_rotate: bool = True,
) -> dict:
    """Táblavágás optimalizálás — hány termék fér egy táblára?

    Args:
        mat_w_mm, mat_h_mm: Alapanyag tábla mérete mm-ben.
        prod_w_mm, prod_h_mm: Termék mérete mm-ben (vérzés nélkül).
        bleed_mm: Vérzés (bleed) mm mindkét irányban — a termék mindkét
                  oldalát megnöveli, tehát a nettó nyomtatandó terület
                  (prod_w + 2*bleed) × (prod_h + 2*bleed) lesz.
        allow_rotate: Próbáljuk-e 90°-ra forgatva is az elhelyezést?

    Returns dict:
        fit_count:       hány termék fér egy táblára
        layout:          {'cols': int, 'rows': int, 'rotated': bool,
                          'piece_w_mm': float, 'piece_h_mm': float}
        remnants:        [{'width_mm': float, 'height_mm': float}, ...]
                         guillotine vágás utáni 1-2 hulló téglalap
        utilization_pct: anyagkihozatal %
        sheets_area_mm2: tábla területe mm²-ben
        used_area_mm2:   felhasznált terület mm²-ben
    """
    pw = prod_w_mm + 2 * bleed_mm  # piece footprint w
    ph = prod_h_mm + 2 * bleed_mm  # piece footprint h

    if pw <= 0 or ph <= 0 or mat_w_mm <= 0 or mat_h_mm <= 0:
        return {
            'fit_count': 0,
            'layout': {'cols': 0, 'rows': 0, 'rotated': False,
                       'piece_w_mm': pw, 'piece_h_mm': ph},
            'remnants': [],
            'utilization_pct': 0.0,
            'sheet_area_mm2': mat_w_mm * mat_h_mm,
            'used_area_mm2': 0.0,
        }

    # Normál elhelyezés
    cols_n = math.floor(mat_w_mm / pw)
    rows_n = math.floor(mat_h_mm / ph)
    count_n = cols_n * rows_n

    # Forgatott elhelyezés (termék 90°-ra)
    count_r = 0
    cols_r = rows_r = 0
    if allow_rotate and abs(pw - ph) > 0.01:
        cols_r = math.floor(mat_w_mm / ph)
        rows_r = math.floor(mat_h_mm / pw)
        count_r = cols_r * rows_r

    if count_n >= count_r:
        cols, rows, rotated = cols_n, rows_n, False
        eff_pw, eff_ph = pw, ph
    else:
        cols, rows, rotated = cols_r, rows_r, True
        eff_pw, eff_ph = ph, pw  # forgatott: a termék "w" a táblán "h" irányba megy

    fit_count = cols * rows

    # Guillotine hulló téglalapok (2 db)
    used_w = cols * eff_pw
    used_h = rows * eff_ph
    remnants = []
    MIN_SLIVER_MM = 10.0  # 1 cm alatt ignoráljuk
    right_strip_w = mat_w_mm - used_w
    if right_strip_w >= MIN_SLIVER_MM and mat_h_mm >= MIN_SLIVER_MM:
        remnants.append({'width_mm': right_strip_w, 'height_mm': mat_h_mm})
    bottom_strip_h = mat_h_mm - used_h
    if bottom_strip_h >= MIN_SLIVER_MM and used_w >= MIN_SLIVER_MM:
        remnants.append({'width_mm': used_w, 'height_mm': bottom_strip_h})

    sheet_area = mat_w_mm * mat_h_mm
    # Kihozatal = termék nettó területe / tábla területe (vérzés nélkül)
    net_product_area = prod_w_mm * prod_h_mm * fit_count
    utilization_pct = (net_product_area / sheet_area * 100) if sheet_area > 0 else 0.0

    return {
        'fit_count': fit_count,
        'layout': {
            'cols': cols,
            'rows': rows,
            'rotated': rotated,
            'piece_w_mm': eff_pw,
            'piece_h_mm': eff_ph,
        },
        'remnants': remnants,
        'utilization_pct': round(utilization_pct, 1),
        'sheet_area_mm2': sheet_area,
        'used_area_mm2': used_w * used_h,
    }


def optimize_roll_cut(
    roll_width_mm: float,
    prod_w_mm: float,
    prod_h_mm: float,
    bleed_mm: float = 0.0,
    allow_rotate: bool = True,
) -> dict:
    """Tekercs-vágás optimalizálás — hány termék fér el szélességben?

    Tekercsnél a tekercs szélessége fix, a hossza vágható tetszőlegesen.
    Az optimalizálás csak a szélességi elhelyezést érinti.

    Args:
        roll_width_mm: Tekercs szélessége mm-ben.
        prod_w_mm, prod_h_mm: Termék mérete mm-ben.
        bleed_mm: Vérzés mm-ben.
        allow_rotate: 90°-os forgatás engedélyezése.

    Returns dict:
        cols:               hány termék fér el egymás mellett
        length_per_row_mm:  egy sor tekercs hossza mm-ben (= termék magassága + 2*bleed)
        side_remnant_mm:    oldalsáv hulló mm-ben
        rotated:            forgattuk-e a terméket
        utilization_pct:    szélességi kihasználtság %
    """
    pw = prod_w_mm + 2 * bleed_mm
    ph = prod_h_mm + 2 * bleed_mm

    if pw <= 0 or ph <= 0 or roll_width_mm <= 0:
        return {
            'cols': 0,
            'length_per_row_mm': ph,
            'side_remnant_mm': roll_width_mm,
            'rotated': False,
            'utilization_pct': 0.0,
        }

    cols_n = math.floor(roll_width_mm / pw)
    length_n = ph  # ha nem forgatjuk, a hosszirány = termék magassága (bleedel)

    cols_r = 0
    length_r = pw
    if allow_rotate and abs(pw - ph) > 0.01:
        cols_r = math.floor(roll_width_mm / ph)
        length_r = pw

    if cols_n >= cols_r:
        cols, length_per_row, rotated = cols_n, length_n, False
        eff_pw = pw
    else:
        cols, length_per_row, rotated = cols_r, length_r, True
        eff_pw = ph

    side_remnant = roll_width_mm - cols * eff_pw
    utilization_pct = (cols * eff_pw / roll_width_mm * 100) if roll_width_mm > 0 else 0.0

    return {
        'cols': cols,
        'length_per_row_mm': length_per_row,
        'side_remnant_mm': max(0.0, side_remnant),
        'rotated': rotated,
        'utilization_pct': round(utilization_pct, 1),
    }


def sheets_needed_for_quantity(fit_per_sheet: int, quantity: int) -> int:
    """Hány tábla kell a megadott darabszámhoz?"""
    if fit_per_sheet <= 0:
        return 0
    return math.ceil(quantity / fit_per_sheet)


def roll_length_needed_mm(cols: int, length_per_row_mm: float, quantity: int) -> float:
    """Szükséges tekercs hossza mm-ben a megadott darabszámhoz."""
    if cols <= 0:
        return 0.0
    rows = math.ceil(quantity / cols)
    return rows * length_per_row_mm
