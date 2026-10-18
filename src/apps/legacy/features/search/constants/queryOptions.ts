import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';

export const QUERY_OPTIONS = {
    limit: 100,
    fields: [
        ItemFields.PrimaryImageAspectRatio,
        ItemFields.CanDelete,
        ItemFields.MediaSourceCount
    ],
    enableTotalRecordCount: false,
    imageTypeLimit: 1
};

// The fork's opt-in field is not available in the upstream SDK yet.
export const LIBRARY_INFO_FIELDS = [...QUERY_OPTIONS.fields, 'LibraryInfo' as ItemFields];
