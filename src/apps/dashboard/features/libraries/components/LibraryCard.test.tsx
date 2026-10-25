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

    test('keeps a fixed upper slot and shows queued and active path counts until the library ends', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'library', Name: 'Movies', RefreshProgress: 0, RefreshStatus: 'Queued',
            RefreshMode: 'Sequential', RefreshCurrentPath: 0, RefreshTotalPaths: 3, RefreshOperationId: 'operation'
        }} />));
        const upperSlot = container.querySelector<HTMLElement>('[data-refresh-slot="percentage"]')!;
        const lowerSlot = container.querySelector<HTMLElement>('[data-refresh-slot="paths"]')!;
        expect(upperSlot.style.visibility).toBe('hidden');
        expect(lowerSlot.textContent).toBe('0/3');

        const onProgress = mocks.subscribe.mock.calls[0][1];
        await act(async () => onProgress({ Data: { ItemId: 'library', Status: 'Active', Mode: 'Sequential', CurrentPath: '1', TotalPaths: '3', Progress: '42', OperationId: 'operation' } }));
        expect(upperSlot.style.visibility).toBe('visible');
        expect(lowerSlot.textContent).toBe('1/3');
        expect(upperSlot.textContent).toBe('42%');

        await act(async () => onProgress({ Data: { ItemId: 'library', Status: 'Active', Mode: 'Sequential', CurrentPath: '1', TotalPaths: '3', Progress: '100', OperationId: 'operation' } }));
        expect(upperSlot.style.visibility).toBe('hidden');
        expect(container.querySelector('[data-refresh-slot="percentage"]')).toBe(upperSlot);
        expect(container.querySelector('[data-refresh-slot="paths"]')).toBe(lowerSlot);

        await act(async () => onProgress({ Data: { ItemId: 'library', Status: 'Active', Mode: 'Sequential', CurrentPath: '2', TotalPaths: '3', Progress: '0', OperationId: 'operation' } }));
        expect(upperSlot.style.visibility).toBe('hidden');
        expect(lowerSlot.textContent).toBe('2/3');

        await act(async () => onProgress({ Data: { ItemId: 'library', Status: 'Idle', Mode: 'Sequential', CurrentPath: '3', TotalPaths: '3', Progress: '100', OperationId: 'operation' } }));
        expect(container.querySelector('.refreshIndicator')).toBeNull();
    });

    test('uses one aggregate circle even at zero and hides it only when the operation ends', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'library', Name: 'Movies', RefreshProgress: 0, RefreshStatus: 'Active',
            RefreshMode: 'Aggregate', RefreshCurrentPath: 0, RefreshTotalPaths: 3, RefreshOperationId: 'operation'
        }} />));
        expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
        expect(container.querySelector('[data-refresh-slot="paths"]')).toBeNull();
        expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('0');

        const onProgress = mocks.subscribe.mock.calls[0][1];
        await act(async () => onProgress({ Data: { ItemId: 'library', Status: 'Active', Mode: 'Aggregate', CurrentPath: '0', TotalPaths: '3', Progress: '100', OperationId: 'operation' } }));
        expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
        await act(async () => onProgress({ Data: { ItemId: 'library', Status: 'Idle', Mode: 'Aggregate', CurrentPath: '0', TotalPaths: '3', Progress: '100', OperationId: 'operation' } }));
        expect(container.querySelector('[role="progressbar"]')).toBeNull();
    });

    test('maps a user-view card to its logical refresh identity', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{ ItemId: 'user-view', RefreshItemId: 'library', Name: 'Movies' }} />));
        const onProgress = mocks.subscribe.mock.calls[0][1];
        await act(async () => onProgress({ Data: { ItemId: 'user-view', Progress: '10' } }));
        expect(container.querySelector('[role="progressbar"]')).toBeNull();
        await act(async () => onProgress({ Data: { ItemId: 'library', Progress: '42' } }));
        expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('42');
    });

    test('restores a fresh initial snapshot when card data is refreshed', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'library', RefreshStatus: 'Queued', RefreshMode: 'Sequential', RefreshCurrentPath: 0, RefreshTotalPaths: 3
        }} />));
        expect(container.querySelector('[data-refresh-slot="paths"]')?.textContent).toBe('0/3');
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'library', RefreshStatus: 'Active', RefreshMode: 'Sequential', RefreshCurrentPath: 2, RefreshTotalPaths: 3, RefreshProgress: 20
        }} />));
        expect(container.querySelector('[data-refresh-slot="paths"]')?.textContent).toBe('2/3');
        expect(container.querySelector('[data-refresh-slot="percentage"]')?.textContent).toBe('20%');
    });

    test('keeps newer live progress when a slower HTTP snapshot for the same library arrives', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'library', RefreshStatus: 'Active', RefreshMode: 'Aggregate', RefreshCurrentPath: 0,
            RefreshTotalPaths: 3, RefreshProgress: 60, RefreshOperationId: 'operation'
        }} />));
        const onProgress = mocks.subscribe.mock.calls[0][1];
        await act(async () => onProgress({ Data: { ItemId: 'library', Status: 'Active', Mode: 'Aggregate', CurrentPath: '0', TotalPaths: '3', Progress: '80', OperationId: 'operation' } }));
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'library', RefreshStatus: 'Active', RefreshMode: 'Aggregate', RefreshCurrentPath: 0,
            RefreshTotalPaths: 3, RefreshProgress: 33, RefreshOperationId: 'operation'
        }} />));
        expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('80');
    });

    test('resets progress when the library identity changes even when an aggregate operation ID is shared', async () => {
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'user-view', RefreshItemId: 'first-library', RefreshStatus: 'Active', RefreshMode: 'Aggregate', RefreshCurrentPath: 0,
            RefreshTotalPaths: 3, RefreshProgress: 80, RefreshOperationId: 'shared-operation'
        }} />));
        await act(async () => root.render(<LibraryCard virtualFolder={{
            ItemId: 'user-view', RefreshItemId: 'second-library', RefreshStatus: 'Active', RefreshMode: 'Aggregate', RefreshCurrentPath: 0,
            RefreshTotalPaths: 3, RefreshProgress: 33, RefreshOperationId: 'shared-operation'
        }} />));
        expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('33');
    });
});
