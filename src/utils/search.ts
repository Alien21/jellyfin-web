import type { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { isGlobalSearchEnabled } from './extensions';

interface SearchContext {
    parentId?: string | null;
    topParentId?: string | null;
    collectionType?: string | null;
}

/** Search context is ignored when the server enables searching every library. */
export function getSearchScope(context: SearchContext): {
    parentId?: string;
    collectionType?: CollectionType;
} {
    if (isGlobalSearchEnabled()) return {};

    return {
        parentId: context.parentId || context.topParentId || undefined,
        collectionType: (context.collectionType || undefined) as CollectionType | undefined
    };
}

export function getSearchUrl(context: SearchContext): string {
    const { parentId, collectionType } = getSearchScope(context);
    const params = new URLSearchParams();

    if (parentId) params.set('parentId', parentId);
    if (collectionType) params.set('collectionType', collectionType);

    const query = params.toString();
    return query ? `search?${query}` : 'search';
}
