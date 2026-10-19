import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { lockDocumentScroll } from './documentScrollLock';

const releases: Array<() => void> = [];
let fixtureStyles: HTMLStyleElement;
let unlockedWidth: number;
let lockedWidth: number;
let unlockedLeft: number;
let unlockedRenderedWidth: number;
let lockedRenderedWidth: number;

function acquireLock() {
    const release = lockDocumentScroll();
    releases.push(release);
    return release;
}

function getElement(id: string): HTMLElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing fixture ${id}`);
    return element;
}

beforeEach(() => {
    document.body.className = '';
    document.body.removeAttribute('style');
    document.body.innerHTML = `
        <main id="page" class="mainAnimatedPage"></main>
        <header id="header" class="skinHeader"></header>
        <header id="tvHeader" class="skinHeader"></header>
        <header id="autoHeader" class="skinHeader"></header>`;
    fixtureStyles = document.createElement('style');
    fixtureStyles.textContent = `
        body { padding-right: 5px; padding-left: 7px; }
        .mainAnimatedPage { position: absolute; right: 4px; left: 3px; }
        .skinHeader { position: fixed; right: 9px; left: 10px; }
        #tvHeader { position: relative; right: 24px; }
        #autoHeader { right: auto; }
        .noScroll { overflow: hidden !important; }`;
    document.head.appendChild(fixtureStyles);
    document.body.style.setProperty('padding-right', '5px', 'important');
    getElement('header').style.setProperty('right', '9px', 'important');

    unlockedWidth = 1007;
    lockedWidth = 1024;
    unlockedLeft = 0;
    unlockedRenderedWidth = 1007;
    lockedRenderedWidth = 1024;
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockImplementation(() => {
        const width = document.body.classList.contains('noScroll') ? lockedRenderedWidth : unlockedRenderedWidth;
        return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 768, width, height: 768, toJSON: () => ({}) };
    });
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockImplementation(() =>
        document.body.classList.contains('noScroll') ? lockedWidth : unlockedWidth);
    vi.spyOn(document.documentElement, 'clientLeft', 'get').mockImplementation(() =>
        document.body.classList.contains('noScroll') ? 0 : unlockedLeft);
});

afterEach(() => {
    for (const release of releases.splice(0)) release();
    vi.restoreAllMocks();
    fixtureStyles.remove();
    document.body.innerHTML = '';
    document.body.className = '';
    document.body.removeAttribute('style');
});

describe('document scroll locking', () => {
    test('preserves page and fixed-header geometry and restores inline values and priorities', () => {
        const release = acquireLock();

        expect(document.body.classList.contains('noScroll')).toBe(true);
        expect(document.body.style.paddingRight).toBe('22px');
        expect(getElement('page').style.right).toBe('21px');
        expect(getElement('header').style.right).toBe('26px');
        expect(getElement('tvHeader').style.right).toBe('');
        expect(getElement('autoHeader').style.right).toBe('');
        document.body.style.color = 'red';

        release();

        expect(document.body.classList.contains('noScroll')).toBe(false);
        expect(document.body.style.paddingRight).toBe('5px');
        expect(document.body.style.getPropertyPriority('padding-right')).toBe('important');
        expect(getElement('header').style.right).toBe('9px');
        expect(getElement('header').style.getPropertyPriority('right')).toBe('important');
        expect(getElement('page').style.right).toBe('');
        expect(window.getComputedStyle(getElement('page')).right).toBe('4px');
        expect(document.body.style.color).toBe('red');
    });

    test('keeps the lock and a single compensation until all nested dialogs close in any order', () => {
        const releaseOuter = acquireLock();
        const releaseInner = acquireLock();
        releaseOuter();
        releaseOuter();

        expect(document.body.classList.contains('noScroll')).toBe(true);
        expect(document.body.style.paddingRight).toBe('22px');
        expect(getElement('page').style.right).toBe('21px');

        releaseInner();

        expect(document.body.classList.contains('noScroll')).toBe(false);
        expect(document.body.style.paddingRight).toBe('5px');
        expect(getElement('page').style.right).toBe('');
    });

    test.each([1007, 1024])('does not compensate stable gutters or overlay scrollbars when rendered width stays %s', width => {
        unlockedWidth = lockedWidth = width;
        unlockedRenderedWidth = lockedRenderedWidth = width;
        document.body.classList.add('screensaver-noScroll', 'bodyWithPopupOpen');
        const originalBodyStyle = document.body.style.cssText;
        const originalHeaderStyle = getElement('header').style.cssText;
        const release = acquireLock();

        expect(document.body.classList.contains('noScroll')).toBe(true);
        expect(document.body.style.cssText).toBe(originalBodyStyle);
        expect(getElement('header').style.cssText).toBe(originalHeaderStyle);
        expect(getElement('page').style.right).toBe('');

        release();

        expect(document.body.classList.contains('screensaver-noScroll')).toBe(true);
        expect(document.body.classList.contains('bodyWithPopupOpen')).toBe(true);
        expect(document.body.classList.contains('noScroll')).toBe(false);
    });

    test('does not compensate a stable gutter when clientWidth grows but the rendered root width stays unchanged', () => {
        unlockedRenderedWidth = lockedRenderedWidth = 1007;
        const originalBodyStyle = document.body.style.cssText;
        const originalHeaderStyle = getElement('header').style.cssText;
        expect(document.documentElement.clientWidth).toBe(1007);
        const release = acquireLock();

        expect(document.documentElement.clientWidth).toBe(1024);
        expect(document.documentElement.getBoundingClientRect().width).toBe(1007);
        expect(document.body.style.cssText).toBe(originalBodyStyle);
        expect(getElement('header').style.cssText).toBe(originalHeaderStyle);
        expect(getElement('page').style.right).toBe('');

        release();

        expect(document.body.classList.contains('noScroll')).toBe(false);
        expect(document.body.style.cssText).toBe(originalBodyStyle);
    });

    test('preserves a document scroll lock that existed before any dialog', () => {
        document.body.classList.add('noScroll');
        const originalStyle = document.body.style.cssText;
        const release = acquireLock();

        release();

        expect(document.body.classList.contains('noScroll')).toBe(true);
        expect(document.body.style.cssText).toBe(originalStyle);
        expect(getElement('page').style.right).toBe('');
    });

    test('removes temporary inline styles when the original offsets came from stylesheets', () => {
        document.body.style.removeProperty('padding-right');
        getElement('header').style.removeProperty('right');
        const release = acquireLock();

        expect(document.body.style.paddingRight).toBe('22px');
        expect(getElement('header').style.right).toBe('26px');

        release();

        expect(document.body.style.paddingRight).toBe('');
        expect(document.body.style.getPropertyPriority('padding-right')).toBe('');
        expect(getElement('header').style.right).toBe('');
        expect(window.getComputedStyle(document.body).paddingRight).toBe('5px');
        expect(window.getComputedStyle(getElement('header')).right).toBe('9px');
    });

    test('compensates the physical left side when the removed scrollbar was on the left', () => {
        unlockedLeft = 17;
        const release = acquireLock();

        expect(document.body.style.paddingLeft).toBe('24px');
        expect(document.body.style.paddingRight).toBe('5px');
        expect(getElement('page').style.left).toBe('20px');
        expect(getElement('header').style.left).toBe('27px');
        expect(getElement('page').style.right).toBe('');
        expect(getElement('header').style.right).toBe('9px');

        release();

        expect(document.body.style.paddingLeft).toBe('');
        expect(getElement('page').style.left).toBe('');
        expect(getElement('header').style.left).toBe('');
    });
});
