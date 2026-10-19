import React, { type FC } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebounceValue } from 'usehooks-ts';

import SearchFields from 'apps/legacy/features/search/components/SearchFields';
import SearchResults from 'apps/legacy/features/search/components/SearchResults';
import SearchSuggestions from 'apps/legacy/features/search/components/SearchSuggestions';
import Page from 'components/Page';
import useSearchParam from 'hooks/useSearchParam';
import globalize from 'lib/globalize';
import { getSearchScope } from 'utils/search';

const COLLECTION_TYPE_PARAM = 'collectionType';
const PARENT_ID_PARAM = 'parentId';
const QUERY_PARAM = 'query';

const Search: FC = () => {
    const [searchParams] = useSearchParams();
    const { parentId, collectionType } = getSearchScope({
        parentId: searchParams.get(PARENT_ID_PARAM),
        topParentId: searchParams.get('topParentId'),
        collectionType: searchParams.get(COLLECTION_TYPE_PARAM)
    });
    const [ query, setQuery ] = useSearchParam(QUERY_PARAM);
    const [debouncedQuery] = useDebounceValue(query, 500);

    return (
        <Page
            id='searchPage'
            title={globalize.translate('Search')}
            className='mainAnimatedPage libraryPage allLibraryPage noSecondaryNavPage'
        >
            <SearchFields query={query} onSearch={setQuery} />
            {!debouncedQuery ? (
                <SearchSuggestions parentId={parentId} />
            ) : (
                <SearchResults
                    parentId={parentId}
                    collectionType={collectionType}
                    query={debouncedQuery}
                />
            )}
        </Page>
    );
};

export default Search;
