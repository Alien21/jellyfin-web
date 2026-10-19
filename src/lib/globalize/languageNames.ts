interface DisplayNamesSupport {
    supportedLocalesOf(locales: string[]): string[];
}

let loading = Promise.resolve();

async function loadLanguageNames(locale: string): Promise<void> {
    if (typeof Intl === 'undefined') {
        Object.defineProperty(globalThis, 'Intl', { value: {}, configurable: true, writable: true });
    }
    const names = (Intl as typeof Intl & { DisplayNames?: DisplayNamesSupport }).DisplayNames;
    try {
        if (names?.supportedLocalesOf([locale]).length) return;
    } catch {
        // Older engines can reject otherwise valid locale tags before polyfills are loaded.
    }
    await import('@formatjs/intl-getcanonicallocales/polyfill.js');
    await import('@formatjs/intl-locale/polyfill.js');
    const { shouldPolyfill } = await import('@formatjs/intl-displaynames/should-polyfill.js');
    const canonicalize = (Intl as typeof Intl & { getCanonicalLocales(value: string): string[] }).getCanonicalLocales;
    const missing = shouldPolyfill(canonicalize(locale)[0]);
    if (!missing) return;
    await import('@formatjs/intl-displaynames/polyfill-force.js');
    const dataLocale = canonicalize(typeof missing === 'string' ? missing : locale)[0];
    await import(/* webpackChunkName: "intl-displaynames-[request]" */ `@formatjs/intl-displaynames/locale-data/${dataLocale}.js`);
}

/** Load profile-language names before rendering the interface and its track menus. */
export function ensureLanguageNames(locale: string): Promise<void> {
    const next = loading.then(() => loadLanguageNames(locale.replace(/_/g, '-')));
    // A failed download must not prevent a later profile language from loading.
    loading = next.catch(() => undefined);
    return next;
}
