import { beforeEach, describe, expect, test, vi } from 'vitest';
import RefreshDialog from './refreshdialog';

const mocks = vi.hoisted(() => ({
    refreshItem: vi.fn(), getApiClient: vi.fn(), close: vi.fn(), loadingShow: vi.fn(), toast: vi.fn()
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: mocks.getApiClient } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('utils/dom', () => ({ default: { parentWithClass: (target: Element, name: string) => target.closest(`.${name}`) } }));
vi.mock('components/layoutManager', () => ({ default: { tv: false } }));
vi.mock('components/loading/loading', () => ({ default: { show: mocks.loadingShow, hide: vi.fn() } }));
vi.mock('components/toast/toast', () => ({ default: mocks.toast }));
vi.mock('components/dialogHelper/dialogHelper', () => ({ default: {
    createDialog: () => {
        const dialog = document.createElement('div');
        dialog.classList.add('dialog');
        document.body.appendChild(dialog);
        return dialog;
    }, open: vi.fn(), close: mocks.close
} }));
vi.mock('elements/emby-input/emby-input', () => ({}));
vi.mock('elements/emby-button/emby-button', () => ({}));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('elements/emby-select/emby-select', () => ({}));
vi.mock('material-design-icons-iconfont', () => ({}));

function openDialog(mode?: string, itemIds = ['movie']) {
    void new RefreshDialog({ itemIds, serverId: 'server', mode }).show();
    return document.querySelector<HTMLElement>('.dialog')!;
}
function changeMode(dialog: HTMLElement, mode: string) {
    const select = dialog.querySelector<HTMLSelectElement>('#selectMetadataRefreshMode')!;
    select.value = mode;
    select.dispatchEvent(new Event('change'));
}
function setCheckbox(dialog: HTMLElement, selector: string, checked: boolean) {
    const input = dialog.querySelector<HTMLInputElement>(selector)!;
    input.checked = checked;
    input.dispatchEvent(new Event('change'));
}
function submit(dialog: HTMLElement) {
    const event = new Event('submit', { bubbles: true, cancelable: true });
    dialog.querySelector('form')!.dispatchEvent(event);
    return event;
}
beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mocks.getApiClient.mockReturnValue({ refreshItem: mocks.refreshItem });
    mocks.close.mockImplementation((dialog: HTMLElement) => dialog.dispatchEvent(new Event('close')));
});

describe('images-only refresh', () => {
    test('shows two unchecked image choices once and prevents empty submissions', () => {
        const dialog = openDialog('images');
        const visible = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
            .filter(input => !input.closest('.hide'));
        expect(dialog.querySelectorAll('option[value="images"]')).toHaveLength(1);
        expect(visible.map(input => input.className)).toEqual(['chkReplaceImages', 'chkReplaceTrickplayImages']);
        expect(visible.every(input => !input.checked)).toBe(true);
        expect(dialog.querySelector<HTMLButtonElement>('.btnSubmit')!.disabled).toBe(true);
        expect(dialog.querySelector('.imagesSelectionHelp')!.classList.contains('hide')).toBe(false);
        expect(submit(dialog).defaultPrevented).toBe(true);
        expect(mocks.getApiClient).not.toHaveBeenCalled();
        expect(mocks.refreshItem).not.toHaveBeenCalled();
        expect(mocks.loadingShow).not.toHaveBeenCalled();
        expect(mocks.close).not.toHaveBeenCalled();
        expect(mocks.toast).not.toHaveBeenCalled();
    });
    test.each([
        [true, false, 'FullRefresh'],
        [false, true, 'None'],
        [true, true, 'FullRefresh']
    ] as const)('refreshes ordinary images=%s and trickplay=%s independently', (images, trickplay, imageMode) => {
        const dialog = openDialog('images', ['movie', 'series']);
        setCheckbox(dialog, '.chkReplaceImages', images);
        setCheckbox(dialog, '.chkReplaceTrickplayImages', trickplay);
        expect(dialog.querySelector<HTMLButtonElement>('.btnSubmit')!.disabled).toBe(false);
        expect(dialog.querySelector('.imagesSelectionHelp')!.classList.contains('hide')).toBe(true);
        submit(dialog);
        expect(mocks.refreshItem.mock.calls).toEqual(['movie', 'series'].map(id => [id, {
            Recursive: true,
            ImageRefreshMode: imageMode,
            MetadataRefreshMode: 'None',
            ReplaceAllImages: images,
            RegenerateTrickplay: trickplay,
            ReplaceAllMetadata: false,
            IgnoreNfo: true
        }]));
    });
    test('disables submission after the final image selection is cleared', () => {
        const dialog = openDialog('images');
        setCheckbox(dialog, '.chkReplaceTrickplayImages', true);
        setCheckbox(dialog, '.chkReplaceTrickplayImages', false);
        expect(dialog.querySelector<HTMLButtonElement>('.btnSubmit')!.disabled).toBe(true);
        submit(dialog);
        expect(mocks.refreshItem).not.toHaveBeenCalled();
    });
});

describe('metadata refresh modes', () => {
    test.each([
        ['scan', 'Default', false, false],
        ['missing', 'FullRefresh', false, true],
        ['all', 'FullRefresh', true, true]
    ] as const)('keeps %s requests and NFO reading independent', (mode, refreshMode, replaceMetadata, replaceImages) => {
        const dialog = openDialog(mode);
        setCheckbox(dialog, '.chkIgnoreNfo', true);
        setCheckbox(dialog, '.chkReplaceImages', true);
        setCheckbox(dialog, '.chkReplaceTrickplayImages', true);
        submit(dialog);
        expect(mocks.refreshItem).toHaveBeenCalledWith('movie', {
            Recursive: true,
            ImageRefreshMode: refreshMode,
            MetadataRefreshMode: refreshMode,
            ReplaceAllImages: replaceImages,
            RegenerateTrickplay: replaceImages,
            ReplaceAllMetadata: replaceMetadata,
            IgnoreNfo: true
        });
    });
    test.each([true, false])('preserves the NFO choice %s across mode switches', checked => {
        const dialog = openDialog('missing');
        setCheckbox(dialog, '.chkIgnoreNfo', checked);
        changeMode(dialog, 'images');
        expect(dialog.querySelector('.fldIgnoreNfo')!.classList.contains('hide')).toBe(true);
        expect(dialog.querySelector<HTMLButtonElement>('.btnSubmit')!.disabled).toBe(true);
        changeMode(dialog, 'missing');
        expect(dialog.querySelector('.fldIgnoreNfo')!.classList.contains('hide')).toBe(false);
        expect(dialog.querySelector<HTMLInputElement>('.chkIgnoreNfo')!.disabled).toBe(false);
        expect(dialog.querySelector<HTMLInputElement>('.chkIgnoreNfo')!.checked).toBe(checked);
        expect(dialog.querySelector<HTMLButtonElement>('.btnSubmit')!.disabled).toBe(false);
        submit(dialog);
        expect(mocks.refreshItem.mock.calls[0][1].IgnoreNfo).toBe(checked);
    });
    test('starts each dialog with NFO reading enabled', () => {
        const first = openDialog('missing');
        setCheckbox(first, '.chkIgnoreNfo', true);
        document.body.innerHTML = '';
        const second = openDialog('missing');
        expect(second.querySelector<HTMLInputElement>('.chkIgnoreNfo')!.checked).toBe(false);
        submit(second);
        expect(mocks.refreshItem.mock.calls[0][1].IgnoreNfo).toBe(false);
    });
});
