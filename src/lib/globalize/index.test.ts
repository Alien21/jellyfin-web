import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import globalize from './index';

const mocks = vi.hoisted(() => ({
    ensureLanguageNames: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./languageNames', () => ({
    ensureLanguageNames: mocks.ensureLanguageNames
}));

vi.mock('scripts/settings/userSettings', () => ({
    currentSettings: {
        language: () => 'en-us',
        dateTimeLocale: () => 'en-us'
    }
}));

vi.mock('utils/dateFnsLocale', () => ({ updateLocale: vi.fn() }));
vi.mock('utils/events', () => ({ default: { on: vi.fn(), trigger: vi.fn() } }));

beforeEach(() => {
    mocks.ensureLanguageNames.mockReset().mockResolvedValue(undefined);
    globalize.defaultModule('startup');
});

afterEach(() => {
    vi.restoreAllMocks();
});

function loadStartupTranslations() {
    // Use the real core dictionary so a successful start also guarantees usable UI text.
    return globalize.loadStrings({
        name: 'startup',
        translations: [{ lang: 'en-us', path: 'en-us.json' }]
    });
}

describe('startup translations when optional language names are unavailable', () => {
    test('loads the interface dictionary while language-name loading never completes', async () => {
        mocks.ensureLanguageNames.mockReturnValue(new Promise<void>(() => undefined));

        await loadStartupTranslations();

        expect(globalize.translate('LabelVersion')).toBe('Version');
    });

    test('keeps interface translations available when language-name loading fails', async () => {
        const error = new Error('Language-name chunk could not be loaded');
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.ensureLanguageNames.mockRejectedValue(error);

        await loadStartupTranslations();

        expect(globalize.translate('LabelVersion')).toBe('Version');
        expect(log).toHaveBeenCalledWith('Language names failed to load', error);
    });

    test('handles a language-name failure that arrives after interface translations are ready', async () => {
        const error = new Error('Language-name download timed out after startup');
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let rejectLanguageNames!: (reason: Error) => void;
        mocks.ensureLanguageNames.mockReturnValue(new Promise<void>((_resolve, reject) => {
            rejectLanguageNames = reject;
        }));

        await loadStartupTranslations();
        expect(globalize.translate('LabelVersion')).toBe('Version');

        rejectLanguageNames(error);
        // Leave the rejection to the production handler; Vitest also reports unhandled rejections.
        await vi.waitFor(() => {
            expect(log).toHaveBeenCalledWith('Language names failed to load', error);
        });
        expect(globalize.translate('LabelVersion')).toBe('Version');
    });
});
