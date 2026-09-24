/**
 * Láthatja-e a felhasználó az árakat (RFQ/rendelés felületek).
 * A backend a profilban can_view_prices flagként küldi (superuser vagy
 * sales.rfqs view/manage jogosultság); a fallback a helyben számolt változat,
 * pl. ha a bejelentkezéskor mentett user objektum még régi.
 *
 * Aki NEM látja az árakat: a /sales/rfqs lista helyett a gyártási oldalakra
 * irányítjuk, és az RFQ adatlap butított módban jelenik meg neki.
 */
export const canViewPrices = (user: any): boolean => {
  if (!user) return false;
  if (user.can_view_prices !== undefined) return !!user.can_view_prices;
  if (user.is_superuser || user.is_staff) return true;
  const perms: any[] = Array.isArray(user.permissions) ? user.permissions : [];
  return perms.some(
    (p: any) =>
      p?.allowed &&
      p.module === 'sales' &&
      (!p.resource || p.resource === 'sales.rfqs') &&
      (p.action === 'view' || p.action === 'manage'),
  );
};
