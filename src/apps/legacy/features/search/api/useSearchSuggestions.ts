import { isLibrarySourceDetailsEnabled } from 'utils/extensions';
import type { AxiosRequestConfig } from 'axios';
import type { Api } from '@jellyfin/sdk';
import type { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import type { ItemDto } from 'types/base/models/item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

const fetchGetItems = async (
    api: Api,
    userId: string,
    parentId?: string,
    options?: AxiosRequestConfig
) => {
    const response = await getLibraryApi(api).getItems(
        {
            userId,
            sortBy: [ItemSortBy.IsFavoriteOrLiked, ItemSortBy.Random],
            includeItemTypes: [
                BaseItemKind.Movie,
                BaseItemKind.Series,
                BaseItemKind.MusicArtist
            ],
            limit: 20,
            recursive: true,
            fields: parentId || !isLibrarySourceDetailsEnabled() ? undefined : ['LibraryInfo' as ItemFields],
            imageTypeLimit: 0,
            enableImages: false,
            parentId,
            enableTotalRecordCount: false
        },
        options
    );
    return (response.data.Items || []) as ItemDto[];
};

export const useSearchSuggestions = (parentId?: string) => {
    const { api, user } = useApi();
    const userId = user?.Id;

    return useQuery({
        queryKey: ['SearchSuggestions', { parentId, librarySourceDetails: isLibrarySourceDetailsEnabled() }],
        queryFn: ({ signal }) =>
            fetchGetItems(api!, userId!, parentId, { signal }),
        refetchOnWindowFocus: false,
        enabled: !!api && !!userId
    });
};
