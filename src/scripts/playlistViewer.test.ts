import { beforeEach, describe, expect, test, vi } from 'vitest';

import PlaylistViewer from './playlistViewer';

const mocks = vi.hoisted(() => ({
    getApi: vi.fn(),
    getApiClient: vi.fn(),
    currentApiClient: vi.fn(),
    getPlaylistUser: vi.fn(),
    getListViewHtml: vi.fn(() => '<div>Playlist items</div>')
}));

vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: {
        getApi: mocks.getApi,
        getApiClient: mocks.getApiClient,
        currentApiClient: mocks.currentApiClient
    }
}));
vi.mock('@jellyfin/sdk/lib/utils/api/playlist-api', () => ({
    getPlaylistApi: () => ({ getPlaylistUser: mocks.getPlaylistUser })
}));
vi.mock('components/listview/listview', () => ({
    default: { getListViewHtml: mocks.getListViewHtml }
}));

type PlaylistItemsContainer = HTMLElement & {
    enableDragReordering: ReturnType<typeof vi.fn>;
    refreshItems: ReturnType<typeof vi.fn>;
    fetchData: () => Promise<unknown>;
    getItemsHtml: (items: { Id: string }[]) => string;
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlaylistUser.mockResolvedValue({ data: { CanEdit: false } });
});

describe('playlist library labels across servers', () => {
    test.each([false, true])('uses the playlist server setting (%s) for fetching and rendering', async enabled => {
        const playlistApi = { server: 'playlist-server' };
        const currentClient = { serverInfo: () => ({ EnableLibrarySourceDetails: !enabled }) };
        const playlistClient = {
            serverId: () => 'playlist-server',
            serverInfo: () => ({ EnableLibrarySourceDetails: enabled }),
            getCurrentUserId: () => 'playlist-user',
            getUrl: vi.fn(() => '/playlist-items'),
            getJSON: vi.fn().mockResolvedValue({ Items: [{ Id: 'movie' }] })
        };
        mocks.currentApiClient.mockReturnValue(currentClient);
        mocks.getApi.mockReturnValue(playlistApi);
        mocks.getApiClient.mockImplementation((serverId?: string) => {
            if (!serverId) throw new Error('item or serverId cannot be null');
            return serverId === 'playlist-server' ? playlistClient : undefined;
        });
        const page = document.createElement('div');
        page.innerHTML = '<div id="childrenContent"><div class="itemsContainer"></div></div>';
        const container = page.querySelector('.itemsContainer') as PlaylistItemsContainer;
        container.enableDragReordering = vi.fn();
        container.refreshItems = vi.fn();

        PlaylistViewer.render(page, { Id: 'playlist', ServerId: 'playlist-server' });
        await vi.waitFor(() => {
            expect(container.refreshItems).toHaveBeenCalledOnce();
        });

        await expect(container.fetchData()).resolves.toEqual({ Items: [{ Id: 'movie' }] });
        container.getItemsHtml([{ Id: 'movie' }]);

        expect(mocks.getApi).toHaveBeenCalledWith('playlist-server');
        expect(playlistClient.getUrl).toHaveBeenCalledWith(
            'Playlists/playlist/Items',
            expect.objectContaining({
                UserId: 'playlist-user',
                Fields: 'PrimaryImageAspectRatio,MediaSourceCount,Chapters,Trickplay' + (enabled ? ',LibraryInfo' : '')
            })
        );
        expect(mocks.getListViewHtml).toHaveBeenCalledWith(expect.objectContaining({
            showLibraryName: enabled,
            items: [{ Id: 'movie' }]
        }));
        expect(mocks.currentApiClient).not.toHaveBeenCalled();
    });
});
