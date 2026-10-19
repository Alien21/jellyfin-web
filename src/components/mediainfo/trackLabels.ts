import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';

import globalize from 'lib/globalize';

interface TrackLabel {
    name: string;
    secondaryText?: string;
}

// Intl.DisplayNames is optional on the older TV browsers supported by the web client.
interface LanguageNames {
    of(language: string): string | undefined;
}

type DisplayNamesConstructor = new (locales: string[], options: { type: 'language'; fallback: 'code' }) => LanguageNames;

const languageAliases: Record<string, string> = {
    ces: 'cs', cze: 'cs', eng: 'en', slk: 'sk', slo: 'sk', deu: 'de', ger: 'de',
    fra: 'fr', fre: 'fr', spa: 'es', ita: 'it', pol: 'pl', por: 'pt', rus: 'ru',
    ukr: 'uk', nld: 'nl', dut: 'nl', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi',
    hun: 'hu', ron: 'ro', rum: 'ro', ell: 'el', gre: 'el', tur: 'tr', ara: 'ar',
    heb: 'he', iw: 'he', jpn: 'ja', kor: 'ko', zho: 'zh', chi: 'zh'
};

const subtitleCodecs = new Map<string, string>([
    ['subrip', 'SRT'], ['srt', 'SRT'], ['ass', 'ASS'], ['ssa', 'SSA'],
    ['hdmv_pgs_subtitle', 'PGS'], ['pgssub', 'PGS'], ['pgs', 'PGS'],
    ['dvd_subtitle', 'VobSub'], ['dvdsub', 'VobSub'], ['vobsub', 'VobSub'],
    ['webvtt', 'VTT'], ['vtt', 'VTT'], ['mov_text', 'TX3G'], ['dvb_subtitle', 'DVB']
]);

const audioCodecs = new Map<string, string>([
    ['ac3', 'Dolby Digital'], ['eac3', 'Dolby Digital Plus'], ['truehd', 'Dolby TrueHD'],
    ['dca', 'DTS'], ['dts', 'DTS'], ['aac', 'AAC'], ['aac_latm', 'AAC'], ['mp3', 'MP3'],
    ['flac', 'FLAC'], ['alac', 'ALAC'], ['opus', 'Opus'], ['vorbis', 'Vorbis']
]);

function getLanguageName(stream: MediaStream): string {
    const parts = stream.Language?.trim().replace(/_/g, '-').split('-') || [];
    const base = parts?.[0]?.toLowerCase();
    if (!base || ['und', 'unknown', 'undetermined', 'mul', 'zxx'].includes(base)) {
        return globalize.translate('Unknown');
    }

    parts[0] = languageAliases[base] || base;
    const language = parts.join('-');
    const locale = globalize.getCurrentLocale() || 'en-us';
    const DisplayNames = (Intl as typeof Intl & { DisplayNames?: DisplayNamesConstructor }).DisplayNames;
    try {
        const name = DisplayNames && new DisplayNames([locale], { type: 'language', fallback: 'code' }).of(language);
        if (name) return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
    } catch {
        // Malformed language tags must not prevent the track menu from opening.
    }

    return language;
}

function getChannelLabel(stream: MediaStream): string | undefined {
    const layout = stream.ChannelLayout?.trim();
    if (layout) {
        // The speaker-position suffix is useful to encoders, but not to a track chooser.
        return layout.split('(')[0].trim();
    }

    switch (stream.Channels) {
        case 1: return 'Mono';
        case 2: return 'Stereo';
        case 6: return '5.1';
        case 8: return '7.1';
        default: return stream.Channels ? `${stream.Channels} ch` : undefined;
    }
}

function getAudioCodecName(stream: MediaStream): string {
    const codec = stream.Codec?.trim().toLowerCase() || '';
    const profile = stream.Profile?.trim() || '';
    if ((codec === 'dts' || codec === 'dca') && profile && !/^dts$/i.test(profile)) return profile;
    if ((codec === 'aac' || codec === 'aac_latm') && profile && !/^lc$/i.test(profile)) {
        return /aac/i.test(profile) ? profile : 'AAC ' + profile;
    }
    return audioCodecs.get(codec) || codec.toUpperCase() || profile;
}

function getAudioFormat(stream: MediaStream): string {
    let format = getAudioCodecName(stream);
    const profile = stream.Profile || '';
    let spatial;
    if (stream.AudioSpatialFormat === 'DolbyAtmos' || /\b(atmos|joc)\b/i.test(profile)) {
        spatial = 'Atmos';
    } else if (stream.AudioSpatialFormat === 'DTSX' || /dts[ -]?:[ -]?x/i.test(profile)) {
        spatial = 'DTS:X';
    }

    if (spatial && !format.toLowerCase().includes(spatial.toLowerCase())) {
        format = [format, spatial].filter(Boolean).join(' ');
    }
    return [format, getChannelLabel(stream)].filter(Boolean).join(' ');
}

function getSubtitleName(stream: MediaStream): string {
    const parts = [getLanguageName(stream)];
    if (stream.IsHearingImpaired) parts.push(globalize.translate('TrackHearingImpaired'));
    if (stream.IsForced) parts.push(globalize.translate('MediaInfoForced'));
    const codec = stream.Codec?.trim().toLowerCase();
    if (codec) parts.push('(' + (subtitleCodecs.get(codec) || codec.toUpperCase()) + ')');
    return parts.join(' ');
}

/** Build labels from track metadata in the signed-in user's interface language. */
export function getTrackLabel(stream: MediaStream, type: 'Audio' | 'Subtitle'): TrackLabel {
    if (stream.Index === -1) return { name: stream.DisplayTitle || globalize.translate('Off') };

    let name;
    const attributes = [];
    if (type === 'Subtitle') {
        name = getSubtitleName(stream);
    } else {
        const format = getAudioFormat(stream);
        name = getLanguageName(stream) + (format ? ' (' + format + ')' : '');
        if (stream.IsOriginal) attributes.push(globalize.translate('MediaInfoOriginal'));
    }
    if (stream.IsExternal) attributes.push(globalize.translate('MediaInfoExternal'));
    if (stream.IsDefault) attributes.push(globalize.translate('MediaInfoDefault'));

    return { name: [name, ...attributes].join(' - '), secondaryText: stream.Title?.trim() || undefined };
}
