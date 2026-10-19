import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client';

/** Format a version name for display without changing the source itself. */
export function getMediaSourceDisplayName(mediaSource: MediaSourceInfo | null | undefined): string {
    return (mediaSource?.Name || '').replace(/[[\]]/g, ' ').trim();
}

/**
 * Checks if the media source is an HLS stream.
 * @param mediaSource The media source.
 * @returns _true_ if the media source is an HLS stream, _false_ otherwise.
 */
export function isHls(mediaSource: MediaSourceInfo | null | undefined): boolean {
    return mediaSource?.TranscodingSubProtocol?.toUpperCase() === 'HLS'
        || mediaSource?.Container?.toUpperCase() === 'HLS';
}
