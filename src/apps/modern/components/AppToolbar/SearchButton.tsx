import React, { type FC } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import globalize from 'lib/globalize';
import { getSearchUrl } from 'utils/search';

const SearchButton: FC = () => {
    const location = useLocation();
    const [searchParams] = useSearchParams();

    const isSearchPath = location.pathname === '/search';
    const searchLink = `/${getSearchUrl({
        parentId: searchParams.get('parentId'),
        topParentId: searchParams.get('topParentId'),
        collectionType: searchParams.get('collectionType')
    })}`;

    return (
        <Tooltip title={globalize.translate('Search')}>
            <IconButton
                size='large'
                aria-label={globalize.translate('Search')}
                color='inherit'
                component={Link}
                disabled={isSearchPath}
                to={searchLink}
            >
                <SearchIcon />
            </IconButton>
        </Tooltip>
    );
};

export default SearchButton;
