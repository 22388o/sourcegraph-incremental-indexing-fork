import { FlatExtensionHostAPI } from '@sourcegraph/shared/src/api/contract'
import { ProxySubscribable } from '@sourcegraph/shared/src/api/extension/api/common'
import { ViewerData, ViewerId } from '@sourcegraph/shared/src/api/viewerTypes'
import { GraphQLResult } from '@sourcegraph/shared/src/graphql/graphql'
import { SearchPatternType } from '@sourcegraph/shared/src/graphql/schema'
import { QueryState } from '@sourcegraph/shared/src/search/helpers'
import { Filter } from '@sourcegraph/shared/src/search/stream'
import { Settings, SettingsCascadeOrError } from '@sourcegraph/shared/src/settings/settings'

import { SourcegraphVsceUserSettingProps } from '../backend/requestGraphQl'
import { UserEventVariables } from '../graphql-operations'

import { SearchSidebarMediator } from './search-sidebar/mediator'

/**
 * Sourcegraph VS Code methods exposed to Webviews
 *
 * TODO: Kind of a "hub" for all webview communication.
 *
 * Note: this API object lives in the VS Code extension host runtime.
 */
export interface SourcegraphVSCodeExtensionAPI
    extends Pick<
        SearchSidebarMediator,
        | 'observeActiveWebviewQueryState'
        | 'observeActiveWebviewDynamicFilters'
        | 'setActiveWebviewQueryState'
        | 'submitActiveWebviewSearch'
    > {
    ping: () => ProxySubscribable<'pong'>

    // Shared methods
    requestGraphQL: (request: string, variables: any) => Promise<GraphQLResult<any>>
    getSettings: () => ProxySubscribable<SettingsCascadeOrError<Settings>>
    logVsceEvent: (variables: UserEventVariables) => Promise<void>
    // For search webview
    panelInitialized: (panelId: string) => void
    // Get User Settings, including hostname, token, corsUrl, authUser info, platform name
    getUserSettings: () => SourcegraphVsceUserSettingProps
    // Get User Local Search History
    getLocalSearchHistory: () => LocalSearchHistoryProps
    /** TODO explain, we deliberately do not react to URL changes in webviews. */
    getInstanceHostname: () => string
    // Update Access Token - return true when updated successfully
    updateAccessToken: (token: string) => Promise<boolean>
    /** TODO document. sourcegraph://${host}/${uri} */
    openFile: (sourcegraphUri: string) => void
    // Open links in browser
    openLink: (uri: string) => void
    // Copy Link to Clipboard
    copyLink: (uri: string) => void
    // For search sidebar
    openSearchPanel: () => void
    // Update Cors Setting - return true when updated successfully
    updateCorsUri: (uri: string) => Promise<boolean>
    // Get & set items from Local Storage
    getLocalStorageItem: (key: string) => string
    setLocalStorageItem: (key: string, value: string) => Promise<boolean>
    // Get and update Last Selected Search Context from Local Storage
    getLastSelectedSearchContext: () => string
    updateLastSelectedSearchContext: (context: string) => Promise<boolean>
    // Get and update Last Selected Search Context from Local Storage
    getLocalRecentSearch: () => LocalRecentSeachProps[]
    setLocalRecentSearch: (searches: LocalRecentSeachProps[]) => Promise<boolean>
    // Display File Tree when repo is clicked
    displayFileTree: (setting: boolean) => void
    // Let editor knows user is currently on repo result page
    onRepoResultPage: (setting: boolean) => void
    // Check if there is an active search panel open
    hasActivePanel: () => void
    // For extension host sidebar
    // mainThreadAPI methods
}

/**
 * Search webview methods exposed to the Sourcegraph VS Code extension.
 */
export interface SourcegraphVSCodeSearchWebviewAPI {
    observeQueryState: () => ProxySubscribable<QueryStateWithInputProps>
    observeDynamicFilters: () => ProxySubscribable<Filter[] | null>
    setQueryState: (queryState: QueryState) => void
    submitSearch: (queryState?: QueryState) => void
}

export interface QueryStateWithInputProps {
    queryState: QueryState
    caseSensitive: boolean
    patternType: SearchPatternType
    executed?: boolean
}

export interface SourcegraphVSCodeSearchSidebarAPI {}

/**
 * A subset of the Sourcegraph extension host API that is used by the VS Code extension.
 * TODO just extend + pick
 */
export interface SourcegraphVSCodeExtensionHostAPI
    extends Pick<FlatExtensionHostAPI, 'getDefinition' | 'getHover' | 'getReferences' | 'addTextDocumentIfNotExists'> {
    // get hover
    // definition
    // getDefinition: (
    //     parameters: TextDocumentPositionParameters
    //     // instance URL?
    // ) => ProxySubscribable<MaybeLoadingResult<HoverMerged | null>>
    addViewerIfNotExists(viewer: ViewerData): Promise<ViewerId>
    // add
    // TODO addWorkspaceRoot if necessary?
    // references
    // get editor decorations
}

export interface LocalRecentSeachProps {
    lastQuery: string
    lastSelectedSearchContextSpec: string
    lastCaseSensitive: boolean
    lastPatternType: string
    lastFullQuery: string
}

export interface LocalFileHistoryProps {
    repoName: string
    filePath: string
    sgUri: string
    timestamp: string
}

export interface LocalSearchHistoryProps {
    searches: LocalRecentSeachProps[]
    files: string[]
}
