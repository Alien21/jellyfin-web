import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import LibraryCard from './LibraryCard';

const mocks = vi.hoisted(() => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn()
}));

vi.mock('hooks/useApi', () => ({ useApi: () => ({ api: { subscribe: mocks.subscribe }, user: {} }) }));
vi.mock('lib/globalize', () => ({
    default: { translate: (key: string) => key },
    getCurrentDateTimeLocale: () => 'en-US'
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('components/cardbuilder/utils/builder', () => ({ getDefaultBackgroundClass: () => '' }));
vi.mock('components/mediaLibraryEditor/mediaLibraryEditor', () => ({ default: vi.fn() }));
vi.mock('components/imageeditor/imageeditor', () => ({ default: {} }));
vi.mock('components/refreshdialog/refreshdialog', () => ({ default: vi.fn() }));
vi.mock('components/InputDialog', () => ({ default: () => null }));
vi.mock('components/ConfirmDialog', () => ({ default: () => null }));
vi.mock('../api/useRenameVirtualFolder', () => ({ useRenameVirtualFolder: () => ({ mutate: vi.fn() }) }));
vi.mock('../api/useRemoveVirtualFolder', () => ({ useRemoveVirtualFolder: () => ({ mutate: vi.fn() }) }));
vi.mock('../api/invalidateVirtualFolders', () => ({ invalidateVirtualFolders: vi.fn() }));
vi.mock('../utils/collectionTypeOptions', () => ({ default: () => [] }));
vi.mock('utils/image', () => ({ getLibraryIcon: () => 'folder' }));
vi.mock('utils/dom', () => ({ default: {} }));

let root: Root;
let container: HTMLDivElement;

beforeAll(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
});

afterAll(() => {
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

describe('library refresh indicator', () => {
    test('uses the shared progress stream for the library and hides when it completes', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{ ItemId: 'library', Name: 'Movies' }} />));

        expect(container.querySelector('[role="progressbar"]')).toBeNull();
        expect(mocks.subscribe).toHaveBeenCalledWith([OutboundWebSocketMessageType.RefreshProgress], expect.any(Function));

        const onProgress = mocks.subscribe.mock.calls[0][1];
        await act(async () => onProgress({ Data: { ItemId: 'another-library', Progress: '25' } }));
        expect(container.querySelector('[role="progressbar"]')).toBeNull();

        await act(async () => onProgress({ Data: { ItemId: 'library', Progress: '42' } }));
        expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('42');
        expect(container.textContent).toContain('42%');

        await act(async () => onProgress({ Data: { ItemId: 'library', Progress: '100' } }));
        expect(container.querySelector('[role="progressbar"]')).toBeNull();
    });

    test('shows an existing refresh when the library card is opened', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{ ItemId: 'library', Name: 'Movies', RefreshProgress: 37 }} />));

        expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('37');
    });

    test('unsubscribes from refresh events when the card is removed', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{ ItemId: 'library', Name: 'Movies' }} />));
        await act(async () => root.render(null));

        expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    });
});
