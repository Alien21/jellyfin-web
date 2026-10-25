import React, { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';

import CircularProgress, {
    CircularProgressProps
} from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { toPercentString } from 'utils/number';
import globalize, { getCurrentDateTimeLocale } from 'lib/globalize';
import type { ItemDto } from 'types/base/models/item-dto';
import { useApi } from 'hooks/useApi';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import type { RefreshProgressMessage } from '@jellyfin/sdk/lib/generated-client/models/refresh-progress-message';
import { getInitialRefreshState, getRefreshPresentation, mergeRefreshState, updateRefreshState, type RefreshItemInfo } from './refreshProgressState';

import './emby-itemrefreshindicator.scss';
import '../emby-progressring/emby-progressring.scss';

function CircularProgressWithLabel(
    { label, ...props }: CircularProgressProps & { value: number; label?: string }
) {
    return (
        <Box sx={{ position: 'relative', display: 'inline-flex', width: '100%', height: '100%' }}>
            <CircularProgress variant='determinate' size='100%' {...props} />
            <Box
                sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <Typography
                    variant='caption'
                    component='div'
                    color='text.secondary'
                >
                    {label ?? toPercentString(props.value / 100, getCurrentDateTimeLocale())}
                </Typography>
            </Box>
        </Box>
    );
}

interface RefreshIndicatorProps {
    item: ItemDto & RefreshItemInfo;
    className?: string;
}

const RefreshIndicator: FC<RefreshIndicatorProps> = ({ item, className }) => {
    const { api } = useApi();
    const refreshItemId = item.RefreshItemId || item.Id;

    const initialState = useMemo(() => getInitialRefreshState({
        RefreshProgress: item.RefreshProgress,
        RefreshStatus: item.RefreshStatus,
        RefreshMode: item.RefreshMode,
        RefreshCurrentPath: item.RefreshCurrentPath,
        RefreshTotalPaths: item.RefreshTotalPaths,
        RefreshOperationId: item.RefreshOperationId
    }), [
        item.RefreshProgress, item.RefreshStatus, item.RefreshMode,
        item.RefreshCurrentPath, item.RefreshTotalPaths, item.RefreshOperationId
    ]);
    const [state, setState] = useState(initialState);
    const previousRefreshItemId = useRef(refreshItemId);

    useEffect(() => {
        const identityChanged = previousRefreshItemId.current !== refreshItemId;
        previousRefreshItemId.current = refreshItemId;
        setState(current => identityChanged ? initialState : mergeRefreshState(current, initialState));
    }, [initialState, refreshItemId]);

    const onRefreshProgress = useCallback(({ Data }: RefreshProgressMessage) => {
        setState(current => updateRefreshState(current, Data, refreshItemId));
    }, [refreshItemId]);

    useEffect(() => {
        return api?.subscribe([OutboundWebSocketMessageType.RefreshProgress], onRefreshProgress);
    }, [api, onRefreshProgress]);

    const presentation = getRefreshPresentation(state);

    return presentation.visible ? (
        <div className={classNames('refreshIndicator', className)}>
            <div
                className='progressring'
                data-refresh-slot='percentage'
                style={{ visibility: presentation.showPercentage ? 'visible' : 'hidden' }}
            >
                <CircularProgressWithLabel value={presentation.percent} aria-label={globalize.translate('Refresh')} />
            </div>
            {presentation.stacked && (
                <div className='progressring' data-refresh-slot='paths'>
                    <CircularProgressWithLabel
                        value={presentation.pathPercent}
                        label={presentation.pathLabel}
                        aria-label={globalize.translate('HeaderPaths')}
                        aria-valuetext={presentation.pathLabel}
                    />
                </div>
            )}
        </div>
    ) : null;
};

export default RefreshIndicator;
