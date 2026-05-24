/**
 * Intelligens keresési utility függvények
 */

/**
 * Normalizálja a szöveget a kereséshez:
 * - Eltávolítja az ékezeteket
 * - Kisbetűsít
 * - Eltávolítja a speciális karaktereket (csak betűk, számok és szóközök maradnak)
 */
export const normalizeTextForSearch = (text: string): string => {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '');
};

/**
 * Intelligens keresési függvény Select komponensekhez
 * - Case-insensitive
 * - Ékezet-független
 * - Közbenső karakterlánc keresés
 */
export const createIntelligentFilter = () => {
    return (input: string, option: any): boolean => {
        const children = option?.children as unknown as string;
        if (!children || typeof children !== 'string') return false;

        const normalizedInput = normalizeTextForSearch(input);
        const normalizedChildren = normalizeTextForSearch(children);

        return normalizedChildren.includes(normalizedInput);
    };
};

/**
 * Több mezőben kereső függvény
 * @param searchText - A keresett szöveg
 * @param fields - A mezők, amikben keresni kell
 * @returns true ha bármelyik mezőben megtalálja
 */
export const searchInMultipleFields = (searchText: string, fields: (string | null | undefined)[]): boolean => {
    const normalizedInput = normalizeTextForSearch(searchText);

    return fields.some(field => {
        if (!field) return false;
        const normalizedField = normalizeTextForSearch(field);
        return normalizedField.includes(normalizedInput);
    });
};

const collectDeepSearchValues = (value: unknown, collected: string[]): void => {
    if (value === null || value === undefined) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        collected.push(String(value));
        return;
    }

    if (value instanceof Date) {
        collected.push(value.toISOString());
        return;
    }

    if (Array.isArray(value)) {
        value.forEach((item) => collectDeepSearchValues(item, collected));
        return;
    }

    if (typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((nestedValue) => {
            collectDeepSearchValues(nestedValue, collected);
        });
    }
};

export const deepSearchMatch = (searchText: string, value: unknown): boolean => {
    if (!searchText || !searchText.trim()) return true;

    const searchableValues: string[] = [];
    collectDeepSearchValues(value, searchableValues);

    // Split query into tokens — all tokens must match somewhere in the record (AND logic)
    const tokens = normalizeTextForSearch(searchText).split(/\s+/).filter(Boolean);
    const combined = searchableValues.map(v => normalizeTextForSearch(v)).join(' ');
    return tokens.every(token => combined.includes(token));
};
