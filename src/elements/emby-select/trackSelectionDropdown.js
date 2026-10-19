export function closeTrackSelectionDropdown(select, restoreFocus = false) {
    select._trackSelectionDropdown?.close(restoreFocus);
}

export function showTrackSelectionDropdown(select, button, label, onSelect) {
    const dropdown = document.createElement('div');
    dropdown.id = button.id + '-options';
    dropdown.className = 'trackSelectionDropdown';
    dropdown.style.fontSize = window.getComputedStyle(button).fontSize;
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', label?.textContent || label?.innerText || '');
    const choices = [];

    function choose(option) {
        if (option.disabled || option.parentElement?.disabled) return;
        closeTrackSelectionDropdown(select, true);
        onSelect(option.value);
    }

    for (const option of select.options) {
        const row = document.createElement('div');
        row.className = 'trackSelectionOption';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(option.selected));
        row.tabIndex = -1;
        const primary = document.createElement('span');
        primary.className = 'trackSelectionPrimary';
        primary.textContent = option.textContent;
        row.appendChild(primary);
        if (option.dataset.secondaryText) {
            const secondary = document.createElement('span');
            secondary.className = 'trackSelectionSecondary';
            secondary.textContent = option.dataset.secondaryText;
            row.appendChild(secondary);
        }
        if (option.disabled || option.parentElement?.disabled) {
            row.setAttribute('aria-disabled', 'true');
        } else {
            row.addEventListener('click', () => choose(option));
            choices.push({ row, option });
        }
        dropdown.appendChild(row);
    }
    if (!choices.length) return;

    const container = button.parentElement;
    container.appendChild(dropdown);
    container.classList.add('trackSelectionExpanded');
    button.setAttribute('aria-controls', dropdown.id);
    button.setAttribute('aria-expanded', 'true');
    select._trackSelectionOpen = true;

    function focusChoice(index) {
        const row = choices[Math.max(0, Math.min(index, choices.length - 1))].row;
        row.focus({ preventScroll: true });
        row.scrollIntoView?.({ block: 'nearest' });
    }

    function positionDropdown() {
        const rect = button.getBoundingClientRect();
        const parent = container.getBoundingClientRect();
        const availableBelow = window.innerHeight - rect.bottom - 8;
        const availableAbove = rect.top - 8;
        const above = availableBelow < Math.min(180, dropdown.scrollHeight) && availableAbove > availableBelow;
        const available = above ? availableAbove : availableBelow;
        dropdown.style.maxHeight = Math.max(40, Math.min(360, available)) + 'px';
        dropdown.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
        dropdown.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - dropdown.offsetWidth - 8)) - parent.left + container.scrollLeft + 'px';
        dropdown.style.top = (above ? rect.top - dropdown.offsetHeight : rect.bottom) - parent.top + container.scrollTop + 'px';
    }

    function onOutsideInteraction(event) {
        if (!dropdown.contains(event.target) && !button.contains(event.target)) {
            closeTrackSelectionDropdown(select);
        }
    }

    let search = '';
    let searchTime = 0;
    function onKeyDown(event) {
        const index = choices.findIndex(choice => choice.row === document.activeElement);
        switch (event.key) {
            case 'ArrowDown':
                focusChoice(index + 1);
                break;
            case 'ArrowUp':
                focusChoice(index - 1);
                break;
            case 'Home':
                focusChoice(0);
                break;
            case 'End':
                focusChoice(choices.length - 1);
                break;
            case 'Enter':
            case ' ':
                if (index >= 0) choose(choices[index].option);
                break;
            case 'Escape':
                closeTrackSelectionDropdown(select, true);
                break;
            case 'Tab':
                // Return to the field so normal Tab navigation continues from it.
                closeTrackSelectionDropdown(select, true);
                return;
            default: {
                if (event.key?.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return;
                const now = Date.now();
                search = (now - searchTime < 700 ? search : '') + event.key.toLocaleLowerCase();
                searchTime = now;
                const match = choices.findIndex(choice => choice.option.textContent.toLocaleLowerCase().startsWith(search));
                if (match >= 0) focusChoice(match);
            }
        }
        event.preventDefault();
        event.stopPropagation();
    }

    function onScroll(event) {
        if (!dropdown.contains(event.target)) positionDropdown();
    }

    select._trackSelectionDropdown = {
        containsFocus() { return dropdown.contains(document.activeElement); },
        close(restoreFocus) {
            document.removeEventListener('pointerdown', onOutsideInteraction, true);
            document.removeEventListener('mousedown', onOutsideInteraction, true);
            document.removeEventListener('touchstart', onOutsideInteraction, true);
            document.removeEventListener('focusin', onOutsideInteraction);
            window.removeEventListener('resize', positionDropdown);
            window.removeEventListener('scroll', onScroll, true);
            dropdown.remove();
            container.classList.remove('trackSelectionExpanded');
            button.setAttribute('aria-expanded', 'false');
            button.removeAttribute('aria-controls');
            select._trackSelectionOpen = false;
            select._trackSelectionDropdown = null;
            if (restoreFocus && button.isConnected && !button.disabled) button.focus();
        }
    };
    dropdown.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onOutsideInteraction, true);
    document.addEventListener('mousedown', onOutsideInteraction, true);
    document.addEventListener('touchstart', onOutsideInteraction, true);
    document.addEventListener('focusin', onOutsideInteraction);
    window.addEventListener('resize', positionDropdown);
    window.addEventListener('scroll', onScroll, true);
    positionDropdown();
    const selected = choices.findIndex(choice => choice.option.selected);
    focusChoice(selected < 0 ? 0 : selected);
}
