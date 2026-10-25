import dom from '../../utils/dom';
import dialogHelper from '../dialogHelper/dialogHelper';
import loading from '../loading/loading';
import layoutManager from '../layoutManager';
import globalize from '../../lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import '../../elements/emby-input/emby-input';
import '../../elements/emby-button/emby-button';
import '../../elements/emby-button/paper-icon-button-light';
import '../../elements/emby-checkbox/emby-checkbox';
import '../../elements/emby-select/emby-select';
import 'material-design-icons-iconfont';
import '../formdialog.scss';
import toast from '../toast/toast';

function getEditorHtml() {
    let html = '';

    html += '<div class="formDialogContent smoothScrollY" style="padding-top:2em;">';
    html += '<div class="dialogContentInner dialog-content-centered">';
    html += '<form style="margin:auto;">';

    html += '<div class="fldSelectPlaylist selectContainer">';
    html += '<select is="emby-select" id="selectMetadataRefreshMode" label="' + globalize.translate('LabelRefreshMode') + '">';
    html += '<option value="scan" selected>' + globalize.translate('ScanForNewAndUpdatedFiles') + '</option>';
    html += '<option value="missing">' + globalize.translate('SearchForMissingMetadata') + '</option>';
    html += '<option value="all">' + globalize.translate('ReplaceAllMetadata') + '</option>';
    html += '<option value="images">' + globalize.translate('RefreshImagesOnly') + '</option>';
    html += '</select>';
    html += '</div>';

    html += '<label class="checkboxContainer hide fldReplaceExistingImages">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkReplaceImages" />';
    html += '<span>' + globalize.translate('ReplaceExistingImages') + '</span>';
    html += '</label>';

    html += '<label class="checkboxContainer hide fldReplaceTrickplayImages">';
    html += '<input type="checkbox" is="emby-checkbox" class="chkReplaceTrickplayImages" />';
    html += '<span>' + globalize.translate('ReplaceTrickplayImages') + '</span>';
    html += '</label>';

    html += '<div class="checkboxContainer checkboxContainer-withDescription fldIgnoreNfo">';
    html += '<label>';
    html += '<input type="checkbox" is="emby-checkbox" class="chkIgnoreNfo" />';
    html += '<span>' + globalize.translate('IgnoreNfo') + '</span>';
    html += '</label>';
    html += '<div class="fieldDescription checkboxFieldDescription">' + globalize.translate('IgnoreNfoHelp') + '</div>';
    html += '</div>';

    html += '<div class="fieldDescription refreshModeHelp">';
    html += globalize.translate('RefreshDialogHelp');
    html += '</div>';

    html += '<div class="fieldDescription hide imagesSelectionHelp" role="status">' + globalize.translate('RefreshImagesSelectionHelp') + '</div>';

    html += '<input type="hidden" class="fldSelectedItemIds" />';

    html += '<br />';
    html += '<div class="formDialogFooter">';
    html += '<button is="emby-button" type="submit" class="raised btnSubmit block formDialogFooterItem button-submit">' + globalize.translate('Refresh') + '</button>';
    html += '</div>';

    html += '</form>';
    html += '</div>';
    html += '</div>';

    return html;
}

function centerFocus(elem, horiz, on) {
    import('../../scripts/scrollHelper').then((scrollHelper) => {
        const fn = on ? 'on' : 'off';
        scrollHelper.centerFocus[fn](elem, horiz);
    });
}

function onSubmit(e) {
    e.preventDefault();

    const instance = this;
    const dlg = dom.parentWithClass(e.target, 'dialog');
    const options = instance.options;

    const selectedMode = dlg.querySelector('#selectMetadataRefreshMode').value;
    const imagesOnly = selectedMode === 'images';
    const mode = selectedMode === 'scan' ? 'Default' : 'FullRefresh';
    const replaceAllImages = mode === 'FullRefresh' && dlg.querySelector('.chkReplaceImages').checked;
    const replaceTrickplayImages = mode === 'FullRefresh' && dlg.querySelector('.chkReplaceTrickplayImages').checked;

    if (imagesOnly && !replaceAllImages && !replaceTrickplayImages) {
        updateControls(dlg);
        return;
    }

    loading.show();
    const apiClient = ServerConnections.getApiClient(options.serverId);

    options.itemIds.forEach(function (itemId) {
        apiClient.refreshItem(itemId, {
            Recursive: true,
            ImageRefreshMode: imagesOnly && !replaceAllImages ? 'None' : mode,
            MetadataRefreshMode: imagesOnly ? 'None' : mode,
            ReplaceAllImages: replaceAllImages,
            RegenerateTrickplay: replaceTrickplayImages,
            ReplaceAllMetadata: selectedMode === 'all',
            IgnoreNfo: imagesOnly || dlg.querySelector('.chkIgnoreNfo').checked
        });
    });

    dialogHelper.close(dlg);

    toast(globalize.translate('RefreshQueued'));

    loading.hide();
}

function updateControls(dlg) {
    const selectedMode = dlg.querySelector('#selectMetadataRefreshMode').value;
    const imagesOnly = selectedMode === 'images';
    const scan = selectedMode === 'scan';
    const noImagesSelected = imagesOnly && !dlg.querySelector('.chkReplaceImages').checked && !dlg.querySelector('.chkReplaceTrickplayImages').checked;

    dlg.querySelector('.fldReplaceExistingImages').classList.toggle('hide', scan);
    dlg.querySelector('.fldReplaceTrickplayImages').classList.toggle('hide', scan);
    dlg.querySelector('.fldIgnoreNfo').classList.toggle('hide', imagesOnly);
    dlg.querySelector('.chkIgnoreNfo').disabled = imagesOnly;
    dlg.querySelector('.refreshModeHelp').textContent = globalize.translate(imagesOnly ? 'RefreshImagesOnlyHelp' : 'RefreshDialogHelp');
    dlg.querySelector('.imagesSelectionHelp').classList.toggle('hide', !noImagesSelected);
    dlg.querySelector('.btnSubmit').disabled = noImagesSelected;
}

class RefreshDialog {
    constructor(options) {
        this.options = options;
    }

    show() {
        const dialogOptions = {
            removeOnClose: true,
            scrollY: false
        };

        if (layoutManager.tv) {
            dialogOptions.size = 'fullscreen';
        } else {
            dialogOptions.size = 'small';
        }

        const dlg = dialogHelper.createDialog(dialogOptions);

        dlg.classList.add('formDialog');

        let html = '';
        const title = globalize.translate('RefreshMetadata');

        html += '<div class="formDialogHeader">';
        html += `<button is="paper-icon-button-light" class="btnCancel autoSize" tabindex="-1" title="${globalize.translate('ButtonBack')}"><span class="material-icons arrow_back" aria-hidden="true"></span></button>`;
        html += '<h3 class="formDialogHeaderTitle">';
        html += title;
        html += '</h3>';

        html += '</div>';

        html += getEditorHtml();

        dlg.innerHTML = html;

        dlg.querySelector('form').addEventListener('submit', onSubmit.bind(this));

        const onOptionsChanged = function () {
            updateControls(dlg);
        };
        dlg.querySelector('#selectMetadataRefreshMode').addEventListener('change', onOptionsChanged);
        dlg.querySelector('.chkReplaceImages').addEventListener('change', onOptionsChanged);
        dlg.querySelector('.chkReplaceTrickplayImages').addEventListener('change', onOptionsChanged);

        if (this.options.mode) {
            dlg.querySelector('#selectMetadataRefreshMode').value = this.options.mode;
        }

        dlg.querySelector('#selectMetadataRefreshMode').dispatchEvent(new CustomEvent('change'));

        dlg.querySelector('.btnCancel').addEventListener('click', function () {
            dialogHelper.close(dlg);
        });

        if (layoutManager.tv) {
            centerFocus(dlg.querySelector('.formDialogContent'), false, true);
        }

        return new Promise(function (resolve) {
            if (layoutManager.tv) {
                centerFocus(dlg.querySelector('.formDialogContent'), false, false);
            }

            dlg.addEventListener('close', resolve);
            dialogHelper.open(dlg);
        });
    }
}

export default RefreshDialog;
