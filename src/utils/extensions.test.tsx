import type { ApiClient } from 'jellyfin-apiclient';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import SearchResultsRow from 'apps/legacy/features/search/components/SearchResultsRow';
import { loadResume } from 'components/homesections/sections/resume';
import type { SectionContainerElement } from 'components/homesections/sections/section';
import type { UserSettings } from 'scripts/settings/userSettings';
import { isLibrarySourceDetailsEnabled, isPlaybackVersionSelectionEnabled, setLibrarySourceDetailsEnabled, setPlaybackVersionSelectionEnabled } from './extensions';

const mocks = vi.hoisted(() => ({
    currentApiClient: vi.fn(),
    getApiClient: vi.fn(),
    getApi: vi.fn(),
    getResumeItemsQuery: vi.fn(),
    fetchQuery: vi.fn(),
    getCardsHtml: vi.fn(() => ''),
    buildCards: vi.fn()
}));

vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: {
        currentApiClient: mocks.currentApiClient,
        getApiClient: mocks.getApiClient,
        getApi: mocks.getApi
    }
}));
vi.mock('lib/jellyfin-apiclient/ServerConnections', () => ({
    default: {
        currentApiClient: mocks.currentApiClient,
        getApiClient: mocks.getApiClient,
        getApi: mocks.getApi
    }
}));
vi.mock('components/cardbuilder/cardBuilder', () => ({
    default: { getCardsHtml: mocks.getCardsHtml, buildCards: mocks.buildCards }
}));
vi.mock('components/cardbuilder/utils/shape', () => ({
    getBackdropShape: () => 'backdrop',
    getPortraitShape: () => 'portrait'
}));
vi.mock('apps/legacy/features/libraries/api/useResumeItems', () => ({ getResumeItemsQuery: mocks.getResumeItemsQuery }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: mocks.fetchQuery } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('elements/emby-itemscontainer/emby-itemscontainer', () => ({}));

type ServerInfo = { Id: string; EnableLibrarySourceDetails?: boolean; EnablePlaybackVersionSelection?: boolean };

function createClient(id: string, enabled?: boolean) {
    let info: ServerInfo = { Id: id, EnableLibrarySourceDetails: enabled };
    return {
        serverId: () => id,
        getCurrentUserId: () => `${id}-user`,
        serverAddress: () => `https://${id}.example`,
        serverInfo: vi.fn((updated?: ServerInfo) => {
            if (updated) info = updated;
            return info;
        }),
        updateServerInfo: vi.fn()
    };
}

let currentClient: ReturnType<typeof createClient>;
let otherClient: ReturnType<typeof createClient>;

beforeEach(() => {
    vi.clearAllMocks();
    currentClient = createClient('current');
    otherClient = createClient('other', true);
    mocks.currentApiClient.mockReturnValue(currentClient);
    mocks.getApiClient.mockImplementation((id?: string) => {
        // The real connection manager rejects missing IDs; currentApiClient selects the active server.
        if (!id) throw new Error('item or serverId cannot be null');
        if (id === 'current') return currentClient;
        if (id === 'other') return otherClient;
        return undefined;
    });
    mocks.getCardsHtml.mockClear();
    mocks.buildCards.mockClear();
});

describe('library source details server capability', () => {
    test('defaults to disabled when the server has not advertised support', () => {
        expect(isLibrarySourceDetailsEnabled()).toBe(false);
    });

    test.each([undefined, null])('uses the current client when the server ID is %s', serverId => {
        currentClient.serverInfo({ Id: 'current', EnableLibrarySourceDetails: true });

        expect(isLibrarySourceDetailsEnabled(serverId)).toBe(true);
        expect(mocks.currentApiClient).toHaveBeenCalledOnce();
        expect(mocks.getApiClient).not.toHaveBeenCalled();
    });

    test('does not fall back to the current client for an unknown explicit server', () => {
        currentClient.serverInfo({ Id: 'current', EnableLibrarySourceDetails: true });

        expect(isLibrarySourceDetailsEnabled('missing')).toBe(false);
        expect(mocks.getApiClient).toHaveBeenCalledWith('missing');
        expect(mocks.currentApiClient).not.toHaveBeenCalled();
    });

    test('defaults to disabled without a current server', () => {
        mocks.currentApiClient.mockReturnValue(undefined);

        expect(isLibrarySourceDetailsEnabled()).toBe(false);
    });

    test('uses the requested server independently of the current server', () => {
        expect(isLibrarySourceDetailsEnabled()).toBe(false);
        expect(isLibrarySourceDetailsEnabled('other')).toBe(true);
        expect(isLibrarySourceDetailsEnabled('current')).toBe(false);
        expect(isLibrarySourceDetailsEnabled('missing')).toBe(false);
    });

    test('follows a change of the selected server', () => {
        mocks.currentApiClient.mockReturnValue(otherClient);

        expect(isLibrarySourceDetailsEnabled()).toBe(true);
    });

    test('updates and persists the current server capability without changing another server', () => {
        setLibrarySourceDetailsEnabled(true);

        expect(mocks.currentApiClient).toHaveBeenCalledOnce();
        expect(mocks.getApiClient).not.toHaveBeenCalled();
        expect(isLibrarySourceDetailsEnabled()).toBe(true);
        expect(currentClient.updateServerInfo).toHaveBeenLastCalledWith(
            { Id: 'current', EnableLibrarySourceDetails: true },
            'https://current.example'
        );

        setLibrarySourceDetailsEnabled(false);

        expect(isLibrarySourceDetailsEnabled()).toBe(false);
        expect(currentClient.updateServerInfo).toHaveBeenLastCalledWith(
            { Id: 'current', EnableLibrarySourceDetails: false },
            'https://current.example'
        );
        expect(isLibrarySourceDetailsEnabled('other')).toBe(true);
        expect(otherClient.updateServerInfo).not.toHaveBeenCalled();
    });

    test('does not save settings without a current connection', () => {
        mocks.currentApiClient.mockReturnValue(undefined);

        expect(() => setLibrarySourceDetailsEnabled(true)).not.toThrow();
        expect(mocks.currentApiClient).toHaveBeenCalledOnce();
        expect(mocks.getApiClient).not.toHaveBeenCalled();
        expect(currentClient.updateServerInfo).not.toHaveBeenCalled();
        expect(otherClient.updateServerInfo).not.toHaveBeenCalled();
    });
});

describe('playback version selection server capability', () => {
    test('defaults to disabled on an older server or without a connection', () => {
        expect(isPlaybackVersionSelectionEnabled()).toBe(false);
        mocks.currentApiClient.mockReturnValue(undefined);
        expect(isPlaybackVersionSelectionEnabled()).toBe(false);
    });

    test.each([undefined, null])('uses the current client when the server ID is %s', serverId => {
        currentClient.serverInfo({ Id: 'current', EnablePlaybackVersionSelection: true });

        expect(isPlaybackVersionSelectionEnabled(serverId)).toBe(true);
        expect(mocks.getApiClient).not.toHaveBeenCalled();
    });

    test('uses only the requested server capability', () => {
        otherClient.serverInfo({ Id: 'other', EnablePlaybackVersionSelection: true });

        expect(isPlaybackVersionSelectionEnabled('other')).toBe(true);
        expect(isPlaybackVersionSelectionEnabled('current')).toBe(false);
        expect(isPlaybackVersionSelectionEnabled('missing')).toBe(false);
        expect(mocks.currentApiClient).not.toHaveBeenCalled();
    });

    test('applies and persists the saved capability without changing other settings or servers', () => {
        currentClient.serverInfo({ Id: 'current', EnableLibrarySourceDetails: true });

        setPlaybackVersionSelectionEnabled(true);

        expect(isPlaybackVersionSelectionEnabled()).toBe(true);
        expect(isLibrarySourceDetailsEnabled()).toBe(true);
        expect(currentClient.updateServerInfo).toHaveBeenLastCalledWith(
            { Id: 'current', EnableLibrarySourceDetails: true, EnablePlaybackVersionSelection: true },
            'https://current.example'
        );

        setPlaybackVersionSelectionEnabled(false);

        expect(isPlaybackVersionSelectionEnabled()).toBe(false);
        expect(otherClient.updateServerInfo).not.toHaveBeenCalled();
    });

    test('does not save settings without a current connection', () => {
        mocks.currentApiClient.mockReturnValue(undefined);

        expect(() => setPlaybackVersionSelectionEnabled(true)).not.toThrow();
        expect(currentClient.updateServerInfo).not.toHaveBeenCalled();
    });
});

describe('library label consumers', () => {
    beforeAll(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    test.each([false, true])('applies the server setting (%s) to search result library labels', enabled => {
        currentClient.serverInfo({ Id: 'current', EnableLibrarySourceDetails: enabled });
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        try {
            act(() => {
                root.render(<SearchResultsRow items={[{ Id: 'movie', Type: 'Movie' }]} />);
            });

            expect(mocks.buildCards).toHaveBeenLastCalledWith(
                [{ Id: 'movie', Type: 'Movie' }],
                expect.objectContaining({ showLibraryName: enabled })
            );
        } finally {
            act(() => root.unmount());
            container.remove();
        }
    });

    test('does not allow search card options to enable library labels while the server setting is disabled', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        try {
            act(() => {
                root.render(
                    <SearchResultsRow
                        items={[{ Id: 'movie', Type: 'Movie' }]}
                        cardOptions={{ showLibraryName: true }}
                    />
                );
            });

            expect(mocks.buildCards).toHaveBeenLastCalledWith(
                [{ Id: 'movie', Type: 'Movie' }],
                expect.objectContaining({ showLibraryName: false })
            );
        } finally {
            act(() => root.unmount());
            container.remove();
        }
    });

    test('refreshes search library labels after the server setting changes with the same card props', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const items = [{ Id: 'movie', Type: 'Movie' as const }];
        const cardOptions = { showTitle: true };

        try {
            for (const enabled of [false, true, false]) {
                currentClient.serverInfo({ Id: 'current', EnableLibrarySourceDetails: enabled });
                act(() => {
                    root.render(<SearchResultsRow items={items} cardOptions={cardOptions} />);
                });

                expect(mocks.buildCards).toHaveBeenLastCalledWith(
                    items,
                    expect.objectContaining({ showLibraryName: enabled })
                );
            }
            expect(mocks.buildCards).toHaveBeenCalledTimes(3);
        } finally {
            act(() => root.unmount());
            container.remove();
        }
    });

    test.each([false, true])('fetches continue watching items with the server setting %s', async enabled => {
        currentClient.serverInfo({ Id: 'current', EnableLibrarySourceDetails: enabled });
        const container = document.createElement('div');
        const userSettings = { useEpisodeImagesInNextUpAndResume: () => false } as UserSettings;
        const api = { server: 'current' };
        const query = { queryKey: ['resume', 'current'] };
        const items = [{ Id: 'movie', Type: 'Movie' }];
        mocks.getApi.mockReturnValue(api);
        mocks.getResumeItemsQuery.mockReturnValue(query);
        mocks.fetchQuery.mockResolvedValue(items);

        loadResume(
            container,
            currentClient as unknown as ApiClient,
            'ContinueWatching',
            'Video',
            userSettings,
            { enableOverflow: false }
        );
        const itemsContainer = container.querySelector('.itemsContainer') as SectionContainerElement;

        await expect(itemsContainer.fetchData()).resolves.toBe(items);
        expect(mocks.getApi).toHaveBeenCalledWith('current');
        expect(mocks.getResumeItemsQuery).toHaveBeenCalledWith(api, expect.objectContaining({
            userId: 'current-user',
            fields: enabled ? ['PrimaryImageAspectRatio', 'LibraryInfo'] : ['PrimaryImageAspectRatio']
        }));
        expect(mocks.fetchQuery).toHaveBeenCalledWith(query);
        expect(mocks.getApiClient).not.toHaveBeenCalled();
    });

    test.each([false, true])('applies the server setting (%s) to the continue watching cards', enabled => {
        currentClient.serverInfo({ Id: 'current', EnableLibrarySourceDetails: enabled });
        const container = document.createElement('div');
        const userSettings = { useEpisodeImagesInNextUpAndResume: () => false } as UserSettings;

        loadResume(
            container,
            currentClient as unknown as ApiClient,
            'ContinueWatching',
            'Video',
            userSettings,
            { enableOverflow: false }
        );
        const itemsContainer = container.querySelector('.itemsContainer') as SectionContainerElement;
        itemsContainer.getItemsHtml([{ Id: 'movie', Type: 'Movie' }]);

        expect(mocks.getCardsHtml).toHaveBeenCalledWith(expect.objectContaining({
            showLibraryName: enabled,
            items: [{ Id: 'movie', Type: 'Movie' }]
        }));
    });
});
