import layoutManager from '../../components/layoutManager';
import browser from '../../scripts/browser';
import actionsheet from '../../components/actionSheet/actionSheet';
import { closeTrackSelectionDropdown, showTrackSelectionDropdown } from './trackSelectionDropdown';
import './emby-select.scss';
import 'webcomponents.js/webcomponents-lite';

const EmbySelectPrototype = Object.create(HTMLSelectElement.prototype);

function enableNativeMenu() {
    // WebView 2 creates dropdown that doesn't work with controller.
    if (browser.edgeUwp || browser.xboxOne) {
        return false;
    }

    // Doesn't seem to work at all
    if (browser.tizen || browser.orsay || browser.web0s) {
        return false;
    }

    // Take advantage of the native input methods
    if (browser.tv) {
        return true;
    }

    return !layoutManager.tv;
}

function triggerChange(select) {
    const evt = new Event('change', { bubbles: false, cancelable: true });
    select.dispatchEvent(evt);
}

function setValue(select, value) {
    select.value = value;
}

function showActionSheet(select) {
    const labelElem = getLabel(select);
    const title = labelElem ? (labelElem.textContent || labelElem.innerText) : null;

    actionsheet.show({
        items: select.options,
        positionTo: select,
        title: title

    }).then(function (value) {
        setValue(select, value);
        triggerChange(select);
    });
}

function syncTrackSelectionValue(select) {
    const button = select._trackSelectionButton;
    if (!button) return;

    closeTrackSelectionDropdown(select, !select.disabled && select._trackSelectionDropdown?.containsFocus());
    const option = select.options[select.selectedIndex];
    button.querySelector('.trackSelectionPrimary').textContent = option?.textContent || '';
    const secondary = button.querySelector('.trackSelectionSecondary');
    secondary.textContent = option?.dataset.secondaryText || '';
    secondary.hidden = !secondary.textContent;
    const label = getLabel(select);
    button.setAttribute('aria-label', [label?.textContent || label?.innerText, option?.textContent, secondary.textContent].filter(Boolean).join(': '));
    button.disabled = select.disabled;
    button.tabIndex = select.tabIndex;
}

function showTrackSelection(select) {
    const button = select._trackSelectionButton;
    if (!button || select.disabled || select._trackSelectionOpen) return;

    const label = getLabel(select);
    button.setAttribute('aria-haspopup', layoutManager.tv ? 'dialog' : 'listbox');
    if (!layoutManager.tv) {
        showTrackSelectionDropdown(select, button, label, value => {
            setValue(select, value);
            triggerChange(select);
        });
        return;
    }

    select._trackSelectionOpen = true;
    button.setAttribute('aria-expanded', 'true');
    actionsheet.show({
        items: Array.from(select.options).map(option => ({
            id: option.value,
            name: option.textContent,
            secondaryText: option.dataset.secondaryText,
            selected: option.selected
        })),
        positionTo: button,
        title: label?.textContent || '',
        dialogClass: 'trackSelectionActionSheet'
    }).then(value => {
        if (value != null) {
            setValue(select, value);
            triggerChange(select);
        }
    }).catch(() => {
        // Dismissing the menu leaves the selected track unchanged.
    }).finally(() => {
        select._trackSelectionOpen = false;
        button.setAttribute('aria-expanded', 'false');
        if (button.parentNode && !button.disabled) button.focus();
    });
}

function watchTrackSelectionValue(select, enable) {
    // Programmatic value changes do not emit change or DOM mutations.
    for (const property of ['value', 'selectedIndex']) {
        if (enable) {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property);
            Object.defineProperty(select, property, {
                configurable: true,
                get() { return descriptor.get.call(this); },
                set(value) {
                    descriptor.set.call(this, value);
                    syncTrackSelectionValue(this);
                }
            });
        } else {
            delete select[property];
        }
    }
}

function removeTrackSelection(select) {
    if (!select._trackSelectionButton) return;

    closeTrackSelectionDropdown(select);
    select._trackSelectionButton.remove();
    select._trackSelectionButton = null;
    select.classList.remove('emby-select-track-hidden');
    watchTrackSelectionValue(select, false);
    const label = getLabel(select);
    if (label) label.htmlFor = select.id;
}

function syncTrackSelection(select) {
    if (select.getAttribute('data-track-selection') !== 'true') {
        removeTrackSelection(select);
        return;
    }

    const label = getLabel(select);
    if (!select._trackSelectionButton) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = select.id + '-track-selection';
        button.className = select.className + ' emby-select-track-button';
        button.setAttribute('aria-haspopup', layoutManager.tv ? 'dialog' : 'listbox');
        button.setAttribute('aria-expanded', 'false');
        button.innerHTML = '<span class="trackSelectionPrimary"></span><span class="trackSelectionSecondary"></span>';
        button.addEventListener('click', () => {
            if (select._trackSelectionDropdown) {
                closeTrackSelectionDropdown(select, true);
            } else {
                showTrackSelection(select);
            }
        });
        button.addEventListener('keydown', event => {
            // Arrow keys open the menu; Enter and Space use native button activation.
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.keyCode === 195) {
                event.preventDefault();
                showTrackSelection(select);
            }
        });
        button.addEventListener('focus', onFocus);
        button.addEventListener('blur', onBlur);
        select.parentNode.insertBefore(button, select.nextSibling);
        select._trackSelectionButton = button;
        select.classList.add('emby-select-track-hidden');
        watchTrackSelectionValue(select, true);
    }

    if (label) label.htmlFor = select._trackSelectionButton.id;
    select._trackSelectionButton.setAttribute('aria-haspopup', layoutManager.tv ? 'dialog' : 'listbox');
    syncTrackSelectionValue(select);
}

function observeTrackSelection(select) {
    if (!select._trackSelectionObserver) {
        select._trackSelectionObserver = new MutationObserver(() => syncTrackSelection(select));
    }
    select._trackSelectionObserver.observe(select, {
        attributes: true,
        attributeFilter: ['data-track-selection', 'disabled', 'selected', 'data-secondary-text', 'tabindex'],
        childList: true,
        characterData: true,
        subtree: true
    });
}

function getLabel(select) {
    let elem = select.previousSibling;
    while (elem && elem.tagName !== 'LABEL') {
        elem = elem.previousSibling;
    }
    return elem;
}

function onFocus() {
    const label = getLabel(this);
    if (label) {
        label.classList.add('selectLabelFocused');
    }
}

function onBlur() {
    const label = getLabel(this);
    if (label) {
        label.classList.remove('selectLabelFocused');
    }
}

function onMouseDown(e) {
    // e.button=0 for primary (left) mouse button click
    if (!e.button && !enableNativeMenu()) {
        e.preventDefault();
        showActionSheet(this);
    }
}

function onKeyDown(e) {
    // Xbox controller for UWP WebView2 uses keycode 195 to select.
    if ((e.keyCode === 13 || e.keyCode === 195) && !enableNativeMenu()) {
        e.preventDefault();
        showActionSheet(this);
    }
}

let inputId = 0;

EmbySelectPrototype.createdCallback = function () {
    if (!this.id) {
        this.id = 'embyselect' + inputId;
        inputId++;
    }

    this.classList.add('emby-select-withcolor');

    if (layoutManager.tv) {
        this.classList.add('emby-select-focusscale');
    }

    this.addEventListener('mousedown', onMouseDown);
    this.addEventListener('keydown', onKeyDown);

    this.addEventListener('focus', onFocus);
    this.addEventListener('blur', onBlur);
    this.addEventListener('change', () => syncTrackSelectionValue(this));
};

EmbySelectPrototype.attachedCallback = function () {
    observeTrackSelection(this);
    if (this.classList.contains('emby-select')) {
        syncTrackSelection(this);
        return;
    }

    this.classList.add('emby-select');

    const label = this.ownerDocument.createElement('label');
    label.innerText = this.getAttribute('label') || '';
    label.classList.add('selectLabel');
    label.htmlFor = this.id;
    this.parentNode?.insertBefore(label, this);

    if (this.classList.contains('emby-select-withcolor')) {
        this.parentNode?.insertAdjacentHTML('beforeend', '<div class="selectArrowContainer"><div style="visibility:hidden;display:none;">0</div><span class="selectArrow material-icons keyboard_arrow_down" aria-hidden="true"></span></div>');
    }
    syncTrackSelection(this);
};

EmbySelectPrototype.detachedCallback = function () {
    this._trackSelectionObserver?.disconnect();
    removeTrackSelection(this);
};

EmbySelectPrototype.refreshTrackSelection = function () {
    syncTrackSelection(this);
};

EmbySelectPrototype.setLabel = function (text) {
    const label = this.parentNode?.querySelector('label');

    label.innerText = text;
};

document.registerElement('emby-select', {
    prototype: EmbySelectPrototype,
    extends: 'select'
});

