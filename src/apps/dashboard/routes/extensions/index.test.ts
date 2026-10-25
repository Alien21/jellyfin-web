import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { type ActionFunctionArgs, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { action, Component } from './index';

const mocks = vi.hoisted(() => ({
    getApi: vi.fn(),
    getConfiguration: vi.fn(),
    updateConfiguration: vi.fn(),
    setGlobalSearchEnabled: vi.fn(),
    setLibrarySourceDetailsEnabled: vi.fn(),
    setPlaybackVersionSelectionEnabled: vi.fn(),
    setEnhancedSubtitleSelectionEnabled: vi.fn(),
    setEnhancedAudioSelectionEnabled: vi.fn(),
    useConfiguration: vi.fn(),
    invalidateQueries: vi.fn()
}));

vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: mocks.getApi } }));
vi.mock('@jellyfin/sdk/lib/utils/api/system-api', () => ({
    getSystemApi: () => ({
        getConfiguration: mocks.getConfiguration,
        updateConfiguration: mocks.updateConfiguration
    })
}));
vi.mock('utils/extensions', () => ({
    setGlobalSearchEnabled: mocks.setGlobalSearchEnabled,
    setLibrarySourceDetailsEnabled: mocks.setLibrarySourceDetailsEnabled,
    setPlaybackVersionSelectionEnabled: mocks.setPlaybackVersionSelectionEnabled,
    setEnhancedSubtitleSelectionEnabled: mocks.setEnhancedSubtitleSelectionEnabled,
    setEnhancedAudioSelectionEnabled: mocks.setEnhancedAudioSelectionEnabled
}));
vi.mock('utils/query/queryClient', () => ({ queryClient: { invalidateQueries: mocks.invalidateQueries } }));
vi.mock('components/layoutManager', () => ({ default: { tv: false } }));
vi.mock('components/Page', () => ({ default: ({ children }: PropsWithChildren) => children }));
vi.mock('components/loading/LoadingComponent', () => ({ default: () => null }));
vi.mock('hooks/useConfiguration', () => ({ useConfiguration: mocks.useConfiguration }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));

function submit(
    playbackVersionSelection: boolean,
    librarySourceDetails: boolean,
    globalSearch = false,
    favoriteSyncAcrossLibraries = false,
    autoRemoveFavoritesAfterWatching = false,
    nextUpResumeThreshold = false,
    enhancedTracks: { subtitles?: boolean; audio?: boolean; localizedNfoUpdates?: boolean } = {}
) {
    const formData = new FormData();
    if (favoriteSyncAcrossLibraries) formData.set('EnableFavoriteSyncAcrossLibraries', 'on');
    if (autoRemoveFavoritesAfterWatching) formData.set('EnableAutoRemoveFavoritesAfterWatching', 'on');
    if (nextUpResumeThreshold) formData.set('EnableNextUpResumeThreshold', 'on');
    if (enhancedTracks.subtitles) formData.set('EnableEnhancedSubtitleSelection', 'on');
    if (enhancedTracks.audio) formData.set('EnableEnhancedAudioSelection', 'on');
    if (globalSearch) formData.set('EnableGlobalSearch', 'on');
    if (playbackVersionSelection) formData.set('EnablePlaybackVersionSelection', 'on');
    if (librarySourceDetails) formData.set('EnableLibrarySourceDetails', 'on');
    if (enhancedTracks.localizedNfoUpdates) formData.set('EnableLocalizedNfoUpdates', 'on');
    return action({ request: { formData: async () => formData } } as ActionFunctionArgs);
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.getApi.mockReturnValue({});
    mocks.getConfiguration.mockResolvedValue({ data: { ServerName: 'My server' } });
    mocks.updateConfiguration.mockResolvedValue(undefined);
    mocks.useConfiguration.mockReturnValue({ data: {}, isPending: false, isError: false });
});

describe('Extensions settings save', () => {
    test.each([true, false])('persists version selection as %s without replacing unrelated configuration', async enabled => {
        await expect(submit(enabled, true)).resolves.toEqual({ isSaved: true });

        expect(mocks.updateConfiguration).toHaveBeenCalledWith({
            serverConfiguration: {
                ServerName: 'My server',
                EnableFavoriteSyncAcrossLibraries: false,
                EnableAutoRemoveFavoritesAfterWatching: false,
                EnableNextUpResumeThreshold: false,
                EnableEnhancedSubtitleSelection: false,
                EnableEnhancedAudioSelection: false,
                EnableGlobalSearch: false,
                EnableLocalizedNfoUpdates: false,
                EnableLibrarySourceDetails: true,
                EnablePlaybackVersionSelection: enabled
            }
        });
        expect(mocks.setLibrarySourceDetailsEnabled).toHaveBeenCalledWith(true);
        expect(mocks.setPlaybackVersionSelectionEnabled).toHaveBeenCalledWith(enabled);
        expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
    });

    test.each([true, false])('persists global search as %s and applies it after a successful save', async enabled => {
        await expect(submit(false, true, enabled)).resolves.toEqual({ isSaved: true });

        expect(mocks.updateConfiguration).toHaveBeenCalledWith({
            serverConfiguration: {
                ServerName: 'My server',
                EnableFavoriteSyncAcrossLibraries: false,
                EnableAutoRemoveFavoritesAfterWatching: false,
                EnableNextUpResumeThreshold: false,
                EnableEnhancedSubtitleSelection: false,
                EnableEnhancedAudioSelection: false,
                EnableGlobalSearch: enabled,
                EnableLocalizedNfoUpdates: false,
                EnableLibrarySourceDetails: true,
                EnablePlaybackVersionSelection: false
            }
        });
        expect(mocks.setGlobalSearchEnabled).toHaveBeenCalledWith(enabled);
        expect(mocks.updateConfiguration.mock.invocationCallOrder[0])
            .toBeLessThan(mocks.setGlobalSearchEnabled.mock.invocationCallOrder[0]);
    });

    test.each([
        [false, false],
        [true, false],
        [false, true],
        [true, true]
    ])('persists favorite synchronization %s and automatic removal %s independently', async (sync, autoRemove) => {
        mocks.getConfiguration.mockResolvedValue({
            data: {
                ServerName: 'My server',
                EnableFavoriteSyncAcrossLibraries: !sync,
                EnableAutoRemoveFavoritesAfterWatching: !autoRemove
            }
        });

        await expect(submit(false, true, false, sync, autoRemove)).resolves.toEqual({ isSaved: true });

        expect(mocks.updateConfiguration).toHaveBeenCalledWith({
            serverConfiguration: {
                ServerName: 'My server',
                EnableEnhancedSubtitleSelection: false,
                EnableEnhancedAudioSelection: false,
                EnableGlobalSearch: false,
                EnableLocalizedNfoUpdates: false,
                EnableLibrarySourceDetails: true,
                EnablePlaybackVersionSelection: false,
                EnableFavoriteSyncAcrossLibraries: sync,
                EnableAutoRemoveFavoritesAfterWatching: autoRemove,
                EnableNextUpResumeThreshold: false
            }
        });
        expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
    });

    test.each([true, false])('persists the Next Up resume threshold as %s and preserves the current resume percentage', async enabled => {
        mocks.getConfiguration.mockResolvedValue({
            data: {
                ServerName: 'My server',
                MinResumePct: 2,
                EnableNextUpResumeThreshold: !enabled
            }
        });

        await expect(submit(true, true, true, true, true, enabled, { subtitles: true, audio: true })).resolves.toEqual({ isSaved: true });

        expect(mocks.updateConfiguration).toHaveBeenCalledWith({
            serverConfiguration: {
                ServerName: 'My server',
                MinResumePct: 2,
                EnableEnhancedSubtitleSelection: true,
                EnableEnhancedAudioSelection: true,
                EnableGlobalSearch: true,
                EnableLocalizedNfoUpdates: false,
                EnableLibrarySourceDetails: true,
                EnablePlaybackVersionSelection: true,
                EnableFavoriteSyncAcrossLibraries: true,
                EnableAutoRemoveFavoritesAfterWatching: true,
                EnableNextUpResumeThreshold: enabled
            }
        });
        expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
    });

    test.each([[false, false], [true, false], [false, true], [true, true]])('persists subtitle and audio label extensions independently (%s, %s)', async (subtitles, audio) => {
        await expect(submit(false, false, false, false, false, false, { subtitles, audio })).resolves.toEqual({ isSaved: true });
        expect(mocks.updateConfiguration).toHaveBeenCalledWith({ serverConfiguration: expect.objectContaining({
            EnableEnhancedSubtitleSelection: subtitles,
            EnableEnhancedAudioSelection: audio
        }) });
        expect(mocks.setEnhancedSubtitleSelectionEnabled).toHaveBeenCalledWith(subtitles);
        expect(mocks.setEnhancedAudioSelectionEnabled).toHaveBeenCalledWith(audio);
        expect(mocks.updateConfiguration.mock.invocationCallOrder[0]).toBeLessThan(mocks.setEnhancedSubtitleSelectionEnabled.mock.invocationCallOrder[0]);
        expect(mocks.updateConfiguration.mock.invocationCallOrder[0]).toBeLessThan(mocks.setEnhancedAudioSelectionEnabled.mock.invocationCallOrder[0]);
    });

    test.each([true, false])('persists localized NFO synchronization as %s without replacing unrelated settings', async enabled => {
        mocks.getConfiguration.mockResolvedValue({
            data: { ServerName: 'My server', EnableLocalizedNfoUpdates: !enabled, PreferredMetadataLanguage: 'cs' }
        });

        await expect(submit(false, false, false, false, false, false, { localizedNfoUpdates: enabled })).resolves.toEqual({ isSaved: true });

        expect(mocks.updateConfiguration).toHaveBeenCalledWith({ serverConfiguration: expect.objectContaining({
            ServerName: 'My server',
            PreferredMetadataLanguage: 'cs',
            EnableLocalizedNfoUpdates: enabled
        }) });
    });

    test('does not change runtime capabilities when the server rejects the save', async () => {
        const error = new Error('Save failed');
        mocks.updateConfiguration.mockRejectedValue(error);

        await expect(submit(true, false, false, false, false, false, { subtitles: true, audio: true })).rejects.toThrow(error);

        expect(mocks.setGlobalSearchEnabled).not.toHaveBeenCalled();
        expect(mocks.setLibrarySourceDetailsEnabled).not.toHaveBeenCalled();
        expect(mocks.setPlaybackVersionSelectionEnabled).not.toHaveBeenCalled();
        expect(mocks.setEnhancedSubtitleSelectionEnabled).not.toHaveBeenCalled();
        expect(mocks.setEnhancedAudioSelectionEnabled).not.toHaveBeenCalled();
        expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    });
});

describe('permanent TMDb collection matching fix', () => {
    beforeAll(() => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    });
    afterAll(() => {
        vi.unstubAllGlobals();
    });

    test.each([undefined, true, false])('remains checked and disabled regardless of an obsolete configuration value %s', async stored => {
        mocks.useConfiguration.mockReturnValue({
            data: stored === undefined ? {} : { EnableTmdbCollectionMatching: stored },
            isPending: false,
            isError: false
        });
        const router = createMemoryRouter([{ path: '/', element: createElement(Component) }]);
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        try {
            await act(async () => root.render(createElement(RouterProvider, { router })));
            const checkbox = container.querySelector('input[aria-describedby="tmdbCollectionMatchingHelp"]');
            expect(checkbox).toHaveProperty('checked', true);
            expect(checkbox).toHaveProperty('disabled', true);
            expect(checkbox).toHaveProperty('name', '');
        } finally {
            await act(async () => root.unmount());
            router.dispose();
            container.remove();
        }
    });
});
