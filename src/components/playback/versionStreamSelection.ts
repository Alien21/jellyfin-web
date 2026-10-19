import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';

import type { PlayOptions } from 'types/playOptions';

interface StreamSelection {
    audioStreamIndex?: number;
    subtitleStreamIndex?: number;
}

// Media files use both ISO 639-1 and the bibliographic/terminological ISO 639-2 codes.
const languageAliases: Record<string, string> = {
    ces: 'cs', cze: 'cs', eng: 'en', slk: 'sk', slo: 'sk', deu: 'de', ger: 'de',
    fra: 'fr', fre: 'fr', spa: 'es', ita: 'it', pol: 'pl', por: 'pt', rus: 'ru',
    ukr: 'uk', nld: 'nl', dut: 'nl', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi',
    hun: 'hu', ron: 'ro', rum: 'ro', ell: 'el', gre: 'el', tur: 'tr', ara: 'ar',
    heb: 'he', iw: 'he', jpn: 'ja', kor: 'ko', zho: 'zh', chi: 'zh'
};

function getLanguage(stream: MediaStream): string | undefined {
    const language = stream.Language?.trim().toLowerCase().split(/[-_]/)[0];
    if (!language || ['und', 'unknown', 'undetermined', 'mul', 'zxx'].includes(language)) return undefined;
    return languageAliases[language] || language;
}

function getIndex(value: unknown): number | undefined {
    if (value == null || (typeof value === 'string' && !value.trim())) return undefined;
    const index = Number(value);
    return Number.isInteger(index) ? index : undefined;
}

function getTitle(stream: MediaStream): string {
    return [stream.Title, stream.DisplayTitle].filter(Boolean).join(' ').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isHearingImpaired(stream: MediaStream): boolean {
    return Boolean(stream.IsHearingImpaired)
        || /\b(sdh|hi|cc|hearing[ -]impaired|closed[ -]captions?|neslysici)\b/.test(getTitle(stream));
}

function getAudioRole(stream: MediaStream): string {
    const title = getTitle(stream);
    const commentary = /\b(commentary|komentar|komentarem)\b/.test(title);
    const description = /\b(ad|audio[ -]?description|descriptive|described|visually[ -]impaired|audiopopis|zvukovy popis)\b/.test(title);
    return `${commentary}:${description}:${isHearingImpaired(stream)}`;
}

function isForced(stream: MediaStream): boolean {
    return Boolean(stream.IsForced) || /\b(forced|vynucene)\b/.test(getTitle(stream));
}

function hasSameRole(previous: MediaStream, candidate: MediaStream): boolean {
    if (previous.Type === 'Audio') return getAudioRole(previous) === getAudioRole(candidate);
    return isForced(previous) === isForced(candidate)
        && isHearingImpaired(previous) === isHearingImpaired(candidate);
}

function getMatchScore(previous: MediaStream, candidate: MediaStream, defaultIndex: number | undefined): number {
    let score = candidate.Index === defaultIndex ? 1 : 0;
    if (previous.Title && previous.Title === candidate.Title) score += 8;
    if (previous.Channels != null && previous.Channels === candidate.Channels) score += 4;
    if (previous.Codec && previous.Codec.toLowerCase() === candidate.Codec?.toLowerCase()) score += 2;
    return score;
}

function matchStream(
    previousSource: MediaSourceInfo | undefined,
    selectedSource: MediaSourceInfo,
    type: 'Audio' | 'Subtitle',
    previousIndex: number | undefined,
    defaultIndex: number | undefined
): number | undefined {
    if (previousIndex == null) return defaultIndex;
    const previous = previousSource?.MediaStreams?.find(stream => stream.Type === type && stream.Index === previousIndex);
    const language = previous && getLanguage(previous);
    if (!previous || !language) return defaultIndex;

    const matches = selectedSource.MediaStreams?.filter(stream => stream.Type === type
        && stream.Index != null && stream.Index >= 0
        && getLanguage(stream) === language && hasSameRole(previous, stream)) || [];
    matches.sort((a, b) => getMatchScore(previous, b, defaultIndex) - getMatchScore(previous, a, defaultIndex));
    return matches[0]?.Index ?? defaultIndex;
}

/** Carry language and track intent between files without reusing their numerical stream indices. */
export function getVersionStreamSelection(
    previousSource: MediaSourceInfo | undefined,
    selectedSource: MediaSourceInfo,
    options: PlayOptions
): StreamSelection {
    const previousAudioIndex = getIndex(options.audioStreamIndex) ?? previousSource?.DefaultAudioStreamIndex ?? undefined;
    const previousSubtitleIndex = getIndex(options.subtitleStreamIndex) ?? previousSource?.DefaultSubtitleStreamIndex ?? undefined;
    const defaultAudioIndex = selectedSource.DefaultAudioStreamIndex ?? undefined;
    // A null subtitle default is displayed as Off in the detail; make that choice explicit for playback.
    const defaultSubtitleIndex = selectedSource.DefaultSubtitleStreamIndex ?? -1;

    return {
        audioStreamIndex: matchStream(previousSource, selectedSource, 'Audio', previousAudioIndex, defaultAudioIndex),
        subtitleStreamIndex: previousSubtitleIndex === -1 || (previousSource != null
            && options.subtitleStreamIndex == null && previousSource.DefaultSubtitleStreamIndex === null) ?
            -1 :
            matchStream(previousSource, selectedSource, 'Subtitle', previousSubtitleIndex, defaultSubtitleIndex)
    };
}
