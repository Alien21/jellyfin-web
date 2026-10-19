interface InlineStyleSnapshot {
    element: HTMLElement;
    property: string;
    value: string;
    priority: string;
}

let activeLocks = 0;
let restoreDocument: (() => void) | undefined;

function setCompensatedStyle(element: HTMLElement, property: string, value: number, snapshots: InlineStyleSnapshot[]) {
    snapshots.push({
        element,
        property,
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
    });
    element.style.setProperty(property, `${value}px`, 'important');
}

function applyDocumentScrollLock(): () => void {
    const body = document.body;
    const root = document.documentElement;
    const hadScrollLock = body.classList.contains('noScroll');
    const previousWidth = root.getBoundingClientRect().width;
    const previousLeft = root.clientLeft;
    const snapshots: InlineStyleSnapshot[] = [];

    body.classList.add('noScroll');

    // Measure rendered root geometry: clientWidth can grow despite a stable gutter.
    // Existing gutters and overlay scrollbars must not receive another offset.
    const widthIncrease = root.getBoundingClientRect().width - previousWidth;
    if (widthIncrease > 0) {
        // clientLeft includes a physical left scrollbar, independently of text direction.
        const scrollbarOnLeft = root.clientLeft < previousLeft;
        const inset = scrollbarOnLeft ? 'left' : 'right';
        const padding = scrollbarOnLeft ? 'padding-left' : 'padding-right';
        const bodyPadding = parseFloat(window.getComputedStyle(body).getPropertyValue(padding)) || 0;
        setCompensatedStyle(body, padding, bodyPadding + widthIncrease, snapshots);

        // These elements use viewport positioning, which body padding cannot preserve.
        for (const element of document.querySelectorAll<HTMLElement>('.mainAnimatedPage, .skinHeader')) {
            const computedStyle = window.getComputedStyle(element);
            if (computedStyle.position !== 'absolute' && computedStyle.position !== 'fixed') continue;

            const currentInset = parseFloat(computedStyle.getPropertyValue(inset));
            if (Number.isFinite(currentInset)) {
                setCompensatedStyle(element, inset, currentInset + widthIncrease, snapshots);
            }
        }
    }

    return () => {
        if (!hadScrollLock) body.classList.remove('noScroll');
        for (const { element, property, value, priority } of snapshots) {
            if (value) element.style.setProperty(property, value, priority);
            else element.style.removeProperty(property);
        }
    };
}

/** Lock document scrolling without shifting the page, until every caller releases its lock. */
export function lockDocumentScroll(): () => void {
    if (activeLocks === 0) restoreDocument = applyDocumentScrollLock();
    activeLocks++;
    let released = false;

    return () => {
        if (released) return;
        released = true;
        activeLocks--;
        if (activeLocks === 0) {
            const restore = restoreDocument;
            restoreDocument = undefined;
            restore?.();
        }
    };
}
