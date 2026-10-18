import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { fillImage, lazyImage } from './imageLoader';

vi.mock('./blurhash.worker.ts', () => ({ default: class {
    addEventListener = vi.fn();
    postMessage = vi.fn();
} }));
vi.mock('../lazyLoader/lazyLoaderIntersectionObserver', () => ({ lazyChildren: vi.fn() }));
vi.mock('../../scripts/settings/userSettings', () => ({ enableFastFadein: () => true, enableBlurhash: () => false }));

const preloaders: HTMLImageElement[] = [];

beforeEach(() => {
    vi.stubGlobal('Image', function () {
        const image = document.createElement('img');
        preloaders.push(image);
        return image;
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
    preloaders.length = 0;
    document.body.textContent = '';
});

describe('poster placeholder lifecycle', () => {
    test.each([false, true])('hides and restores only the poster placeholder (library label: %s)', libraryLabel => {
        const root = document.createElement('div');
        root.innerHTML = libraryLabel ?
            '<div class="cardPadder cardImageWithLibrary"><div class="cardScalable"><div class="cardPadderContent"><span>Placeholder</span></div><a class="cardImageContainer" data-src="/poster.jpg"></a></div><div class="cardLibraryName">Filmy</div></div>' :
            '<div class="cardScalable"><div class="cardPadder"><span>Placeholder</span></div><a class="cardImageContainer" data-src="/poster.jpg"></a></div>';
        document.body.appendChild(root);
        const image = root.querySelector('.cardImageContainer');
        const placeholder = root.querySelector('.cardScalable > .cardPadder, .cardPadderContent');

        lazyImage(image);
        preloaders[0].dispatchEvent(new Event('load'));
        image?.dispatchEvent(new Event('animationend'));

        expect(placeholder?.classList.contains('lazy-hidden-children')).toBe(true);
        expect(root.querySelector('.cardImageWithLibrary')?.classList.contains('lazy-hidden-children') ?? false).toBe(false);
        expect(root.querySelector('.cardLibraryName')?.closest('.lazy-hidden-children')).toBeFalsy();

        fillImage({ target: image, isIntersecting: false });

        expect(placeholder?.classList.contains('lazy-hidden-children')).toBe(false);
        expect(image?.getAttribute('data-src')).toContain('/poster.jpg');
    });
});
