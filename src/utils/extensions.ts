import { ServerConnections } from 'lib/jellyfin-apiclient';

/** Older servers retain the library-scoped search behavior. */
export function isGlobalSearchEnabled(serverId?: string | null): boolean {
    const apiClient = serverId ?
        ServerConnections.getApiClient(serverId) :
        ServerConnections.currentApiClient();
    return apiClient?.serverInfo()?.EnableGlobalSearch === true;
}

/** Apply a saved search scope setting to the active connection immediately. */
export function setGlobalSearchEnabled(enabled: boolean): void {
    const apiClient = ServerConnections.currentApiClient();
    if (!apiClient) return;

    const serverInfo = apiClient.serverInfo();
    if (serverInfo) {
        serverInfo.EnableGlobalSearch = enabled;
        apiClient.updateServerInfo(serverInfo, apiClient.serverAddress());
    }
}

/** The public server capability is absent on servers without this extension. */
export function isLibrarySourceDetailsEnabled(serverId?: string | null): boolean {
    const apiClient = serverId ?
        ServerConnections.getApiClient(serverId) :
        ServerConnections.currentApiClient();
    return apiClient?.serverInfo()?.EnableLibrarySourceDetails === true;
}

/** Apply a saved setting to the current connection before reopening media views. */
export function setLibrarySourceDetailsEnabled(enabled: boolean): void {
    const apiClient = ServerConnections.currentApiClient();
    if (!apiClient) return;

    const serverInfo = apiClient.serverInfo();
    if (serverInfo) {
        serverInfo.EnableLibrarySourceDetails = enabled;
        apiClient.updateServerInfo(serverInfo, apiClient.serverAddress());
    }
}

/** Older servers do not advertise this optional playback behavior. */
export function isPlaybackVersionSelectionEnabled(serverId?: string | null): boolean {
    const apiClient = serverId ?
        ServerConnections.getApiClient(serverId) :
        ServerConnections.currentApiClient();
    return apiClient?.serverInfo()?.EnablePlaybackVersionSelection === true;
}

/** Apply the saved server setting immediately to subsequent playback requests. */
export function setPlaybackVersionSelectionEnabled(enabled: boolean): void {
    const apiClient = ServerConnections.currentApiClient();
    if (!apiClient) return;

    const serverInfo = apiClient.serverInfo();
    if (serverInfo) {
        serverInfo.EnablePlaybackVersionSelection = enabled;
        apiClient.updateServerInfo(serverInfo, apiClient.serverAddress());
    }
}
