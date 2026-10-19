import type { ActionFunctionArgs } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { action } from './index';

const mocks = vi.hoisted(() => ({
    getApi: vi.fn(),
    getConfiguration: vi.fn(),
    updateConfiguration: vi.fn(),
    setLibrarySourceDetailsEnabled: vi.fn(),
    setPlaybackVersionSelectionEnabled: vi.fn(),
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
    setLibrarySourceDetailsEnabled: mocks.setLibrarySourceDetailsEnabled,
    setPlaybackVersionSelectionEnabled: mocks.setPlaybackVersionSelectionEnabled
}));
vi.mock('utils/query/queryClient', () => ({ queryClient: { invalidateQueries: mocks.invalidateQueries } }));
vi.mock('components/Page', () => ({ default: () => null }));
vi.mock('components/loading/LoadingComponent', () => ({ default: () => null }));
vi.mock('hooks/useConfiguration', () => ({ useConfiguration: vi.fn() }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));

function submit(playbackVersionSelection: boolean, librarySourceDetails: boolean) {
    const formData = new FormData();
    if (playbackVersionSelection) formData.set('EnablePlaybackVersionSelection', 'on');
    if (librarySourceDetails) formData.set('EnableLibrarySourceDetails', 'on');
    return action({ request: { formData: async () => formData } } as ActionFunctionArgs);
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.getApi.mockReturnValue({});
    mocks.getConfiguration.mockResolvedValue({ data: { ServerName: 'My server' } });
    mocks.updateConfiguration.mockResolvedValue(undefined);
});

describe('Extensions settings save', () => {
    test.each([true, false])('persists version selection as %s without replacing unrelated configuration', async enabled => {
        await expect(submit(enabled, true)).resolves.toEqual({ isSaved: true });

        expect(mocks.updateConfiguration).toHaveBeenCalledWith({
            serverConfiguration: {
                ServerName: 'My server',
                EnableLibrarySourceDetails: true,
                EnablePlaybackVersionSelection: enabled
            }
        });
        expect(mocks.setLibrarySourceDetailsEnabled).toHaveBeenCalledWith(true);
        expect(mocks.setPlaybackVersionSelectionEnabled).toHaveBeenCalledWith(enabled);
        expect(mocks.invalidateQueries).toHaveBeenCalledOnce();
    });

    test('does not change runtime capabilities when the server rejects the save', async () => {
        const error = new Error('Save failed');
        mocks.updateConfiguration.mockRejectedValue(error);

        await expect(submit(true, false)).rejects.toThrow(error);

        expect(mocks.setLibrarySourceDetailsEnabled).not.toHaveBeenCalled();
        expect(mocks.setPlaybackVersionSelectionEnabled).not.toHaveBeenCalled();
        expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    });
});
