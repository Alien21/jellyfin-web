import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ show: vi.fn(), prototype: null, layout: { tv: false } }));
vi.mock('../../components/actionSheet/actionSheet', () => ({ default: { show: mocks.show } }));
vi.mock('../../components/layoutManager', () => ({ default: mocks.layout }));
vi.mock('../../scripts/browser', () => ({ default: {} }));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));

Object.defineProperty(document, 'registerElement', {
    configurable: true,
    value: (_name, options) => { mocks.prototype = options.prototype; }
});
await import('./emby-select');

const fixtures = [];

function createSelect(enhanced = true) {
    const wrapper = document.createElement('div');
    const select = document.createElement('select');
    Object.setPrototypeOf(select, mocks.prototype);
    select.innerHTML = '<option value="0" data-secondary-text="Original &lt;title&gt;">Čeština - SUBRIP</option>'
        + '<option value="1" data-secondary-text="English SDH">Angličtina - Sluchově postižení - SUBRIP</option>';
    if (enhanced) select.setAttribute('data-track-selection', 'true');
    select.createdCallback();
    wrapper.appendChild(select);
    document.body.appendChild(wrapper);
    select.attachedCallback();
    fixtures.push(select);
    return { select, wrapper, button: wrapper.querySelector('button') };
}

async function flushMutations() {
    await Promise.resolve();
    await Promise.resolve();
}

beforeEach(() => {
    mocks.layout.tv = false;
    mocks.show.mockReset();
    mocks.show.mockImplementation(() => new Promise(() => { /* Keep the menu open until a test resolves it. */ }));
});

afterEach(() => {
    for (const select of fixtures.splice(0)) select.detachedCallback();
    document.body.innerHTML = '';
});

describe('two-line track selection', () => {
    test('keeps ordinary selects native and restores them when the extension is disabled', () => {
        const { select, wrapper } = createSelect(false);
        expect(wrapper.querySelector('button')).toBeNull();
        expect(Object.hasOwn(select, 'value')).toBe(false);
        select.setAttribute('data-track-selection', 'true');
        select.refreshTrackSelection();
        expect(wrapper.querySelector('button')).not.toBeNull();
        expect(wrapper.querySelector('label').htmlFor).toBe(wrapper.querySelector('button').id);
        select.setAttribute('data-track-selection', 'false');
        select.refreshTrackSelection();
        expect(wrapper.querySelector('button')).toBeNull();
        expect(select.classList.contains('emby-select-track-hidden')).toBe(false);
        expect(Object.hasOwn(select, 'value')).toBe(false);
        expect(wrapper.querySelector('label').htmlFor).toBe(select.id);
    });

    test('renders both lines as text and mirrors programmatic selection and rerenders', async () => {
        const { select, button } = createSelect();
        expect(button.querySelector('.trackSelectionPrimary').textContent).toBe('Čeština - SUBRIP');
        expect(button.querySelector('.trackSelectionSecondary').textContent).toBe('Original <title>');
        expect(button.querySelector('title')).toBeNull();
        select.setLabel('Titulky');
        select.refreshTrackSelection();
        expect(button.getAttribute('aria-label')).toBe('Titulky: Čeština - SUBRIP: Original <title>');
        select.value = '1';
        expect(button.querySelector('.trackSelectionSecondary').textContent).toBe('English SDH');
        select.selectedIndex = 0;
        expect(button.querySelector('.trackSelectionPrimary').textContent).toBe('Čeština - SUBRIP');
        select.innerHTML = '<option value="9">Vypnuto</option>';
        await flushMutations();
        expect(button.querySelector('.trackSelectionPrimary').textContent).toBe('Vypnuto');
        expect(button.querySelector('.trackSelectionSecondary').hidden).toBe(true);
    });

    test('opens an anchored desktop listbox with both labels and commits one change', () => {
        const { select, wrapper, button } = createSelect();
        const change = vi.fn();
        select.addEventListener('change', change);
        button.click();
        const listbox = wrapper.querySelector('[role="listbox"]');
        expect(listbox).not.toBeNull();
        expect(mocks.show).not.toHaveBeenCalled();
        expect(button.getAttribute('aria-haspopup')).toBe('listbox');
        expect(button.getAttribute('aria-expanded')).toBe('true');
        const options = listbox.querySelectorAll('[role="option"]');
        expect(options).toHaveLength(2);
        expect(options[0].textContent).toContain('\u010Ce\u0161tina - SUBRIP');
        expect(options[0].textContent).toContain('Original <title>');
        expect(options[0].querySelector('title')).toBeNull();
        expect(options[0].getAttribute('aria-selected')).toBe('true');
        expect(options[1].getAttribute('aria-selected')).toBe('false');
        options[1].click();
        expect(select.value).toBe('1');
        expect(change).toHaveBeenCalledTimes(1);
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(button);
    });

    test('navigates desktop choices with arrows and Home/End before committing with Enter', () => {
        const { select, wrapper, button } = createSelect();
        const change = vi.fn();
        select.addEventListener('change', change);
        button.click();
        const options = wrapper.querySelectorAll('[role="option"]');
        expect(document.activeElement).toBe(options[0]);
        const press = key => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        press('ArrowDown');
        expect(document.activeElement).toBe(options[1]);
        expect(select.value).toBe('0');
        press('ArrowUp');
        expect(document.activeElement).toBe(options[0]);
        press('End');
        expect(document.activeElement).toBe(options[1]);
        press('Home');
        expect(document.activeElement).toBe(options[0]);
        press('ArrowDown');
        press('Enter');
        expect(select.value).toBe('1');
        expect(change).toHaveBeenCalledTimes(1);
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(document.activeElement).toBe(button);
    });

    test('dismisses desktop choices with Escape or an outside pointer without changing the value', () => {
        const { select, wrapper, button } = createSelect();
        const change = vi.fn();
        select.addEventListener('change', change);
        button.click();
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(document.activeElement).toBe(button);
        button.click();
        const outside = document.createElement('button');
        document.body.appendChild(outside);
        outside.focus();
        outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        outside.click();
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(outside);
        expect(select.value).toBe('0');
        expect(change).not.toHaveBeenCalled();
    });

    test('closes an open desktop dropdown when disabled and supports opening after reenabled', async () => {
        const { select, wrapper, button } = createSelect();
        button.click();
        expect(wrapper.querySelector('[role="listbox"]')).not.toBeNull();
        select.disabled = true;
        await flushMutations();
        expect(button.disabled).toBe(true);
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(button.getAttribute('aria-expanded')).toBe('false');
        button.click();
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        select.disabled = false;
        await flushMutations();
        button.click();
        expect(wrapper.querySelector('[role="listbox"]')).not.toBeNull();
        expect(mocks.show).not.toHaveBeenCalled();
    });

    test('retains keyboard focus when a programmatic change or option rerender closes the dropdown', async () => {
        const { select, wrapper, button } = createSelect();
        button.click();
        select.value = '1';
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(document.activeElement).toBe(button);
        expect(button.querySelector('.trackSelectionSecondary').textContent).toBe('English SDH');
        button.click();
        select.innerHTML = '<option value="9">Off</option>';
        await flushMutations();
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(document.activeElement).toBe(button);
        expect(button.querySelector('.trackSelectionPrimary').textContent).toBe('Off');
    });

    test('closes on Tab without cancelling normal navigation from the field', () => {
        const { select, wrapper, button } = createSelect();
        button.click();
        const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        document.activeElement.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(document.activeElement).toBe(button);
        expect(select.value).toBe('0');
    });

    test('uses the TV action sheet with both menu labels and propagates selection as one change', async () => {
        mocks.layout.tv = true;
        mocks.show.mockResolvedValue('1');
        const { select, button } = createSelect();
        const change = vi.fn();
        select.addEventListener('change', change);
        button.click();
        expect(mocks.show).toHaveBeenCalledWith(expect.objectContaining({
            dialogClass: 'trackSelectionActionSheet',
            positionTo: button,
            items: [
                { id: '0', name: 'Čeština - SUBRIP', secondaryText: 'Original <title>', selected: true },
                { id: '1', name: 'Angličtina - Sluchově postižení - SUBRIP', secondaryText: 'English SDH', selected: false }
            ]
        }));
        await flushMutations();
        expect(select.value).toBe('1');
        expect(change).toHaveBeenCalledTimes(1);
        await flushMutations();
        expect(button.getAttribute('aria-expanded')).toBe('false');
    });

    test('mirrors disabled state and accepts TV controller activation once', async () => {
        mocks.layout.tv = true;
        const { select, button } = createSelect();
        select.disabled = true;
        await flushMutations();
        expect(button.disabled).toBe(true);
        button.click();
        expect(mocks.show).not.toHaveBeenCalled();
        select.disabled = false;
        await flushMutations();
        button.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 195, cancelable: true }));
        button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
        expect(mocks.show).toHaveBeenCalledTimes(1);
        expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    test('cleans up its trigger on detach and recreates it on reattach', () => {
        const { select, wrapper } = createSelect();
        wrapper.querySelector('button').click();
        expect(wrapper.querySelector('[role="listbox"]')).not.toBeNull();
        select.detachedCallback();
        expect(wrapper.querySelector('[role="listbox"]')).toBeNull();
        expect(wrapper.querySelector('button')).toBeNull();
        expect(Object.hasOwn(select, 'selectedIndex')).toBe(false);
        select.attachedCallback();
        expect(wrapper.querySelectorAll('button')).toHaveLength(1);
        select.value = '1';
        expect(wrapper.querySelector('.trackSelectionSecondary').textContent).toBe('English SDH');
    });
});
