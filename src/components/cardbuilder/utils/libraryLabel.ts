import escapeHtml from 'escape-html';

import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';

/** Build a library label using the library name returned with the item. */
export const getLibraryLabelHtml = (item: ItemDto, options: CardOptions): string => {
    if (!options.showLibraryName || !item.LibraryName?.trim()) {
        return '';
    }

    const libraryName = escapeHtml(item.LibraryName);
    return `<div class="cardLibraryName" title="${libraryName}">${libraryName}</div>`;
};
