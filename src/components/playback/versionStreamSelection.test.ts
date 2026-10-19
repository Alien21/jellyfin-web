import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import { describe, expect, test } from 'vitest';

import type { PlayOptions } from 'types/playOptions';
import { getVersionStreamSelection } from './versionStreamSelection';

const audio = (Index: number, Language: string | undefined, extra: Partial<MediaStream> = {}): MediaStream => ({
    Type: 'Audio', Index, Language, ...extra
});
const subtitle = (Index: number, Language: string | undefined, extra: Partial<MediaStream> = {}): MediaStream => ({
    Type: 'Subtitle', Index, Language, ...extra
});
const source = (MediaStreams: MediaStream[], extra: Partial<MediaSourceInfo> = {}): MediaSourceInfo => ({
    MediaStreams, ...extra
});

describe('stream selections when changing playback version', () => {
    test('keeps chosen languages when stream indices are reordered', () => {
        const previous = source([audio(1, 'eng'), audio(2, 'cze'), subtitle(3, 'cze'), subtitle(4, 'eng')]);
        const selected = source([audio(1, 'eng'), audio(7, 'ces'), subtitle(3, 'eng'), subtitle(9, 'ces')], {
            DefaultAudioStreamIndex: 1, DefaultSubtitleStreamIndex: 3
        });

        expect(getVersionStreamSelection(previous, selected, {
            audioStreamIndex: 2, subtitleStreamIndex: 3
        })).toEqual({ audioStreamIndex: 7, subtitleStreamIndex: 9 });
    });

    test.each([
        ['cs', 'cze'], ['cze', 'ces'], ['CES', 'cs-CZ'], ['eng', 'en'],
        ['en-GB', 'eng'], ['deu', 'ger'], ['fre', 'fr'], ['slo', 'sk']
    ])('recognizes equivalent language codes %s and %s', (oldLanguage, newLanguage) => {
        expect(getVersionStreamSelection(
            source([audio(1, oldLanguage)]),
            source([audio(2, 'ita'), audio(5, newLanguage)], { DefaultAudioStreamIndex: 2 }),
            { audioStreamIndex: 1 }
        ).audioStreamIndex).toBe(5);
    });

    test('reads current defaults when no explicit detail selection was supplied', () => {
        const previous = source([audio(1, 'eng'), audio(2, 'cs'), subtitle(3, 'cs')], {
            DefaultAudioStreamIndex: 2, DefaultSubtitleStreamIndex: 3
        });
        const selected = source([audio(6, 'ces'), subtitle(8, 'cze')]);

        expect(getVersionStreamSelection(previous, selected, {})).toEqual({
            audioStreamIndex: 6, subtitleStreamIndex: 8
        });
    });

    test('accepts legacy select string indices without confusing them with target indices', () => {
        const options = { audioStreamIndex: '2', subtitleStreamIndex: '3' } as unknown as PlayOptions;

        expect(getVersionStreamSelection(
            source([audio(2, 'cs'), subtitle(3, 'en')]),
            source([audio(2, 'en'), audio(4, 'cs'), subtitle(3, 'cs'), subtitle(7, 'en')]),
            options
        )).toEqual({ audioStreamIndex: 4, subtitleStreamIndex: 7 });
    });

    test.each([-1, '-1'])('keeps subtitles off (%s) even without old source metadata', subtitleStreamIndex => {
        expect(getVersionStreamSelection(
            undefined,
            source([audio(5, 'en'), subtitle(6, 'cs')], {
                DefaultAudioStreamIndex: 5, DefaultSubtitleStreamIndex: 6
            }),
            { subtitleStreamIndex } as unknown as PlayOptions
        )).toEqual({ audioStreamIndex: 5, subtitleStreamIndex: -1 });
    });

    test('keeps an Off source default while changing versions', () => {
        expect(getVersionStreamSelection(
            source([], { DefaultSubtitleStreamIndex: null }),
            source([subtitle(7, 'cs')], { DefaultSubtitleStreamIndex: 7 }),
            {}
        ).subtitleStreamIndex).toBe(-1);
    });

    test.each([undefined, source([])])('uses selected-version defaults when current metadata is unavailable', previous => {
        expect(getVersionStreamSelection(
            previous,
            source([audio(5, 'en'), subtitle(7, 'cs')], {
                DefaultAudioStreamIndex: 5, DefaultSubtitleStreamIndex: 7
            }),
            { audioStreamIndex: 1, subtitleStreamIndex: 2 }
        )).toEqual({ audioStreamIndex: 5, subtitleStreamIndex: 7 });
    });

    test.each([undefined, '', 'und', 'mul'])('uses target defaults for a missing or ambiguous old language (%s)', Language => {
        expect(getVersionStreamSelection(
            source([audio(1, Language), subtitle(2, Language)]),
            source([audio(1, 'cs'), audio(4, 'en'), subtitle(2, 'cs'), subtitle(7, 'en')], {
                DefaultAudioStreamIndex: 4, DefaultSubtitleStreamIndex: 7
            }),
            { audioStreamIndex: 1, subtitleStreamIndex: 2 }
        )).toEqual({ audioStreamIndex: 4, subtitleStreamIndex: 7 });
    });

    test('falls back for audio independently of a successfully matched subtitle', () => {
        expect(getVersionStreamSelection(
            source([audio(1, 'cs'), subtitle(2, 'cs')]),
            source([audio(1, 'en'), subtitle(8, 'cze')], {
                DefaultAudioStreamIndex: 1, DefaultSubtitleStreamIndex: null
            }),
            { audioStreamIndex: 1, subtitleStreamIndex: 2 }
        )).toEqual({ audioStreamIndex: 1, subtitleStreamIndex: 8 });
    });

    test('does not substitute commentary or audio description for ordinary audio', () => {
        expect(getVersionStreamSelection(
            source([audio(1, 'cs', { Channels: 6, Codec: 'aac' })]),
            source([
                audio(2, 'cs', { Title: 'Director commentary', Channels: 6, Codec: 'aac' }),
                audio(3, 'cs', { Title: 'Audio description', Channels: 6, Codec: 'aac' }),
                audio(4, 'cs', { Channels: 2, Codec: 'ac3' })
            ], { DefaultAudioStreamIndex: 2 }),
            { audioStreamIndex: 1 }
        ).audioStreamIndex).toBe(4);
    });

    test('preserves descriptive audio intent instead of choosing ordinary same-language audio', () => {
        expect(getVersionStreamSelection(
            source([audio(1, 'cs', { Title: 'AD' })]),
            source([audio(2, 'cs'), audio(3, 'ces', { Title: 'Audio Description' })], {
                DefaultAudioStreamIndex: 2
            }),
            { audioStreamIndex: 1 }
        ).audioStreamIndex).toBe(3);
    });

    test('uses the selected default if only a different audio role is available', () => {
        expect(getVersionStreamSelection(
            source([audio(1, 'cs')]),
            source([audio(2, 'cs', { Title: 'Commentary' }), audio(5, 'en')], {
                DefaultAudioStreamIndex: 5
            }),
            { audioStreamIndex: 1 }
        ).audioStreamIndex).toBe(5);
    });

    test('uses channel count and codec only to choose between equivalent audio tracks', () => {
        expect(getVersionStreamSelection(
            source([audio(1, 'cs', { Channels: 6, Codec: 'AAC' })]),
            source([
                audio(2, 'cs', { Channels: 2, Codec: 'aac' }),
                audio(3, 'cs', { Channels: 6, Codec: 'ac3' }),
                audio(4, 'ces', { Channels: 6, Codec: 'aac' })
            ], { DefaultAudioStreamIndex: 2 }),
            { audioStreamIndex: 1 }
        ).audioStreamIndex).toBe(4);
    });

    test('preserves forced subtitle intent instead of choosing full subtitles', () => {
        expect(getVersionStreamSelection(
            source([subtitle(2, 'cs', { IsForced: true })]),
            source([subtitle(3, 'cs'), subtitle(7, 'ces', { IsForced: true })], {
                DefaultSubtitleStreamIndex: 3
            }),
            { subtitleStreamIndex: 2 }
        ).subtitleStreamIndex).toBe(7);
    });

    test.each([true, false])('does not substitute subtitles with a different forced flag (%s)', IsForced => {
        expect(getVersionStreamSelection(
            source([subtitle(2, 'cs', { IsForced })]),
            source([subtitle(3, 'cs', { IsForced: !IsForced })], { DefaultSubtitleStreamIndex: null }),
            { subtitleStreamIndex: 2 }
        ).subtitleStreamIndex).toBe(-1);
    });

    test('keeps SDH subtitles and recognizes the role in track titles', () => {
        expect(getVersionStreamSelection(
            source([subtitle(2, 'cs', { IsHearingImpaired: true })]),
            source([subtitle(3, 'cs'), subtitle(7, 'ces', { Title: 'Czech SDH' })], {
                DefaultSubtitleStreamIndex: 3
            }),
            { subtitleStreamIndex: 2 }
        ).subtitleStreamIndex).toBe(7);
    });

    test('does not replace ordinary subtitles with SDH when the target default is Off', () => {
        expect(getVersionStreamSelection(
            source([subtitle(2, 'cs')]),
            source([subtitle(7, 'cs', { IsHearingImpaired: true })], { DefaultSubtitleStreamIndex: null }),
            { subtitleStreamIndex: 2 }
        ).subtitleStreamIndex).toBe(-1);
    });

    test('does not mutate options or source stream ordering', () => {
        const options = Object.freeze({ audioStreamIndex: 1, subtitleStreamIndex: -1 });
        const previous = source([audio(1, 'cs', { Channels: 6 })]);
        const selected = source(Object.freeze([
            audio(2, 'cs', { Channels: 2 }), audio(3, 'ces', { Channels: 6 })
        ]) as unknown as MediaStream[]);

        expect(getVersionStreamSelection(previous, selected, options)).toEqual({
            audioStreamIndex: 3, subtitleStreamIndex: -1
        });
        expect(selected.MediaStreams?.map(stream => stream.Index)).toEqual([2, 3]);
        expect(options).toEqual({ audioStreamIndex: 1, subtitleStreamIndex: -1 });
    });
});
