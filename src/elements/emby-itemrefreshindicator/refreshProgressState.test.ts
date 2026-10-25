import { describe, expect, test } from 'vitest';
import { getInitialRefreshState, getRefreshIndicatorHtml, getRefreshPresentation, mergeRefreshState, readRefreshProgress, updateRefreshState } from './refreshProgressState';

describe('library refresh presentation', () => {
    test('keeps the upper slot while a sequential library waits at zero paths', () => {
        const state = getInitialRefreshState({
            RefreshStatus: 'Queued', RefreshMode: 'Sequential', RefreshProgress: 0,
            RefreshCurrentPath: 0, RefreshTotalPaths: 3, RefreshOperationId: 'queued-operation'
        });

        expect(getRefreshPresentation(state)).toMatchObject({
            visible: true, stacked: true, showPercentage: false, percent: 0, pathLabel: '0/3', pathPercent: 0
        });
        expect(state.operationId).toBe('queued-operation');
    });

    test('shows the active path ordinal and keeps its slot between paths', () => {
        const state = readRefreshProgress({
            Status: 'Active', Mode: 'Sequential', Progress: '42.9', CurrentPath: '2', TotalPaths: '3'
        });

        expect(getRefreshPresentation(state)).toMatchObject({
            visible: true, stacked: true, showPercentage: true, percent: 42, pathLabel: '2/3'
        });
        expect(getRefreshPresentation({ ...state, progress: 100 })).toMatchObject({ visible: true, showPercentage: false, pathLabel: '2/3' });
        expect(getRefreshPresentation({ ...state, progress: 0, currentPath: 3 })).toMatchObject({ visible: true, showPercentage: false, pathLabel: '3/3' });
        expect(getRefreshPresentation({ ...state, status: 'Idle' }).visible).toBe(false);
    });

    test.each(['Queued', 'Active'])('shows one aggregate circle including zero while %s', status => {
        const state = readRefreshProgress({ Status: status, Mode: 'Aggregate', Progress: '0', CurrentPath: '0', TotalPaths: '3' });
        expect(getRefreshPresentation(state)).toMatchObject({ visible: true, stacked: false, showPercentage: true, percent: 0 });
        expect(getRefreshPresentation({ ...state, status: 'Idle' }).visible).toBe(false);
    });

    test('retains the one-circle behavior for old servers and incomplete path data', () => {
        const state = readRefreshProgress({ Progress: '37' });
        expect(getRefreshPresentation(state)).toMatchObject({ visible: true, stacked: false, showPercentage: true, percent: 37 });
        expect(getRefreshPresentation({ ...state, progress: 0 }).visible).toBe(false);
        expect(getRefreshPresentation({ ...state, progress: 100 }).visible).toBe(false);
        expect(getRefreshPresentation(readRefreshProgress({ Progress: '37', Mode: 'Sequential', Status: 'Active' })).stacked).toBe(false);
    });

    test('shows unplanned legacy progress when the mode and path plan are empty', () => {
        const state = readRefreshProgress({ Progress: '37', Status: 'Active', Mode: '', CurrentPath: '0', TotalPaths: '0', OperationId: '' });
        expect(state.mode).toBeUndefined();
        expect(getRefreshPresentation(state)).toMatchObject({ visible: true, stacked: false, showPercentage: true, percent: 37 });
    });

    test('ignores other library events and accepts the current operation snapshot', () => {
        const state = getInitialRefreshState({ RefreshProgress: 10 });
        expect(updateRefreshState(state, { ItemId: 'other', Progress: '90' }, 'library')).toBe(state);
        expect(updateRefreshState(state, { ItemId: 'library', Progress: '50', OperationId: 'new-operation' }, 'library')).toMatchObject({ progress: 50, operationId: 'new-operation' });
    });

    test('rejects invalid path counters and keeps percentages finite and bounded', () => {
        expect(readRefreshProgress({ Progress: 'NaN' }).progress).toBe(0);
        expect(readRefreshProgress({ Progress: '500' }).progress).toBe(100);
        expect(readRefreshProgress({ Progress: '-5' }).progress).toBe(0);
        expect(readRefreshProgress({ Mode: 'Sequential', Status: 'Active', CurrentPath: '4', TotalPaths: '3' }).mode).toBeUndefined();
        expect(getRefreshPresentation(readRefreshProgress({ Mode: 'Sequential', Status: 'Active', CurrentPath: '0', TotalPaths: '0', Progress: '42' })).visible).toBe(false);
    });

    test('carries the full queued snapshot and logical library identity into legacy cards', () => {
        const markup = getRefreshIndicatorHtml({
            RefreshItemId: 'logical-library', RefreshStatus: 'Queued', RefreshMode: 'Sequential',
            RefreshCurrentPath: 0, RefreshTotalPaths: 3, RefreshOperationId: 'operation'
        });
        expect(markup).not.toContain('class="hide"');
        expect(markup).toContain('data-refreshitemid="logical-library"');
        expect(markup).toContain('data-refresh-mode="Sequential"');
        expect(markup).toContain('data-current-path="0"');
        expect(markup).toContain('data-total-paths="3"');
        expect(markup).toContain('data-operation-id="operation"');
    });

    test('ignores an older aggregate percentage from the same operation', () => {
        const state = readRefreshProgress({ Status: 'Active', Mode: 'Aggregate', Progress: '60', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' });
        expect(updateRefreshState(state, { ItemId: 'library', Status: 'Active', Mode: 'Aggregate', Progress: '33', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' }, 'library')).toBe(state);
        expect(updateRefreshState(state, { ItemId: 'library', Status: 'Active', Mode: 'Aggregate', Progress: '70', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' }, 'library').progress).toBe(70);
    });

    test('allows a new sequential path to reset its percentage and rejects stale path updates', () => {
        const first = readRefreshProgress({ Status: 'Active', Mode: 'Sequential', Progress: '80', CurrentPath: '1', TotalPaths: '3', OperationId: 'operation' });
        const second = updateRefreshState(first, { ItemId: 'library', Status: 'Active', Mode: 'Sequential', Progress: '0', CurrentPath: '2', TotalPaths: '3', OperationId: 'operation' }, 'library');
        expect(second).toMatchObject({ currentPath: 2, progress: 0 });
        expect(updateRefreshState(second, { ItemId: 'library', Status: 'Active', Mode: 'Sequential', Progress: '100', CurrentPath: '1', TotalPaths: '3', OperationId: 'operation' }, 'library')).toBe(second);
        const advanced = { ...second, progress: 50 };
        expect(updateRefreshState(advanced, { ItemId: 'library', Status: 'Active', Mode: 'Sequential', Progress: '20', CurrentPath: '2', TotalPaths: '3', OperationId: 'operation' }, 'library')).toBe(advanced);
    });

    test('keeps a fresh active HTTP snapshot when an older queued event arrives', () => {
        const state = getInitialRefreshState({ RefreshStatus: 'Active', RefreshMode: 'Sequential', RefreshProgress: 10, RefreshCurrentPath: 2, RefreshTotalPaths: 3, RefreshOperationId: 'operation' });
        expect(updateRefreshState(state, { ItemId: 'library', Status: 'Queued', Mode: 'Sequential', Progress: '0', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' }, 'library')).toBe(state);
    });

    test('accepts idle completion and rejects late activity until a different operation starts', () => {
        const state = readRefreshProgress({ Status: 'Active', Mode: 'Aggregate', Progress: '60', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' });
        const idle = updateRefreshState(state, { ItemId: 'library', Status: 'Idle', Mode: 'Aggregate', Progress: '0', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' }, 'library');
        expect(idle.status).toBe('Idle');
        expect(getRefreshPresentation(idle).visible).toBe(false);
        expect(updateRefreshState(idle, { ItemId: 'library', Status: 'Active', Mode: 'Aggregate', Progress: '90', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' }, 'library')).toBe(idle);
        expect(updateRefreshState(idle, { ItemId: 'library', Status: 'Queued', Mode: 'Aggregate', Progress: '0', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' }, 'library')).toBe(idle);
        expect(updateRefreshState(idle, { ItemId: 'library', Status: 'Queued', Mode: 'Aggregate', Progress: '0', CurrentPath: '0', TotalPaths: '3', OperationId: 'new-operation' }, 'library')).toMatchObject({ status: 'Queued', operationId: 'new-operation' });
    });

    test('preserves legacy, unowned and different-mode acceptance without a history cache', () => {
        const state = readRefreshProgress({ Status: 'Active', Mode: 'Aggregate', Progress: '60', CurrentPath: '0', TotalPaths: '3', OperationId: 'operation' });
        expect(mergeRefreshState(state, readRefreshProgress({ Progress: '12' }))).toMatchObject({ progress: 12, mode: undefined });
        expect(mergeRefreshState(state, readRefreshProgress({ Status: 'Active', Mode: 'Aggregate', Progress: '33', CurrentPath: '0', TotalPaths: '3' })).progress).toBe(33);
        expect(mergeRefreshState(state, readRefreshProgress({ Status: 'Active', Mode: 'Sequential', Progress: '4', CurrentPath: '1', TotalPaths: '3', OperationId: 'operation' }))).toMatchObject({ mode: 'Sequential', progress: 4 });
    });
});
