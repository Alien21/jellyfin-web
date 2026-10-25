/// <reference types="vite/client" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { getRefreshIndicatorHtml, type RefreshItemInfo } from './refreshProgressState';

const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key }, getCurrentDateTimeLocale: () => 'en-US' }));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: {
        currentApiClient: () => ({ subscribe: mocks.subscribe }),
        getApiClient: () => ({ subscribe: mocks.subscribe })
    }
}));
vi.mock('utils/dom', () => ({
    default: { parentWithAttribute: (element: Element, attribute: string) => element.closest(`[${attribute}]`) }
}));
vi.mock('elements/emby-progressring/emby-progressring.template.html', async () => ({
    // eslint-disable-next-line import/no-unresolved -- Vitest loads the real HTML fixture through Vite's raw import.
    default: (await import('../emby-progressring/emby-progressring.template.html?raw')).default
}));

let registration: PropertyDescriptor | undefined;
let legacy: { createdCallback: (this: HTMLElement) => void; detachedCallback: (this: HTMLElement) => void };
let indicator: HTMLElement | undefined;

beforeAll(async () => {
    registration = Object.getOwnPropertyDescriptor(document, 'registerElement');
    Object.defineProperty(document, 'registerElement', { configurable: true, value: vi.fn() });
    legacy = (await import('./emby-itemrefreshindicator')).default;
});

afterAll(() => {
    if (registration) Object.defineProperty(document, 'registerElement', registration);
    else Reflect.deleteProperty(document, 'registerElement');
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
});

afterEach(() => {
    if (indicator) legacy.detachedCallback.call(indicator);
    indicator = undefined;
    document.body.innerHTML = '';
});

function openIndicator(item: RefreshItemInfo): HTMLElement {
    const card = document.createElement('div');
    card.dataset.id = 'library';
    card.innerHTML = getRefreshIndicatorHtml(item);
    document.body.appendChild(card);
    indicator = card.querySelector<HTMLElement>('[is="emby-itemrefreshindicator"]')!;
    legacy.createdCallback.call(indicator);
    return indicator;
}

function emit(data: Record<string, string>) {
    mocks.subscribe.mock.calls[0][1]({ Data: data });
}

describe('legacy library refresh indicator', () => {
    test('shows queued paths with the same fixed upper slot throughout a sequential refresh', () => {
        const element = openIndicator({ RefreshMode: 'Sequential', RefreshStatus: 'Queued', RefreshCurrentPath: 0, RefreshTotalPaths: 3 });
        const upper = element.querySelector<HTMLElement>('[data-refresh-slot="percentage"]')!;
        const lower = element.querySelector<HTMLElement>('[data-refresh-slot="paths"]')!;
        expect(element.classList.contains('hide')).toBe(false);
        expect(upper.style.visibility).toBe('hidden');
        expect(lower.querySelector('.progressring-text')?.textContent).toBe('0/3');

        emit({ ItemId: 'library', Status: 'Active', Mode: 'Sequential', CurrentPath: '1', TotalPaths: '3', Progress: '42' });
        expect(upper.style.visibility).toBe('visible');
        expect(upper.querySelector('.progressring-text')?.textContent).toBe('42%');
        expect(lower.querySelector('.progressring-text')?.textContent).toBe('1/3');

        emit({ ItemId: 'library', Status: 'Active', Mode: 'Sequential', CurrentPath: '2', TotalPaths: '3', Progress: '0' });
        expect(element.querySelector('[data-refresh-slot="percentage"]')).toBe(upper);
        expect(upper.style.visibility).toBe('hidden');
        expect(lower.querySelector('.progressring-text')?.textContent).toBe('2/3');

        emit({ ItemId: 'library', Status: 'Idle', Mode: 'Sequential', CurrentPath: '3', TotalPaths: '3', Progress: '100' });
        expect(element.classList.contains('hide')).toBe(true);
    });

    test('shows only one aggregate circle at zero and uses the server percentage', () => {
        const element = openIndicator({ RefreshMode: 'Aggregate', RefreshStatus: 'Active', RefreshCurrentPath: 0, RefreshTotalPaths: 3, RefreshProgress: 0 });
        const upper = element.querySelector<HTMLElement>('[data-refresh-slot="percentage"]')!;
        expect(element.classList.contains('hide')).toBe(false);
        expect(upper.style.visibility).toBe('visible');
        expect(upper.querySelector('.progressring-text')?.textContent).toBe('0%');
        expect(element.querySelector('[data-refresh-slot="paths"]')?.classList.contains('hide')).toBe(true);
        emit({ ItemId: 'library', Status: 'Active', Mode: 'Aggregate', CurrentPath: '0', TotalPaths: '3', Progress: '73' });
        expect(upper.querySelector('.progressring-text')?.textContent).toBe('73%');
    });

    test('keeps old-server behavior and ignores unrelated library events', () => {
        const element = openIndicator({ RefreshProgress: 37 });
        const upper = element.querySelector<HTMLElement>('[data-refresh-slot="percentage"]')!;
        expect(upper.querySelector('.progressring-text')?.textContent).toBe('37%');
        expect(element.querySelector('[data-refresh-slot="paths"]')?.classList.contains('hide')).toBe(true);
        emit({ ItemId: 'other-library', Progress: '90' });
        expect(upper.querySelector('.progressring-text')?.textContent).toBe('37%');
        emit({ ItemId: 'library', Progress: '100' });
        expect(element.classList.contains('hide')).toBe(true);
    });

    test('uses a logical library identity and releases the subscription on removal', () => {
        const element = openIndicator({ RefreshItemId: 'logical-library' });
        emit({ ItemId: 'library', Progress: '10' });
        expect(element.classList.contains('hide')).toBe(true);
        emit({ ItemId: 'logical-library', Progress: '42' });
        expect(element.classList.contains('hide')).toBe(false);
        legacy.detachedCallback.call(element);
        indicator = undefined;
        expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    });
});
