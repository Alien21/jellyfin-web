import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { describe, expect, test } from 'vitest';

import { getLibraryLabelHtml } from './libraryLabel';

describe('getLibraryLabelHtml', () => {
    test.each(['Filmy', '4K filmy', '3D filmy'])('shows the server-provided library name %s', LibraryName => {
        const element = document.createElement('div');
        element.innerHTML = getLibraryLabelHtml({ Type: BaseItemKind.Movie, LibraryName }, { showLibraryName: true });

        expect(element.querySelector('.cardLibraryName')?.textContent).toBe(LibraryName);
        expect(element.querySelector('.cardLibraryName')?.getAttribute('title')).toBe(LibraryName);
    });

    test('escapes library names in the text and tooltip', () => {
        const LibraryName = '4K "filmy" <img src=x onerror=alert(1)> & 3D';
        const element = document.createElement('div');
        element.innerHTML = getLibraryLabelHtml({ Type: BaseItemKind.Movie, LibraryName }, { showLibraryName: true });

        expect(element.querySelector('.cardLibraryName')?.textContent).toBe(LibraryName);
        expect(element.querySelector('.cardLibraryName')?.getAttribute('title')).toBe(LibraryName);
        expect(element.querySelector('img')).toBeNull();
        expect(element.querySelector('[onerror]')).toBeNull();
    });

    test.each([undefined, null, '', '   '])('omits a missing or empty library name (%s)', LibraryName => {
        expect(getLibraryLabelHtml({ Type: BaseItemKind.Movie, LibraryName }, { showLibraryName: true })).toBe('');
    });

    test.each([BaseItemKind.Series, BaseItemKind.Episode, BaseItemKind.MusicAlbum, BaseItemKind.Video])('shows the actual library for %s', Type => {
        const element = document.createElement('div');
        element.innerHTML = getLibraryLabelHtml({ Type, LibraryName: 'Moje knihovna' }, { showLibraryName: true });

        expect(element.querySelector('.cardLibraryName')?.textContent).toBe('Moje knihovna');
    });

    test.each([BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode, BaseItemKind.MusicAlbum, BaseItemKind.Person])('does not invent a library for %s', Type => {
        expect(getLibraryLabelHtml({ Type }, { showLibraryName: true })).toBe('');
    });

    test('requires the library label card option', () => {
        const item = { Type: BaseItemKind.Movie, LibraryName: '4K filmy' };

        expect(getLibraryLabelHtml(item, {})).toBe('');
    });

    test('shows the library label independently of image indicators', () => {
        expect(getLibraryLabelHtml({ Type: BaseItemKind.Movie, LibraryName: '4K filmy' }, {
            showLibraryName: true,
            disableIndicators: true
        })).toContain('4K filmy');
    });
});
