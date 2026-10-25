import escapeHtml from 'escape-html';

type NumericRefreshValue = string | number | null;

export interface RefreshItemInfo {
    RefreshItemId?: string | null;
    RefreshProgress?: number | null;
    RefreshStatus?: string | null;
    RefreshMode?: string | null;
    RefreshCurrentPath?: number | null;
    RefreshTotalPaths?: number | null;
    RefreshOperationId?: string | null;
}

export interface RefreshProgressData {
    ItemId?: string | null;
    Progress?: NumericRefreshValue;
    Status?: string | null;
    Mode?: string | null;
    CurrentPath?: NumericRefreshValue;
    TotalPaths?: NumericRefreshValue;
    OperationId?: string | null;
}

export interface RefreshState {
    progress: number;
    status?: 'Queued' | 'Active' | 'Idle';
    mode?: 'Sequential' | 'Aggregate';
    currentPath: number;
    totalPaths: number;
    operationId?: string;
}

function numberValue(value: NumericRefreshValue | undefined): number | undefined {
    if (value == null || value === '') return undefined;
    const result = Number(value);
    return Number.isFinite(result) ? result : undefined;
}

export function readRefreshProgress(data: RefreshProgressData): RefreshState {
    const progress = Math.max(0, Math.min(100, numberValue(data.Progress) ?? 0));
    const status = data.Status === 'Queued' || data.Status === 'Active' || data.Status === 'Idle' ? data.Status : undefined;
    const mode = data.Mode === 'Sequential' || data.Mode === 'Aggregate' ? data.Mode : undefined;
    const currentPath = numberValue(data.CurrentPath);
    const totalPaths = numberValue(data.TotalPaths);
    const hasPathState = mode && status
        && currentPath !== undefined && Number.isInteger(currentPath) && currentPath >= 0
        && totalPaths !== undefined && Number.isInteger(totalPaths) && totalPaths >= currentPath;

    return {
        progress,
        status,
        mode: hasPathState ? mode : undefined,
        currentPath: hasPathState ? currentPath : 0,
        totalPaths: hasPathState ? totalPaths : 0,
        operationId: data.OperationId || undefined
    };
}

export function getInitialRefreshState(item: RefreshItemInfo): RefreshState {
    return readRefreshProgress({
        Progress: item.RefreshProgress,
        Status: item.RefreshStatus,
        Mode: item.RefreshMode,
        CurrentPath: item.RefreshCurrentPath,
        TotalPaths: item.RefreshTotalPaths,
        OperationId: item.RefreshOperationId
    });
}

export function mergeRefreshState(state: RefreshState, next: RefreshState): RefreshState {
    if (!state.operationId || state.operationId !== next.operationId || !state.mode || state.mode !== next.mode) {
        return next;
    }

    // A fresh HTTP snapshot and the live stream can arrive in either order.
    // Only snapshots belonging to the same operation and plan are comparable.
    if (next.status === 'Idle') return next;
    if (state.status === 'Idle') return state;
    if (state.status === 'Active' && next.status === 'Queued') return state;

    if (state.mode === 'Aggregate') {
        return next.progress < state.progress ? state : next;
    }

    if (next.currentPath < state.currentPath
        || (next.currentPath === state.currentPath && next.progress < state.progress)) {
        return state;
    }

    return next;
}

export function updateRefreshState(state: RefreshState, data: RefreshProgressData | null | undefined, itemId: string | null | undefined): RefreshState {
    return itemId && data?.ItemId === itemId ? mergeRefreshState(state, readRefreshProgress(data)) : state;
}

export function getRefreshPresentation(state: RefreshState) {
    const running = state.status === 'Queued' || state.status === 'Active';
    const stacked = state.mode === 'Sequential' && state.totalPaths > 0;
    const aggregate = state.mode === 'Aggregate';
    const percent = state.status === 'Queued' && state.mode ? 0 : Math.floor(state.progress);
    const hasPercentage = state.progress > 0 && state.progress < 100;
    const currentPath = state.status === 'Queued' ? 0 : state.currentPath;

    return {
        visible: state.mode ? running && (stacked || aggregate) : hasPercentage,
        stacked,
        showPercentage: aggregate ? running : hasPercentage && (!state.mode || state.status === 'Active'),
        percent,
        pathPercent: state.totalPaths ? 100 * currentPath / state.totalPaths : 0,
        pathLabel: `${currentPath}/${state.totalPaths}`
    };
}

/** Builds the initial legacy markup from the same state used by the React card. */
export function getRefreshIndicatorHtml(item: RefreshItemInfo): string {
    const state = getInitialRefreshState(item);
    const attributes = [ `data-progress="${state.progress}"` ];
    if (item.RefreshItemId) attributes.push(`data-refreshitemid="${escapeHtml(item.RefreshItemId)}"`);
    if (state.status) attributes.push(`data-status="${state.status}"`);
    if (state.mode) {
        attributes.push(`data-refresh-mode="${state.mode}"`);
        attributes.push(`data-current-path="${state.currentPath}"`);
        attributes.push(`data-total-paths="${state.totalPaths}"`);
    }
    if (state.operationId) attributes.push(`data-operation-id="${escapeHtml(state.operationId)}"`);

    return `<div is="emby-itemrefreshindicator"${getRefreshPresentation(state).visible ? '' : ' class="hide"'} ${attributes.join(' ')}></div>`;
}
