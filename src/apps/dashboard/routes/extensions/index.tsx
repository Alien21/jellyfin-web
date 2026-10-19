import type { ServerConfiguration } from '@jellyfin/sdk/lib/generated-client/models/server-configuration';
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import React from 'react';
import { type ActionFunctionArgs, Form, useActionData, useNavigation } from 'react-router-dom';

import Loading from 'components/loading/LoadingComponent';
import Page from 'components/Page';
import { useConfiguration } from 'hooks/useConfiguration';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { ActionData } from 'types/actionData';
import { setGlobalSearchEnabled, setLibrarySourceDetailsEnabled, setPlaybackVersionSelectionEnabled } from 'utils/extensions';
import { queryClient } from 'utils/query/queryClient';

type ExtensionsConfiguration = ServerConfiguration & {
    EnableGlobalSearch?: boolean;
    EnableLibrarySourceDetails?: boolean;
    EnablePlaybackVersionSelection?: boolean;
};

export const action = async ({ request }: ActionFunctionArgs) => {
    const api = ServerConnections.getApi();
    if (!api) throw new Error('No Api instance available');

    const { data } = await getSystemApi(api).getConfiguration();
    const config = data as ExtensionsConfiguration;
    const formData = await request.formData();
    const globalSearchEnabled = formData.get('EnableGlobalSearch')?.toString() === 'on';
    config.EnableGlobalSearch = globalSearchEnabled;
    const enabled = formData.get('EnableLibrarySourceDetails')?.toString() === 'on';
    config.EnableLibrarySourceDetails = enabled;
    const playbackVersionSelectionEnabled = formData.get('EnablePlaybackVersionSelection')?.toString() === 'on';
    config.EnablePlaybackVersionSelection = playbackVersionSelectionEnabled;

    await getSystemApi(api).updateConfiguration({ serverConfiguration: config });
    setGlobalSearchEnabled(globalSearchEnabled);
    setLibrarySourceDetailsEnabled(enabled);
    setPlaybackVersionSelectionEnabled(playbackVersionSelectionEnabled);
    void queryClient.invalidateQueries();

    return { isSaved: true };
};

export const Component = () => {
    const { data, isPending, isError } = useConfiguration();
    const config = data as ExtensionsConfiguration | undefined;
    const navigation = useNavigation();
    const actionData = useActionData() as ActionData | undefined;
    const isSubmitting = navigation.state === 'submitting';

    if (isPending) return <Loading />;

    return (
        <Page
            id='dashboardExtensionsPage'
            title={globalize.translate('Extensions')}
            className='type-interior mainAnimatedPage'
        >
            <Box className='content-primary'>
                {isError ? (
                    <Alert severity='error'>{globalize.translate('SettingsPageLoadError')}</Alert>
                ) : (
                    <Form method='POST'>
                        <Stack spacing={3}>
                            <Typography variant='h1'>{globalize.translate('Extensions')}</Typography>

                            {!isSubmitting && actionData?.isSaved && (
                                <Alert severity='success'>
                                    {globalize.translate('SettingsSaved')}
                                </Alert>
                            )}

                            <FormControl disabled={isSubmitting}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            name='EnableLibrarySourceDetails'
                                            defaultChecked={config?.EnableLibrarySourceDetails ?? false}
                                            slotProps={{
                                                input: { 'aria-describedby': 'librarySourceDetailsHelp' }
                                            }}
                                        />
                                    }
                                    label={globalize.translate('EnableLibrarySourceDetails')}
                                />
                                <FormHelperText id='librarySourceDetailsHelp'>
                                    {globalize.translate('EnableLibrarySourceDetailsHelp')}
                                </FormHelperText>
                            </FormControl>

                            <FormControl disabled={isSubmitting}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            name='EnablePlaybackVersionSelection'
                                            defaultChecked={config?.EnablePlaybackVersionSelection ?? false}
                                            slotProps={{
                                                input: { 'aria-describedby': 'playbackVersionSelectionHelp' }
                                            }}
                                        />
                                    }
                                    label={globalize.translate('EnablePlaybackVersionSelection')}
                                />
                                <FormHelperText id='playbackVersionSelectionHelp'>
                                    {globalize.translate('EnablePlaybackVersionSelectionHelp')}
                                </FormHelperText>
                            </FormControl>

                            <FormControl disabled={isSubmitting}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            name='EnableGlobalSearch'
                                            defaultChecked={config?.EnableGlobalSearch ?? false}
                                            slotProps={{
                                                input: { 'aria-describedby': 'globalSearchHelp' }
                                            }}
                                        />
                                    }
                                    label={globalize.translate('EnableGlobalSearch')}
                                />
                                <FormHelperText id='globalSearchHelp'>
                                    {globalize.translate('EnableGlobalSearchHelp')}
                                </FormHelperText>
                            </FormControl>

                            <Button type='submit' size='large' disabled={isSubmitting}>
                                {globalize.translate('Save')}
                            </Button>
                        </Stack>
                    </Form>
                )}
            </Box>
        </Page>
    );
};

Component.displayName = 'ExtensionsPage';
