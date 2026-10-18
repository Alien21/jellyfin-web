import { resolve } from 'node:path';
import { compile } from 'sass';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { ItemDto } from 'types/base/models/item-dto';
import { getCardsHtml } from './cardBuilder';

vi.mock('scripts/browser', () => ({ default: { slow: false, edge: false } }));
vi.mock('utils/dom', () => ({ default: { getWindowSize: () => ({ innerWidth: 1280, innerHeight: 900 }) } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('scripts/datetime', () => ({ default: { toLocaleString: (value: number) => String(value) } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({ serverId: () => 'test' }), getApi: () => ({}) } }));
vi.mock('components/focusManager', () => ({ default: {} }));
vi.mock('components/images/imageLoader', () => ({ default: { getPrimaryImageAspectRatio: () => 2 / 3 } }));
vi.mock('components/layoutManager', () => ({ default: { desktop: true, mobile: false, tv: false } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: { canPlay: () => true } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: () => '#item' } }));
vi.mock('components/shortcuts', () => ({ default: { getShortcutAttributesHtml: () => '' } }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('elements/emby-progressbar/emby-progressbar', () => ({}));
vi.mock('./utils/url', () => ({ getCardImageUrl: ({ item }: { item: ItemDto }) => ({
    imgUrl: item.ImageTags?.Primary ? '/poster.jpg' : undefined,
    coverImage: true,
    forceName: false
}) }));

const item = {
    Id: 'movie', ServerId: 'test', Type: 'Movie', MediaType: 'Video', Name: 'Movie',
    ProductionYear: 2026, ImageTags: { Primary: 'poster' }, LibraryName: 'Filmy',
    UserData: { Played: false }
};
const options = {
    shape: 'portrait', scalable: true, showTitle: true, showYear: true,
    disableIndicators: true, disableHoverMenu: true, showLibraryName: true
};
const render = (extra = {}, cardOptions = {}) => {
    const element = document.createElement('div');
    element.innerHTML = getCardsHtml([{ ...item, ...extra }], { ...options, ...cardOptions });
    document.body.appendChild(element);
    return element;
};

describe('library label card structure', () => {
    const style = document.createElement('style');

    beforeAll(() => {
        style.textContent = compile(resolve('src/components/cardbuilder/card.scss')).css;
        document.head.appendChild(style);
    });

    afterAll(() => {
        style.remove();
        document.body.textContent = '';
    });

    test('extends one native padder around the poster and library label', () => {
        const element = render();
        const surface = element.querySelector('.cardImageWithLibrary');
        const poster = surface?.querySelector('.cardScalable');

        expect(element.querySelectorAll('.cardPadder')).toHaveLength(1);
        expect(surface?.classList.contains('cardPadder')).toBe(true);
        expect(surface?.classList.contains('cardPadder-portrait')).toBe(false);
        expect(poster?.querySelector('.cardPadderContent.cardPadder-portrait')).not.toBeNull();
        expect(poster?.querySelector('.cardLibraryName')).toBeNull();
        expect(surface?.lastElementChild?.classList.contains('cardLibraryName')).toBe(true);
        expect(surface?.querySelector('.cardText')).toBeNull();
    });

    test('keeps the original poster padder when the label is disabled', () => {
        const element = render({}, { showLibraryName: false });

        expect(element.querySelector('.cardImageWithLibrary')).toBeNull();
        expect(element.querySelectorAll('.cardPadder')).toHaveLength(1);
        expect(element.querySelector('.cardScalable > .cardPadder.cardPadder-portrait')).not.toBeNull();
    });

    test('centers the loading placeholder without repositioning the fallback icon', () => {
        const withPoster = render();
        const withoutPoster = render({ ImageTags: undefined });
        const placeholder = withPoster.querySelector('.cardPadderContent > .cardImageIcon');
        const fallback = withoutPoster.querySelector('.cardImageContainer > .cardImageIcon');

        expect(placeholder).not.toBeNull();
        expect(fallback).not.toBeNull();
        expect(getComputedStyle(placeholder as Element).position).toBe('absolute');
        expect(getComputedStyle(fallback as Element).position).not.toBe('absolute');
    });
});
