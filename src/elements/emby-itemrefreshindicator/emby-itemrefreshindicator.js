import EmbyProgressRing from '../emby-progressring/emby-progressring';
import dom from '../../utils/dom';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import globalize from 'lib/globalize';
import { getRefreshPresentation, readRefreshProgress, updateRefreshState } from './refreshProgressState';

import 'webcomponents.js/webcomponents-lite';
import './emby-itemrefreshindicator.scss';

function createRing(slot) {
    const ring = document.createElement('div');
    ring.setProgress = EmbyProgressRing.setProgress;
    EmbyProgressRing.createdCallback.call(ring);
    ring.dataset.refreshSlot = slot;
    ring.setAttribute('role', 'progressbar');
    ring.setAttribute('aria-valuemin', '0');
    ring.setAttribute('aria-valuemax', '100');
    ring.setAttribute('aria-label', globalize.translate(slot === 'paths' ? 'HeaderPaths' : 'Refresh'));
    return ring;
}

function renderState(indicator) {
    const presentation = getRefreshPresentation(indicator._refreshState);
    indicator.classList.toggle('hide', !presentation.visible);
    indicator._progressRing.style.visibility = presentation.showPercentage ? 'visible' : 'hidden';
    indicator._progressRing.dataset.progress = presentation.percent;
    indicator._progressRing.setAttribute('aria-valuenow', presentation.percent);
    indicator._progressRing.setProgress(presentation.percent);
    indicator._pathRing.classList.toggle('hide', !presentation.stacked);
    indicator._pathRing.dataset.progress = presentation.pathPercent;
    indicator._pathRing.dataset.label = presentation.pathLabel;
    indicator._pathRing.setAttribute('aria-valuenow', presentation.pathPercent);
    indicator._pathRing.setAttribute('aria-valuetext', presentation.pathLabel);
    indicator._pathRing.setProgress(presentation.pathPercent);
}

const EmbyItemRefreshIndicatorPrototype = Object.create(HTMLDivElement.prototype);

EmbyItemRefreshIndicatorPrototype.createdCallback = function () {
    this.classList.add('refreshIndicator');
    this._progressRing = createRing('percentage');
    this._pathRing = createRing('paths');
    this.appendChild(this._progressRing);
    this.appendChild(this._pathRing);
    this._refreshState = readRefreshProgress({
        Progress: this.dataset.progress,
        Status: this.dataset.status,
        Mode: this.dataset.refreshMode,
        CurrentPath: this.dataset.currentPath,
        TotalPaths: this.dataset.totalPaths,
        OperationId: this.dataset.operationId
    });
    renderState(this);

    const handler = ({ Data }) => {
        const itemId = this.dataset.refreshitemid || dom.parentWithAttribute(this, 'data-id')?.getAttribute('data-id');
        const state = updateRefreshState(this._refreshState, Data, itemId);
        if (state !== this._refreshState) {
            this._refreshState = state;
            renderState(this);
        }
    };

    const serverId = dom.parentWithAttribute(this, 'data-serverid')?.getAttribute('data-serverid');
    const apiClient = serverId ? ServerConnections.getApiClient(serverId) : ServerConnections.currentApiClient();
    this._wsUnsubscribers = [];
    if (apiClient) {
        this._wsUnsubscribers.push(apiClient.subscribe([OutboundWebSocketMessageType.RefreshProgress], handler));
    }
};

EmbyItemRefreshIndicatorPrototype.attachedCallback = function () {
    // no-op
};

EmbyItemRefreshIndicatorPrototype.detachedCallback = function () {
    EmbyProgressRing.detachedCallback.call(this._progressRing);
    EmbyProgressRing.detachedCallback.call(this._pathRing);

    this._wsUnsubscribers?.forEach(unsub => {
        unsub();
    });
    this._wsUnsubscribers = [];
};

document.registerElement('emby-itemrefreshindicator', {
    prototype: EmbyItemRefreshIndicatorPrototype,
    extends: 'div'
});

export default EmbyItemRefreshIndicatorPrototype;
