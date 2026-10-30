import type { ApiClient } from 'jellyfin-apiclient';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { QUERY_KEY } from 'hooks/useUsers';
import { UserSettings } from './userSettings';

const mocks = vi.hoisted(() => ({
    legacyClient: {
        serverId: vi.fn(() => 'server-id'),
        updateDisplayPreferences: vi.fn(),
        updateUserConfiguration: vi.fn()
    },
    sdk: { basePath: 'https://server.example' },
    getApiClient: vi.fn(),
    getApi: vi.fn(),
    fetchQuery: vi.fn(),
    invalidateQueries: vi.fn(),
    getDisplayPreferencesQuery: vi.fn(),
    getUserQuery: vi.fn(),
    appGet: vi.fn(),
    appSet: vi.fn()
}));

vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: { getApiClient: mocks.getApiClient, getApi: mocks.getApi }
}));
vi.mock('hooks/api/useDisplayPreferences', () => ({ getDisplayPreferencesQuery: mocks.getDisplayPreferencesQuery }));
vi.mock('hooks/api/useUser', () => ({ getUserQuery: mocks.getUserQuery }));
vi.mock('utils/query/queryClient', () => ({
    queryClient: { fetchQuery: mocks.fetchQuery, invalidateQueries: mocks.invalidateQueries }
}));
vi.mock('scripts/settings/appSettings', () => ({ default: { get: mocks.appGet, set: mocks.appSet } }));
vi.mock('scripts/browser', () => ({ default: {} }));

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getApiClient.mockReturnValue(mocks.legacyClient);
    mocks.getApi.mockReturnValue(mocks.sdk);
    mocks.fetchQuery.mockResolvedValue({ CustomPrefs: {} });
    mocks.legacyClient.updateDisplayPreferences.mockResolvedValue(undefined);
    mocks.legacyClient.updateUserConfiguration.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('user settings persistence', () => {
    test.each([true, false])('saves display and user preferences after binding by server ID: %s', async (bindByServerId) => {
        const settings = new UserSettings();
        await settings.setUserInfo('user-id', bindByServerId ? 'server-id' : mocks.legacyClient as unknown as ApiClient);

        expect(mocks.getDisplayPreferencesQuery).toHaveBeenCalledWith(mocks.sdk, {
            displayPreferencesId: 'usersettings',
            client: 'emby',
            userId: 'user-id'
        });

        settings.set('theme', 'dark');
        vi.advanceTimersByTime(50);

        expect(mocks.legacyClient.updateDisplayPreferences).toHaveBeenCalledWith(
            'usersettings', { CustomPrefs: { theme: 'dark' } }, 'user-id', 'emby'
        );

        const config = { EnableNextEpisodeAutoPlay: true };
        await settings.serverConfig(config);

        expect(mocks.legacyClient.updateUserConfiguration).toHaveBeenCalledWith('user-id', config);
        expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: [QUERY_KEY, 'user-id'] });
    });
});
