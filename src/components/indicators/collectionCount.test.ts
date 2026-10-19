import { beforeEach, describe, expect, test, vi } from 'vitest';

import { getChildCountIndicatorHtml } from './indicators';
import { getPrimaryMediaInfoHtml } from '../mediainfo/mediainfo';
import { isLibrarySourceDetailsEnabled } from 'utils/extensions';

vi.mock('utils/extensions', () => ({ isLibrarySourceDetailsEnabled: vi.fn(() => true) }));
vi.mock('scripts/datetime', () => ({ default: {} }));
vi.mock('components/itemHelper', () => ({ default: {} }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('scripts/settings/userSettings', () => ({}));
vi.mock('lib/globalize', () => ({
    default: { translate: (key: string, count: number) => `${key}: ${count}` }
}));
vi.mock('elements/emby-progressbar/emby-progressbar', () => ({}));
vi.mock('elements/emby-button/emby-button', () => ({}));
vi.mock('material-design-icons-iconfont', () => ({}));

const collection = { Type: 'BoxSet', ChildCount: 10, UniqueItemCount: 7 };

function textContent(html: string) {
    const element = document.createElement('div');
    element.innerHTML = html;
    return element.textContent;
}

describe('collection counts', () => {
    beforeEach(() => {
        vi.mocked(isLibrarySourceDetailsEnabled).mockReturnValue(true);
    });

    test('keeps physical item counts when library source details are disabled', () => {
        vi.mocked(isLibrarySourceDetailsEnabled).mockReturnValue(false);

        expect(textContent(getChildCountIndicatorHtml(collection))).toBe('10');
        expect(textContent(getPrimaryMediaInfoHtml(collection))).toBe('ItemCount: 10');
    });
    test('shows distinct titles in both the collection badge and detail header', () => {
        expect(textContent(getChildCountIndicatorHtml(collection))).toBe('7');
        expect(textContent(getPrimaryMediaInfoHtml(collection))).toBe('ItemCount: 7');
    });

    test.each([undefined, null])('falls back to the item count when the distinct count is %s', uniqueCount => {
        const item = { ...collection, UniqueItemCount: uniqueCount };

        expect(textContent(getChildCountIndicatorHtml(item))).toBe('10');
        expect(textContent(getPrimaryMediaInfoHtml(item))).toBe('ItemCount: 10');
    });

    test('does not replace a zero distinct count with the raw item count', () => {
        const item = { ...collection, UniqueItemCount: 0 };

        expect(getChildCountIndicatorHtml(item)).toBe('');
        expect(getPrimaryMediaInfoHtml(item)).toBe('');
    });

    test('keeps the raw count for other item types', () => {
        const item = { ...collection, Type: 'PhotoAlbum' };

        expect(textContent(getChildCountIndicatorHtml(item))).toBe('10');
        expect(textContent(getPrimaryMediaInfoHtml(item))).toBe('ItemCount: 10');
    });

    test('applies the badge threshold to distinct titles', () => {
        expect(getChildCountIndicatorHtml(collection, { minCount: 7 })).toBe('');
        expect(textContent(getChildCountIndicatorHtml(collection, { minCount: 6 }))).toBe('7');
    });

    test('caps the badge at 99+ while the header keeps the distinct title count', () => {
        const item = { ...collection, ChildCount: 120, UniqueItemCount: 100 };

        expect(textContent(getChildCountIndicatorHtml(item))).toBe('99+');
        expect(textContent(getPrimaryMediaInfoHtml(item))).toBe('ItemCount: 100');
    });

    test('does not cap the badge when only the raw count exceeds 99', () => {
        const item = { ...collection, ChildCount: 120, UniqueItemCount: 99 };

        expect(textContent(getChildCountIndicatorHtml(item))).toBe('99');
        expect(textContent(getPrimaryMediaInfoHtml(item))).toBe('ItemCount: 99');
    });
});
