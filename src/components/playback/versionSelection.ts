import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import { getDisplayName } from 'components/itemHelper';
import layoutManager from 'components/layoutManager';
import loading from 'components/loading/loading';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { PlayOptions } from 'types/playOptions';
import { isPlaybackVersionSelectionEnabled } from 'utils/extensions';
import { getVersionStreamSelection } from './versionStreamSelection';

/** Select a version after a series/season has been resolved to its starting episode. */
export async function selectPlaybackVersion(items: BaseItemDto[], options: PlayOptions): Promise<boolean> {
    const startIndex = items[options.startIndex || 0] ? options.startIndex || 0 : 0;
    const item = items[startIndex];
    if (!item?.Id
        || (item.Type !== BaseItemKind.Movie && item.Type !== BaseItemKind.Episode)
        || layoutManager.tv
        || options.skipVersionSelection
        || (options.startPositionTicks || 0) > 0
        || !isPlaybackVersionSelectionEnabled(item.ServerId)) {
        return true;
    }

    let mediaSources = item.MediaSources;
    if (!mediaSources) {
        const apiClient = ServerConnections.getApiClient(item.ServerId || item);
        if (!apiClient) throw new Error('No ApiClient available for version selection');
        const fullItem = await apiClient.getItem(apiClient.getCurrentUserId(), item.Id);
        mediaSources = fullItem.MediaSources;
    }

    const versions = (mediaSources || []).filter(source => source.Id);
    if (versions.length < 2) return true;

    const previousSourceId = options.mediaSourceId || item.Id;
    const selectedId = versions.find(source => source.Id === previousSourceId)?.Id || versions[0].Id;
    const actionsheet = await import('components/actionSheet/actionSheet');
    loading.hide();

    let sourceId: unknown;
    try {
        sourceId = await actionsheet.show({
            title: globalize.translate('LabelVersion'),
            text: [item.SeriesName, getDisplayName(item)].filter(Boolean).join(' – '),
            items: versions.map(source => ({
                id: source.Id || undefined,
                name: source.Name || '',
                selected: source.Id === selectedId
            }))
        });
    } catch {
        // Closing the menu cancels this launch without stopping an active player.
        return false;
    }

    const version = versions.find(source => source.Id === sourceId);
    if (typeof sourceId !== 'string' || !version) return false;

    let selectedItem = item;
    if (sourceId !== item.Id) {
        const apiClient = ServerConnections.getApiClient(item.ServerId || item);
        if (!apiClient) throw new Error('No ApiClient available for version selection');
        // Use this version's identity and remembered defaults, as the detail page does.
        selectedItem = await apiClient.getItem(apiClient.getCurrentUserId(), sourceId);
    }

    if (sourceId !== previousSourceId) {
        const previousSource = versions.find(source => source.Id === previousSourceId);
        const selectedSource = selectedItem.MediaSources?.find(source => source.Id === sourceId) || version;
        Object.assign(options, getVersionStreamSelection(previousSource, selectedSource, options));
    }

    items[startIndex] = {
        ...selectedItem,
        ServerId: selectedItem.ServerId || item.ServerId,
        PlaylistItemId: item.PlaylistItemId ?? selectedItem.PlaylistItemId
    };
    options.mediaSourceId = sourceId;
    if (options.startIndex != null && options.startIndex !== startIndex) {
        options.startIndex = startIndex;
    }

    return true;
}
