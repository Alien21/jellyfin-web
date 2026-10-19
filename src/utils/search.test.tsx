import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { useSearchItems } from 'apps/legacy/features/search/api/useSearchItems';
import { useSearchSuggestions } from 'apps/legacy/features/search/api/useSearchSuggestions';
import Search from 'apps/legacy/routes/search';
import SearchButton from 'apps/modern/components/AppToolbar/SearchButton';
import { getSearchUrl } from './search';

const mocks = vi.hoisted(() => ({
    enabled: vi.fn(),
    getItems: vi.fn()
}));

vi.mock('utils/extensions', () => ({
    isGlobalSearchEnabled: mocks.enabled,
    isLibrarySourceDetailsEnabled: () => false
}));
vi.mock('hooks/useApi', () => ({
    useApi: () => ({ api: {}, user: { Id: 'viewer' } })
}));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
    getLibraryApi: () => ({ getItems: mocks.getItems })
}));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('usehooks-ts', () => ({ useDebounceValue: (value: string) => [value] }));
vi.mock('components/Page', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('components/cardbuilder/utils/shape', () => ({ CardShape: { SquareOverflow: 'square' } }));
vi.mock('apps/legacy/features/search/components/SearchFields', () => ({ default: () => null }));
vi.mock('apps/legacy/features/search/components/SearchResults', () => ({
    default: function SearchResults({ parentId, collectionType, query }: {
        parentId?: string;
        collectionType?: CollectionType;
        query?: string;
    }) {
        useSearchItems(parentId, collectionType, query);
        return null;
    }
}));
vi.mock('apps/legacy/features/search/components/SearchSuggestions', () => ({
    default: function SearchSuggestions({ parentId }: { parentId?: string }) {
        useSearchSuggestions(parentId);
        return null;
    }
}));
vi.mock('apps/legacy/features/search/api/useArtistsSearch', () => ({ useArtistsSearch: () => ({ isPending: false }) }));
vi.mock('apps/legacy/features/search/api/usePeopleSearch', () => ({ usePeopleSearch: () => ({ isPending: false }) }));
vi.mock('apps/legacy/features/search/api/useStudiosSearch', () => ({ useStudiosSearch: () => ({ isPending: false }) }));
vi.mock('apps/legacy/features/search/api/useVideoSearch', () => ({ useVideoSearch: () => ({ isPending: false }) }));
vi.mock('apps/legacy/features/search/api/useProgramsSearch', () => ({ useProgramsSearch: () => ({ isPending: false }) }));
vi.mock('apps/legacy/features/search/api/useLiveTvSearch', () => ({ useLiveTvSearch: () => ({ isPending: false }) }));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

beforeAll(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterAll(() => {
    vi.unstubAllGlobals();
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(false);
    mocks.getItems.mockResolvedValue({ data: { Items: [] } });
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
});

async function renderAt(url: string, children: ReactNode) {
    await act(async () => root.render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
        </QueryClientProvider>
    ));
}

async function waitForRequest() {
    await act(async () => {
        await vi.waitFor(() => expect(mocks.getItems).toHaveBeenCalledOnce());
    });
    return mocks.getItems.mock.calls[0][0];
}

describe('global search navigation', () => {
    test.each(['movies', 'tvshows', 'music', 'livetv'])('keeps the existing %s library scope until enabled', collectionType => {
        const scope = { parentId: 'library', collectionType };
        expect(getSearchUrl(scope)).toBe(`search?parentId=library&collectionType=${collectionType}`);

        mocks.enabled.mockReturnValue(true);
        expect(getSearchUrl(scope)).toBe('search');
    });

    test.each([false, true])('modern magnifier follows the global search flag: %s', async enabled => {
        mocks.enabled.mockReturnValue(enabled);
        await renderAt('/movies?topParentId=library&collectionType=movies', <SearchButton />);

        const link = container.querySelector('a');
        expect(link?.getAttribute('href')).toBe(enabled ? '/search' : '/search?parentId=library&collectionType=movies');
    });

    test('home search stays global with the extension disabled', () => {
        expect(getSearchUrl({})).toBe('search');
    });
});

describe('search route request scope', () => {
    test.each([false, true])('suggestions follow the global search flag even on an existing scoped URL: %s', async enabled => {
        mocks.enabled.mockReturnValue(enabled);
        await renderAt('/search?parentId=library&collectionType=movies', <Search />);
        const request = await waitForRequest();

        expect(request.parentId).toBe(enabled ? undefined : 'library');
        expect(request.recursive).toBe(true);
    });

    test.each([false, true])('search requests include every media category only when enabled: %s', async enabled => {
        mocks.enabled.mockReturnValue(enabled);
        await renderAt('/search?parentId=library&collectionType=movies&query=matrix', <Search />);
        const request = await waitForRequest();

        expect(request.parentId).toBe(enabled ? undefined : 'library');
        expect(request.searchTerm).toBe('matrix');
        if (enabled) {
            expect(request.includeItemTypes).toEqual(expect.arrayContaining([
                BaseItemKind.Movie, BaseItemKind.Series, BaseItemKind.Episode, BaseItemKind.MusicAlbum
            ]));
        } else {
            expect(request.includeItemTypes).toEqual([BaseItemKind.Movie]);
        }
    });

    test('global search clears topParentId on a bookmarked library search URL', async () => {
        mocks.enabled.mockReturnValue(true);
        await renderAt('/search?topParentId=library&collectionType=tvshows&query=matrix', <Search />);
        const request = await waitForRequest();

        expect(request.parentId).toBeUndefined();
        expect(request.includeItemTypes).toContain(BaseItemKind.MusicAlbum);
    });
});
