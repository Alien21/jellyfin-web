import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { PlayOptions } from 'types/playOptions';
import { canSelectPlaybackVersion, selectPlaybackVersion as selectVersionForItems } from './versionSelection';

const mocks = vi.hoisted(() => ({
    enabled: vi.fn(),
    getApiClient: vi.fn(),
    getItem: vi.fn(),
    getVersionStreamSelection: vi.fn(),
    show: vi.fn(),
    hideLoading: vi.fn(),
    layout: { tv: false }
}));

vi.mock('utils/extensions', () => ({ isPlaybackVersionSelectionEnabled: mocks.enabled }));
vi.mock('./versionStreamSelection', () => ({ getVersionStreamSelection: mocks.getVersionStreamSelection }));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: { getApiClient: mocks.getApiClient }
}));
vi.mock('components/layoutManager', () => ({ default: mocks.layout }));
vi.mock('components/loading/loading', () => ({ default: { hide: mocks.hideLoading } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/itemHelper', () => ({
    getDisplayName: (item: BaseItemDto) => item.Name
}));
vi.mock('components/actionSheet/actionSheet', () => ({
    show: mocks.show,
    default: { show: mocks.show }
}));

const sources = [
    { Id: 'episode', Name: '2160p][CS+EN]-TreZzoR' },
    { Id: 'alternate', Name: '1080p][CS+EN]-DeDo' }
];

const makeItem = (overrides: Partial<BaseItemDto> = {}): BaseItemDto => ({
    Id: 'episode',
    ServerId: 'item-server',
    Type: 'Episode',
    MediaType: 'Video',
    Name: 'Na západ, starče',
    MediaSources: sources,
    ...overrides
});

const selectPlaybackVersion = (item: BaseItemDto | undefined, options: PlayOptions) => selectVersionForItems(item ? [item] : [], options);

beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.layout.tv = false;
    mocks.getApiClient.mockReturnValue({
        getCurrentUserId: () => 'viewer',
        getItem: mocks.getItem
    });
    mocks.getItem.mockReset().mockImplementation(async (_userId: string, id: string) => makeItem({ Id: id }));
    mocks.getVersionStreamSelection.mockReset().mockReturnValue({
        audioStreamIndex: undefined,
        subtitleStreamIndex: undefined
    });
    mocks.show.mockReset().mockResolvedValue('alternate');
});

describe('playback version selection', () => {
    test('keeps playback unchanged when the server extension is disabled', async () => {
        mocks.enabled.mockReturnValue(false);
        const options: PlayOptions = {};

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(true);

        expect(mocks.enabled).toHaveBeenCalledWith('item-server');
        expect(mocks.getApiClient).not.toHaveBeenCalled();
        expect(mocks.show).not.toHaveBeenCalled();
        expect(options).toEqual({});
    });

    test.each([1, 50000000])('continues a resumed item at %s ticks without opening the chooser', async startPositionTicks => {
        const options: PlayOptions = { startPositionTicks, mediaSourceId: 'alternate' };

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(true);

        expect(mocks.getApiClient).not.toHaveBeenCalled();
        expect(mocks.show).not.toHaveBeenCalled();
        expect(options).toEqual({ startPositionTicks, mediaSourceId: 'alternate' });
    });

    test('offers versions when an unfinished item is deliberately restarted from zero', async () => {
        const options: PlayOptions = { startPositionTicks: 0 };

        await expect(selectPlaybackVersion(makeItem({
            UserData: { Key: 'episode', PlaybackPositionTicks: 50000000 }
        }), options)).resolves.toBe(true);

        expect(mocks.show).toHaveBeenCalledOnce();
        expect(options.mediaSourceId).toBe('alternate');
    });

    test('keeps television playback unchanged', async () => {
        mocks.layout.tv = true;

        await expect(selectPlaybackVersion(makeItem(), {})).resolves.toBe(true);

        expect(mocks.getApiClient).not.toHaveBeenCalled();
        expect(mocks.show).not.toHaveBeenCalled();
    });

    test.each(['Movie', 'Episode'] as const)('opens the TV chooser for an explicit version-play request for a %s', async Type => {
        mocks.layout.tv = true;
        const items = [makeItem({ Type })];
        const options: PlayOptions = { showVersionSelection: true, startPositionTicks: 0 };

        await expect(selectVersionForItems(items, options)).resolves.toBe(true);

        expect(mocks.show).toHaveBeenCalledOnce();
        expect(items[0].Id).toBe('alternate');
        expect(options.mediaSourceId).toBe('alternate');
    });

    test('keeps explicit TV version selection behind the shared server extension', async () => {
        mocks.layout.tv = true;
        mocks.enabled.mockReturnValue(false);

        await expect(selectPlaybackVersion(makeItem(), { showVersionSelection: true })).resolves.toBe(true);

        expect(mocks.show).not.toHaveBeenCalled();
        expect(mocks.getApiClient).not.toHaveBeenCalled();
    });

    test('cancels an explicit TV version launch without changing the item or options', async () => {
        mocks.layout.tv = true;
        mocks.show.mockRejectedValue(new Error('ActionSheet closed without resolving'));
        const item = makeItem();
        const items = [item];
        const options: PlayOptions = { showVersionSelection: true, startPositionTicks: 0 };

        await expect(selectVersionForItems(items, options)).resolves.toBe(false);

        expect(items[0]).toBe(item);
        expect(options).toEqual({ showVersionSelection: true, startPositionTicks: 0 });
    });

    test('does not reopen the chooser for a received remote playback command', async () => {
        await expect(selectPlaybackVersion(makeItem(), { skipVersionSelection: true })).resolves.toBe(true);

        expect(mocks.getApiClient).not.toHaveBeenCalled();
        expect(mocks.show).not.toHaveBeenCalled();
    });

    test.each([undefined, makeItem({ Type: 'Series' }), makeItem({ Type: 'Audio' })])(
        'waits for a concrete movie or episode before offering versions (%j)',
        async item => {
            await expect(selectPlaybackVersion(item, {})).resolves.toBe(true);

            expect(mocks.getApiClient).not.toHaveBeenCalled();
            expect(mocks.show).not.toHaveBeenCalled();
        }
    );

    test.each([
        { label: 'empty source list', MediaSources: [] },
        { label: 'single version', MediaSources: [sources[0]] },
        { label: 'one usable version', MediaSources: [{ Name: 'No usable source identifier' }, sources[0]] }
    ])(
        'starts an item with $label without another request',
        async ({ MediaSources }) => {
            await expect(selectPlaybackVersion(makeItem({ MediaSources }), {})).resolves.toBe(true);

            expect(mocks.getApiClient).not.toHaveBeenCalled();
            expect(mocks.show).not.toHaveBeenCalled();
        }
    );

    test('fetches missing versions from the resolved episode server and offers their exact names', async () => {
        const options: PlayOptions = {};

        await expect(selectPlaybackVersion(makeItem({ MediaSources: undefined }), options)).resolves.toBe(true);

        expect(mocks.getApiClient).toHaveBeenCalledWith('item-server');
        expect(mocks.getItem).toHaveBeenCalledWith('viewer', 'episode');
        expect(mocks.hideLoading).toHaveBeenCalledOnce();
        expect(mocks.show).toHaveBeenCalledWith(expect.objectContaining({
            title: 'LabelVersion',
            text: 'Na západ, starče',
            items: [
                expect.objectContaining({ id: 'episode', name: sources[0].Name, selected: true }),
                expect.objectContaining({ id: 'alternate', name: sources[1].Name, selected: false })
            ]
        }));
        expect(options.mediaSourceId).toBe('alternate');
    });

    test('continues without a chooser when the fetched item has a single version', async () => {
        mocks.getItem.mockResolvedValue(makeItem({ MediaSources: [sources[0]] }));

        await expect(selectPlaybackVersion(makeItem({ MediaSources: undefined }), {})).resolves.toBe(true);

        expect(mocks.getItem).toHaveBeenCalledOnce();
        expect(mocks.show).not.toHaveBeenCalled();
    });

    test('also offers movie versions', async () => {
        const options: PlayOptions = {};

        await expect(selectPlaybackVersion(makeItem({ Type: 'Movie' }), options)).resolves.toBe(true);

        expect(mocks.show).toHaveBeenCalledOnce();
        expect(options.mediaSourceId).toBe('alternate');
    });

    test('preselects the version chosen in the detail and keeps its track choices', async () => {
        const options: PlayOptions = { mediaSourceId: 'alternate', audioStreamIndex: 3, subtitleStreamIndex: 5 };

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(true);

        expect(mocks.show).toHaveBeenCalledWith(expect.objectContaining({
            items: [
                expect.objectContaining({ id: 'episode', selected: false }),
                expect.objectContaining({ id: 'alternate', selected: true })
            ]
        }));
        expect(options).toEqual({ mediaSourceId: 'alternate', audioStreamIndex: 3, subtitleStreamIndex: 5 });
        expect(mocks.getItem).toHaveBeenCalledWith('viewer', 'alternate');
        expect(mocks.getVersionStreamSelection).not.toHaveBeenCalled();
    });

    test('clears track indices from the detail when another version is selected', async () => {
        const options: PlayOptions = { mediaSourceId: 'episode', audioStreamIndex: 3, subtitleStreamIndex: 5 };

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(true);

        expect(options).toEqual({ mediaSourceId: 'alternate' });
    });

    test('keeps track indices when the main version is selected again', async () => {
        mocks.show.mockResolvedValue('episode');
        const options: PlayOptions = { audioStreamIndex: 3, subtitleStreamIndex: -1 };

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(true);

        expect(options).toEqual({ mediaSourceId: 'episode', audioStreamIndex: 3, subtitleStreamIndex: -1 });
        expect(mocks.getItem).not.toHaveBeenCalled();
        expect(mocks.getVersionStreamSelection).not.toHaveBeenCalled();
    });

    test('cancels playback when the chooser is dismissed', async () => {
        mocks.show.mockRejectedValue(new Error('ActionSheet closed without resolving'));
        const options: PlayOptions = { audioStreamIndex: 3, subtitleStreamIndex: 5 };

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(false);

        expect(options).toEqual({ audioStreamIndex: 3, subtitleStreamIndex: 5 });
    });

    test.each([undefined, 'missing-source'])('cancels without mutating options for an invalid choice (%s)', async choice => {
        mocks.show.mockResolvedValue(choice);
        const options: PlayOptions = { mediaSourceId: 'episode', audioStreamIndex: 3 };

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(false);

        expect(options).toEqual({ mediaSourceId: 'episode', audioStreamIndex: 3 });
    });

    test('reports a failed version lookup instead of silently starting an arbitrary source', async () => {
        const error = new Error('Episode lookup failed');
        mocks.getItem.mockRejectedValue(error);

        await expect(selectPlaybackVersion(makeItem({ MediaSources: undefined }), {})).rejects.toBe(error);

        expect(mocks.show).not.toHaveBeenCalled();
    });

    test('replaces only the resolved starting episode with the selected version and its history', async () => {
        const first = makeItem({ Id: 'previous', MediaSources: [] });
        const starting = makeItem({ ServerId: 'series-server', PlaylistItemId: 'queued-episode' });
        const next = makeItem({ Id: 'next', MediaSources: [] });
        const selectedItem = makeItem({
            Id: 'alternate',
            ServerId: undefined,
            PlaylistItemId: undefined,
            UserData: { Key: 'alternate', ItemId: 'alternate', PlaybackPositionTicks: 90000 },
            PartCount: 2
        });
        mocks.getItem.mockResolvedValue(selectedItem);
        const items = [first, starting, next];
        const options: PlayOptions = { startIndex: 1 };

        await expect(selectVersionForItems(items, options)).resolves.toBe(true);

        expect(mocks.enabled).toHaveBeenCalledWith('series-server');
        expect(mocks.getApiClient).toHaveBeenCalledWith('series-server');
        expect(mocks.getItem).toHaveBeenCalledWith('viewer', 'alternate');
        expect(items[0]).toBe(first);
        expect(items[2]).toBe(next);
        expect(items[1]).toEqual(expect.objectContaining({
            Id: 'alternate',
            ServerId: 'series-server',
            PlaylistItemId: 'queued-episode',
            UserData: selectedItem.UserData,
            PartCount: 2
        }));
        expect(options.startIndex).toBe(1);
        expect(options.mediaSourceId).toBe('alternate');
    });

    test.each([-1, 9])('uses the first queued item when startIndex %s is invalid', async startIndex => {
        const first = makeItem({ PlaylistItemId: 'first-in-queue' });
        const next = makeItem({ Id: 'next', MediaSources: [] });
        const items = [first, next];
        const options: PlayOptions = { startIndex };

        await expect(selectVersionForItems(items, options)).resolves.toBe(true);

        expect(items[0]).toEqual(expect.objectContaining({ Id: 'alternate', PlaylistItemId: 'first-in-queue' }));
        expect(items[1]).toBe(next);
        expect(options.startIndex).toBe(0);
    });

    test('applies track intent to the fetched selected version without carrying old indices', async () => {
        const selectedSource = {
            Id: 'alternate',
            Name: sources[1].Name,
            DefaultAudioStreamIndex: 8,
            DefaultSubtitleStreamIndex: 10
        };
        mocks.getItem.mockResolvedValue(makeItem({ Id: 'alternate', MediaSources: [selectedSource] }));
        mocks.getVersionStreamSelection.mockReturnValue({ audioStreamIndex: 8, subtitleStreamIndex: 10 });
        const options: PlayOptions = { mediaSourceId: 'episode', audioStreamIndex: 3, subtitleStreamIndex: 5 };

        await expect(selectPlaybackVersion(makeItem(), options)).resolves.toBe(true);

        expect(mocks.getVersionStreamSelection).toHaveBeenCalledOnce();
        expect(mocks.getVersionStreamSelection).toHaveBeenCalledWith(sources[0], selectedSource, expect.any(Object));
        expect(options).toEqual({ mediaSourceId: 'alternate', audioStreamIndex: 8, subtitleStreamIndex: 10 });
    });

    test('uses the selected version defaults when the requested language is unavailable', async () => {
        mocks.getVersionStreamSelection.mockReturnValue({ audioStreamIndex: undefined, subtitleStreamIndex: undefined });
        const items = [makeItem()];
        const options: PlayOptions = { mediaSourceId: 'episode', audioStreamIndex: 3, subtitleStreamIndex: 5 };

        await expect(selectVersionForItems(items, options)).resolves.toBe(true);

        expect(items[0].Id).toBe('alternate');
        expect(mocks.getVersionStreamSelection).toHaveBeenCalledOnce();
        expect(options.audioStreamIndex).toBeUndefined();
        expect(options.subtitleStreamIndex).toBeUndefined();
    });

    test('reports a failed selected-version lookup without replacing the queued item', async () => {
        const error = new Error('Selected version lookup failed');
        mocks.getItem.mockRejectedValue(error);
        const item = makeItem();
        const items = [item];

        await expect(selectVersionForItems(items, {})).rejects.toBe(error);

        expect(mocks.show).toHaveBeenCalledOnce();
        expect(mocks.getItem).toHaveBeenCalledWith('viewer', 'alternate');
        expect(items[0]).toBe(item);
    });
});

describe('detail-page version availability', () => {
    test.each(['Movie', 'Episode'] as const)('offers a version button for a %s with multiple sources', Type => {
        expect(canSelectPlaybackVersion(makeItem({ Type }))).toBe(true);
        expect(mocks.enabled).toHaveBeenCalledWith('item-server');
    });

    test('hides the version button when the shared server extension is disabled', () => {
        mocks.enabled.mockReturnValue(false);

        expect(canSelectPlaybackVersion(makeItem())).toBe(false);
    });

    const unavailableItems: Partial<BaseItemDto>[] = [
        { Id: undefined },
        { Type: 'Series' },
        { Type: 'Audio' },
        { MediaSources: undefined },
        { MediaSources: [] },
        { MediaSources: [sources[0]] },
        { MediaSources: [sources[0], { Name: 'Unplayable source without an ID' }] }
    ];

    test.each(unavailableItems)('hides the version button when no playable version choice is available (%j)', overrides => {
        expect(canSelectPlaybackVersion(makeItem(overrides))).toBe(false);
    });
});
