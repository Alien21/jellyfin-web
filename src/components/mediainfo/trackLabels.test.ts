import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { getTrackLabel } from './trackLabels';

const mocks = vi.hoisted(() => ({ locale: 'cs' }));

const translations: Record<string, Record<string, string>> = {
    cs: {
        Unknown: 'Neznámý',
        Off: 'Vypnuto',
        TrackHearingImpaired: 'Sluchově postižení',
        MediaInfoDefault: 'Výchozí',
        MediaInfoForced: 'Vynucené',
        MediaInfoExternal: 'Externí',
        MediaInfoOriginal: 'Originál'
    },
    'en-us': {
        Unknown: 'Unknown',
        Off: 'Off',
        TrackHearingImpaired: 'Hearing impaired',
        MediaInfoDefault: 'Default',
        MediaInfoForced: 'Forced',
        MediaInfoExternal: 'External',
        MediaInfoOriginal: 'Original'
    }
};

vi.mock('lib/globalize', () => ({
    default: {
        getCurrentLocale: () => mocks.locale,
        translate: (key: string) => translations[mocks.locale]?.[key] || key
    }
}));

beforeEach(() => {
    mocks.locale = 'cs';
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function subtitle(overrides: Partial<MediaStream> = {}): MediaStream {
    return { Type: 'Subtitle', Index: 3, Language: 'cze', Codec: 'subrip', ...overrides };
}

function audio(overrides: Partial<MediaStream> = {}): MediaStream {
    return { Type: 'Audio', Index: 1, Language: 'eng', Codec: 'ac3', Channels: 6, ...overrides };
}

describe('subtitle track labels', () => {
    test('places the localized language, ordered flags, format and external marker on the first line', () => {
        expect(getTrackLabel(subtitle({
            Title: '  Czech Forced  ',
            IsHearingImpaired: true,
            IsDefault: true,
            IsForced: true,
            IsExternal: true
        }), 'Subtitle')).toEqual({
            name: 'Čeština Sluchově postižení Vynucené (SRT) - Externí - Výchozí',
            secondaryText: 'Czech Forced'
        });
    });

    test.each([
        ['slo', 'Slovak Forced', true, 'Slovenština Vynucené (SRT)'],
        ['cze', 'Czech Forced', true, 'Čeština Vynucené (SRT)'],
        ['slk', 'Slovak Full', false, 'Slovenština (SRT)'],
        ['ces', 'Czech Full', false, 'Čeština (SRT)'],
        ['spa', 'Latin American', false, 'Španělština (SRT)']
    ])('keeps the original %s track title on its own line', (language, title, forced, name) => {
        expect(getTrackLabel(subtitle({ Language: language, Title: title, IsForced: forced }), 'Subtitle'))
            .toEqual({ name, secondaryText: title });
    });

    test('preserves a regional language variant while translating it for the profile', () => {
        expect(getTrackLabel(subtitle({ Language: 'fra_CA', Title: 'Canadian' }), 'Subtitle'))
            .toEqual({ name: 'Francouzština (Kanada) (SRT)', secondaryText: 'Canadian' });
    });

    test.each([
        ['srt', 'SRT'],
        ['ASS', 'ASS'],
        ['ssa', 'SSA'],
        ['hdmv_pgs_subtitle', 'PGS'],
        ['dvd_subtitle', 'VobSub']
    ])('shows the recognizable subtitle format for %s', (codec, format) => {
        expect(getTrackLabel(subtitle({ Codec: codec }), 'Subtitle').name).toBe(`Čeština (${format})`);
    });

    test('uses the new profile language the next time a label is requested', () => {
        const stream = subtitle({ IsForced: true, IsDefault: true, IsExternal: true, Title: 'Czech Forced' });
        expect(getTrackLabel(stream, 'Subtitle').name).toBe('Čeština Vynucené (SRT) - Externí - Výchozí');

        mocks.locale = 'en-us';

        expect(getTrackLabel(stream, 'Subtitle')).toEqual({
            name: 'Czech Forced (SRT) - External - Default',
            secondaryText: 'Czech Forced'
        });
    });

    test('does not reinterpret text in the original title as structured flags', () => {
        expect(getTrackLabel(subtitle({ Title: 'Czech Forced SDH Full' }), 'Subtitle'))
            .toEqual({ name: 'Čeština (SRT)', secondaryText: 'Czech Forced SDH Full' });
    });

    test('places Default last even without Forced or External', () => {
        expect(getTrackLabel(subtitle({ IsDefault: true }), 'Subtitle').name).toBe('Čeština (SRT) - Výchozí');
    });

    test('retains the Off entry without a second line or format', () => {
        expect(getTrackLabel(subtitle({ Index: -1, DisplayTitle: 'Vypnuto', Title: 'Ignored' }), 'Subtitle'))
            .toEqual({ name: 'Vypnuto' });
    });
});

describe('audio track labels', () => {
    test('shows Dolby Atmos, channels and ordered flags separately from the raw title', () => {
        expect(getTrackLabel(audio({
            Codec: 'eac3',
            AudioSpatialFormat: 'DolbyAtmos',
            ChannelLayout: '7.1',
            Channels: 8,
            IsDefault: true,
            IsOriginal: true,
            Title: '  English Original  '
        }), 'Audio')).toEqual({
            name: 'Angličtina (Dolby Digital Plus Atmos 7.1) - Originál - Výchozí',
            secondaryText: 'English Original'
        });
    });

    test.each([
        ['ac3', 'Dolby Digital'],
        ['eac3', 'Dolby Digital Plus'],
        ['truehd', 'Dolby TrueHD'],
        ['aac', 'AAC']
    ])('shows a recognizable audio format for %s', (codec, format) => {
        expect(getTrackLabel(audio({ Codec: codec }), 'Audio').name).toBe(`Angličtina (${format} 5.1)`);
    });

    test('keeps the DTS-HD profile without duplicating the codec family', () => {
        expect(getTrackLabel(audio({ Codec: 'dts', Profile: 'DTS-HD MA', Channels: 8 }), 'Audio').name)
            .toBe('Angličtina (DTS-HD MA 7.1)');
    });

    test('includes structured DTS:X spatial audio', () => {
        expect(getTrackLabel(audio({ Codec: 'dca', Profile: 'DTS-HD MA', AudioSpatialFormat: 'DTSX' }), 'Audio').name)
            .toBe('Angličtina (DTS-HD MA DTS:X 5.1)');
    });

    test('removes encoder speaker-position suffixes from channel layouts', () => {
        expect(getTrackLabel(audio({ Language: 'cs', ChannelLayout: '5.1(side)' }), 'Audio').name)
            .toBe('Čeština (Dolby Digital 5.1)');
    });

    test('translates audio flags according to the profile and places Default last', () => {
        mocks.locale = 'en-us';
        expect(getTrackLabel(audio({ Language: 'ces', IsDefault: true, IsOriginal: true, IsExternal: true }), 'Audio').name)
            .toBe('Czech (Dolby Digital 5.1) - Original - External - Default');
    });
});

describe('missing and unsupported track metadata', () => {
    test.each([undefined, null, '', 'und', 'unknown', 'mul', 'zxx'])('handles the missing or undefined language %s', language => {
        expect(getTrackLabel(subtitle({ Language: language }), 'Subtitle').name).toBe('Neznámý (SRT)');
    });

    test.each([undefined, null, '', '   '])('omits a second line when the original Title is %s', title => {
        const label = getTrackLabel(subtitle({ Title: title, DisplayTitle: 'Server-generated Czech - SUBRIP' }), 'Subtitle');
        expect(label).toEqual({ name: 'Čeština (SRT)', secondaryText: undefined });
    });

    test('uses the raw language code if DisplayNames has not initialized', () => {
        vi.stubGlobal('Intl', { DisplayNames: undefined });
        expect(getTrackLabel(subtitle({ LocalizedLanguage: 'Czech' }), 'Subtitle').name).toBe('cs (SRT)');
    });

    test('keeps malformed language metadata from preventing the menu from opening', () => {
        expect(() => getTrackLabel(subtitle({ Language: 'invalid language', LocalizedLanguage: 'Čeština' }), 'Subtitle'))
            .not.toThrow();
    });
});
