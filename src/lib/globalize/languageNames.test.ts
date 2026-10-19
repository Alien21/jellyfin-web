import { afterEach, describe, expect, test, vi } from 'vitest';

import { ensureLanguageNames } from './languageNames';

interface LanguageNames {
    of(code: string): string | undefined;
}
type NamesConstructor = new (locales: string[], options: { type: 'language' }) => LanguageNames;
function getNames(): NamesConstructor {
    return (Intl as typeof Intl & { DisplayNames: NamesConstructor }).DisplayNames;
}

afterEach(() => vi.unstubAllGlobals());

describe('profile language names on older browsers', () => {
    test('preserves native language-name support on current browsers', async () => {
        const native = getNames();
        await ensureLanguageNames('cs');
        expect(getNames()).toBe(native);
    });

    test('loads the prerequisites and localized data without native Intl and retains switched profile languages', async () => {
        const NativeNames = getNames();
        const french = new NativeNames(['fr-CA'], { type: 'language' }).of('en');
        const portuguese = new NativeNames(['pt-BR'], { type: 'language' }).of('en');
        vi.stubGlobal('Intl', undefined);
        await ensureLanguageNames('cs');
        expect(new (getNames())(['cs'], { type: 'language' }).of('en')).toBe('angličtina');
        expect(new (getNames())(['cs'], { type: 'language' }).of('cs')).toBe('čeština');
        await Promise.all([ensureLanguageNames('fr_CA'), ensureLanguageNames('pt_BR')]);
        expect(new (getNames())(['fr-CA'], { type: 'language' }).of('en')).toBe(french);
        expect(new (getNames())(['pt-BR'], { type: 'language' }).of('en')).toBe(portuguese);
        expect(new (getNames())(['cs'], { type: 'language' }).of('en')).toBe('angličtina');
    });
});
