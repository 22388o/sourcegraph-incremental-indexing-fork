import classNames from 'classnames'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Form } from 'reactstrap'
import { Observable, Subscription } from 'rxjs'
import { catchError, map } from 'rxjs/operators'

import { SearchBox } from '@sourcegraph/branded/src/search/input/SearchBox'
import { getFullQuery } from '@sourcegraph/branded/src/search/input/toggles/Toggles'
import { LoadingSpinner } from '@sourcegraph/react-loading-spinner'
import { wrapRemoteObservable } from '@sourcegraph/shared/src/api/client/api/common'
import { AuthenticatedUser } from '@sourcegraph/shared/src/auth'
import { dataOrThrowErrors } from '@sourcegraph/shared/src/graphql/graphql'
import * as GQL from '@sourcegraph/shared/src/graphql/schema'
import { getAvailableSearchContextSpecOrDefault } from '@sourcegraph/shared/src/search'
import {
    fetchAutoDefinedSearchContexts,
    fetchSearchContexts,
    getUserSearchContextNamespaces,
} from '@sourcegraph/shared/src/search/backend'
import { collectMetrics } from '@sourcegraph/shared/src/search/query/metrics'
import { appendContextFilter, sanitizeQueryForTelemetry } from '@sourcegraph/shared/src/search/query/transformer'
import { SearchMatch } from '@sourcegraph/shared/src/search/stream'
import { EMPTY_SETTINGS_CASCADE } from '@sourcegraph/shared/src/settings/settings'
import { globbingEnabledFromSettings } from '@sourcegraph/shared/src/util/globbing'
import { useObservable } from '@sourcegraph/shared/src/util/useObservable'

import {
    CurrentAuthStateResult,
    CurrentAuthStateVariables,
    SearchResult,
    SearchVariables,
    TreeEntriesResult,
    TreeEntriesVariables,
} from '../../graphql-operations'
import { LocalRecentSeachProps } from '../contract'
import { WebviewPageProps } from '../platform/context'

import { HomePanels } from './HomePanels'
import { SearchBetaIcon } from './icons'
import styles from './index.module.scss'
import { currentAuthStateQuery, searchQuery, treeEntriesQuery } from './queries'
import { RepoPage } from './RepoPage'
import { convertGQLSearchToSearchMatches, SearchResults } from './SearchResults'
import { DEFAULT_SEARCH_CONTEXT_SPEC } from './state'

import { useQueryState } from '.'

interface SearchPageProps extends WebviewPageProps {}

export const SearchPage: React.FC<SearchPageProps> = ({ platformContext, theme, sourcegraphVSCodeExtensionAPI }) => {
    const themeProperty = theme === 'theme-light' ? 'light' : 'dark'
    const [loading, setLoading] = useState(false)
    // Search Query States
    const searchActions = useQueryState(({ actions }) => actions)
    const queryState = useQueryState(({ state }) => state.queryState)
    const queryToRun = useQueryState(({ state }) => state.queryToRun)
    const caseSensitive = useQueryState(({ state }) => state.caseSensitive)
    const patternType = useQueryState(({ state }) => state.patternType)
    const selectedSearchContextSpec = useQueryState(({ state }) => state.selectedSearchContextSpec)
    const [fullQuery, setFullQuery] = useState<string | undefined>(undefined)
    // User Settings
    const [instanceHostname, setInstanceHostname] = useState<string>('')
    const [validAccessToken, setValidAccessToken] = useState<boolean | undefined>(undefined)
    const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null)
    // Local History
    const [lastSelectedSearchContext, setLastSelectedSearchContext] = useState<string | undefined>(undefined)
    const [localRecentSearches, setLocalRecentSearches] = useState<LocalRecentSeachProps[] | undefined>(undefined)
    // File Tree
    const [openRepoFileTree, setOpenRepoFileTree] = useState<boolean>(false)
    const [fileVariables, setFileVariables] = useState<TreeEntriesVariables | undefined>(undefined)
    const [entries, setEntries] = useState<Pick<GQL.ITreeEntry, 'name' | 'isDirectory' | 'url' | 'path'>[] | undefined>(
        undefined
    )
    const sourcegraphSettings =
        useObservable(
            useMemo(() => wrapRemoteObservable(sourcegraphVSCodeExtensionAPI.getSettings()), [
                sourcegraphVSCodeExtensionAPI,
            ])
        ) ?? EMPTY_SETTINGS_CASCADE

    const globbing = useMemo(() => globbingEnabledFromSettings(sourcegraphSettings), [sourcegraphSettings])

    // Submit search query
    const onSubmit = useCallback(
        async (event?: React.FormEvent): Promise<void> => {
            event?.preventDefault()
            await sourcegraphVSCodeExtensionAPI.onRepoResultPage(false)
            // close file tree when a new search has been performed
            await sourcegraphVSCodeExtensionAPI.displayFileTree(false)
            setOpenRepoFileTree(false)
            searchActions.submitQuery()
        },
        [searchActions, sourcegraphVSCodeExtensionAPI]
    )

    const backToSearchResults = useCallback(
        async (event?: React.FormEvent): Promise<void> => {
            event?.preventDefault()
            // close file tree when a new search has been performed
            await sourcegraphVSCodeExtensionAPI.displayFileTree(false)
            setOpenRepoFileTree(false)
            await sourcegraphVSCodeExtensionAPI.onRepoResultPage(false)
        },
        [sourcegraphVSCodeExtensionAPI]
    )

    const fetchSuggestions = useCallback(
        (query: string): Observable<SearchMatch[]> =>
            platformContext
                .requestGraphQL<SearchResult, SearchVariables>({
                    request: searchQuery,
                    variables: { query, patternType: null },
                    mightContainPrivateInfo: true,
                })
                .pipe(
                    map(dataOrThrowErrors),
                    map(results => convertGQLSearchToSearchMatches(results)),
                    catchError(() => [])
                ),
        [platformContext]
    )

    const setSelectedSearchContextSpec = (spec: string): void => {
        setLastSelectedSearchContext(spec)
        getAvailableSearchContextSpecOrDefault({
            spec,
            defaultSpec: DEFAULT_SEARCH_CONTEXT_SPEC,
            platformContext,
        })
            .toPromise()
            .then(availableSearchContextSpecOrDefault => {
                searchActions.setSelectedSearchContextSpec(availableSearchContextSpecOrDefault)
            })
            .catch(() => {
                // TODO error handling
            })

        sourcegraphVSCodeExtensionAPI
            .updateLastSelectedSearchContext(spec)
            .then(response => console.log(response))
            .catch(error => console.log(error))
    }

    // Get files to generate file tree for repo page
    const getFiles = (variables: TreeEntriesVariables): void => {
        setFileVariables(variables)
        setOpenRepoFileTree(true)
    }

    const onSignUpClick = useCallback(
        (event?: React.FormEvent): void => {
            event?.preventDefault()
            platformContext.telemetryService.log('VSCE_CreateAccountBanner_Click')
        },
        [platformContext.telemetryService]
    )
    // Set initial states
    useEffect(() => {
        setLoading(true)
        // Check for Access Token to display sign up CTA at start up
        if (validAccessToken === undefined) {
            sourcegraphVSCodeExtensionAPI
                .getUserSettings()
                .then(response => {
                    setValidAccessToken(response.validated)
                    setInstanceHostname(response.host)
                    if (response.validated) {
                        ;(async () => {
                            const currentUser = await platformContext
                                .requestGraphQL<CurrentAuthStateResult, CurrentAuthStateVariables>({
                                    request: currentAuthStateQuery,
                                    variables: {},
                                    mightContainPrivateInfo: true,
                                })
                                .toPromise()
                            if (currentUser.data) {
                                setAuthenticatedUser(currentUser.data.currentUser)
                            } else {
                                setValidAccessToken(false)
                            }
                        })().catch(error => console.error(error))
                    }
                })
                .catch(error => {
                    console.error(error)
                    setValidAccessToken(false)
                    setAuthenticatedUser(null)
                })
        }
        if (lastSelectedSearchContext === undefined) {
            sourcegraphVSCodeExtensionAPI
                .getLastSelectedSearchContext()
                .then(spec => {
                    if (spec) {
                        setLastSelectedSearchContext(spec)
                        getAvailableSearchContextSpecOrDefault({
                            spec,
                            defaultSpec: DEFAULT_SEARCH_CONTEXT_SPEC,
                            platformContext,
                        })
                            .toPromise()
                            .then(availableSearchContextSpecOrDefault => {
                                searchActions.setSelectedSearchContextSpec(availableSearchContextSpecOrDefault)
                            })
                            .catch(() => {
                                // TODO error handling
                            })
                    } else {
                        setLastSelectedSearchContext(DEFAULT_SEARCH_CONTEXT_SPEC)
                    }
                })
                // TODO error handling
                .catch(error => console.log(error))
        }
        setLoading(false)
    }, [
        sourcegraphVSCodeExtensionAPI,
        selectedSearchContextSpec,
        searchActions,
        platformContext,
        lastSelectedSearchContext,
        localRecentSearches,
        fileVariables,
        instanceHostname,
        validAccessToken,
        openRepoFileTree,
        authenticatedUser,
    ])
    // Handle Search History from VS Code Local Storage
    useEffect(() => {
        setLoading(true)
        // Get local search history
        if (localRecentSearches !== undefined) {
            // only save 20 searches locally
            if (fullQuery && localRecentSearches.length < 21) {
                // query to add to search history
                const newSearchHistory = {
                    lastQuery: queryToRun.query,
                    lastSelectedSearchContextSpec: selectedSearchContextSpec || '',
                    lastCaseSensitive: caseSensitive,
                    lastPatternType: patternType,
                    lastFullQuery: fullQuery,
                }
                // we will not save it if current search query is the same as the last one
                if (localRecentSearches[localRecentSearches.length - 1]?.lastFullQuery !== fullQuery) {
                    let currentLocalSearchHistory = localRecentSearches
                    // Limiting Local Search History to 20
                    // We only display 15 in homepage
                    if (localRecentSearches.length > 19) {
                        currentLocalSearchHistory = localRecentSearches.slice(-19)
                    }
                    const newRecentSearches = [...currentLocalSearchHistory, newSearchHistory]
                    sourcegraphVSCodeExtensionAPI
                        .setLocalRecentSearch(newRecentSearches)
                        .then(() => setLocalRecentSearches(newRecentSearches))
                        .catch(error => {
                            console.error(error)
                        })
                }
            }
        } else {
            // Get Recent Search History from Local Storage
            sourcegraphVSCodeExtensionAPI
                .getLocalSearchHistory()
                .then(response => {
                    setLocalRecentSearches(response.searches)
                })
                .catch(() => {
                    // TODO error handling
                })
        }
        setLoading(false)
    }, [
        sourcegraphVSCodeExtensionAPI,
        localRecentSearches,
        validAccessToken,
        fullQuery,
        queryToRun.query,
        selectedSearchContextSpec,
        caseSensitive,
        patternType,
    ])
    // Create File Tree if user clicks on Repo search result
    useEffect(() => {
        setLoading(true)
        // create file tree
        if (openRepoFileTree && fileVariables) {
            ;(async () => {
                const files = await platformContext
                    .requestGraphQL<TreeEntriesResult, TreeEntriesVariables>({
                        request: treeEntriesQuery,
                        variables: fileVariables,
                        mightContainPrivateInfo: true,
                    })
                    .toPromise()
                if (files.data?.repository?.commit?.tree) {
                    setEntries(files.data.repository.commit.tree.entries)
                }
            })().catch(error => console.error(error))
        }

        setLoading(false)
    }, [fullQuery, fileVariables, openRepoFileTree, platformContext])
    // When a query is run, set active panel to true, setFullQuery for result page,
    // add new search to User event for signed in users
    useEffect(() => {
        setLoading(true)
        // Check for Access Token to display sign up CTA at start up
        const subscriptions = new Subscription()
        if (queryToRun.query) {
            // Set active panel to true in extension to show the correct sidebar view
            sourcegraphVSCodeExtensionAPI
                .hasActivePanel()
                .then(response => {
                    console.log('Search Panel Active', response)
                }) // TODO error handling
                .catch(error => console.log(error))
            // Set Full Query for Results Page
            const currentFullQuery = getFullQuery(
                queryToRun.query,
                selectedSearchContextSpec || '',
                caseSensitive,
                patternType
            )
            setFullQuery(currentFullQuery)
            let queryString = `${queryToRun.query}${caseSensitive ? ' case:yes' : ''}`
            if (selectedSearchContextSpec) {
                queryString = appendContextFilter(queryString, selectedSearchContextSpec)
            }
            const subscription = platformContext
                .requestGraphQL<SearchResult, SearchVariables>({
                    request: searchQuery,
                    variables: { query: queryString, patternType },
                    mightContainPrivateInfo: true,
                })
                .pipe(map(dataOrThrowErrors)) // TODO error handling
                .subscribe(searchResults => {
                    searchActions.updateResults(searchResults)
                })

            subscriptions.add(subscription)
        }
        setLoading(false)
        return () => subscriptions.unsubscribe()
    }, [
        sourcegraphVSCodeExtensionAPI,
        queryToRun,
        patternType,
        caseSensitive,
        selectedSearchContextSpec,
        searchActions,
        platformContext,
        lastSelectedSearchContext,
        localRecentSearches,
        fullQuery,
        fileVariables,
        instanceHostname,
        validAccessToken,
        openRepoFileTree,
        authenticatedUser,
    ])
    // Log Search to User Event Logs to sync Search History
    useEffect(() => {
        if (queryToRun.query && validAccessToken && fullQuery) {
            setLoading(true)
            let queryString = `${queryToRun.query}${caseSensitive ? ' case:yes' : ''}`
            if (selectedSearchContextSpec) {
                queryString = appendContextFilter(queryString, selectedSearchContextSpec)
            }
            const metrics = queryString ? collectMetrics(queryString) : undefined
            const isSourcegraphDotCom = instanceHostname.startsWith('https://sourcegraph.com')
            platformContext.telemetryService.log(
                'SearchResultsQueried',
                {
                    code_search: {
                        query_data: {
                            query: metrics,
                            combined: queryString,
                            empty: !queryString,
                        },
                    },
                },
                {
                    code_search: {
                        query_data: {
                            // 🚨 PRIVACY: never provide any private query data in the
                            // { code_search: query_data: query } property,
                            // which is also potentially exported in pings data.
                            query: metrics,

                            // 🚨 PRIVACY: Only collect the full query string for unauthenticated users
                            // on Sourcegraph.com, and only after sanitizing to remove certain filters.
                            combined:
                                !authenticatedUser && isSourcegraphDotCom
                                    ? sanitizeQueryForTelemetry(queryString)
                                    : undefined,
                            empty: !queryString,
                        },
                    },
                },
                `https://${instanceHostname}/search?q=${encodeURIComponent(queryString)}&patternType=${patternType}`
            )
        }
        setLoading(false)
    }, [
        queryToRun,
        selectedSearchContextSpec,
        fullQuery,
        validAccessToken,
        caseSensitive,
        instanceHostname,
        patternType,
        platformContext,
        authenticatedUser,
    ])

    if (loading) {
        return <LoadingSpinner />
    }

    return (
        <div
            className={
                !queryToRun.query
                    ? classNames('d-flex flex-column align-items-center px-4', styles.searchPage)
                    : classNames('d-flex flex-column align-items-center')
            }
        >
            {!queryToRun.query && (
                <>
                    <div className={classNames('d-flex justify-content-end w-100 p-3')}>
                        <button
                            type="button"
                            className={classNames(
                                'btn btn-primary text border-0 text-decoration-none px-3',
                                styles.feedbackButton
                            )}
                            onClick={() =>
                                sourcegraphVSCodeExtensionAPI.openLink(
                                    'https://github.com/sourcegraph/sourcegraph/discussions/categories/feedback'
                                )
                            }
                        >
                            Give us Feedback
                        </button>
                    </div>
                    <img
                        className={classNames(styles.logo)}
                        src={`https://sourcegraph.com/.assets/img/sourcegraph-logo-${themeProperty}.svg`}
                        alt="Sourcegraph logo"
                    />
                    <div className={classNames(styles.logoText)}>Search your code and 2M+ open source repositories</div>
                </>
            )}
            <div className={classNames('flex-grow-0', styles.searchContainer, styles.searchContainerWithContentBelow)}>
                <Form className="d-flex my-2" onSubmit={onSubmit}>
                    {/* TODO temporary settings provider w/ mock in memory storage */}
                    <SearchBox
                        isSourcegraphDotCom={instanceHostname.startsWith('https://sourcegraph.com')}
                        // Platform context props
                        platformContext={platformContext}
                        telemetryService={platformContext.telemetryService}
                        // Search context props
                        searchContextsEnabled={true}
                        showSearchContext={true}
                        showSearchContextManagement={true}
                        hasUserAddedExternalServices={false}
                        hasUserAddedRepositories={true} // Used for search context CTA, which we won't show here.
                        defaultSearchContextSpec={DEFAULT_SEARCH_CONTEXT_SPEC}
                        // TODO store search context in vs code settings?
                        setSelectedSearchContextSpec={setSelectedSearchContextSpec}
                        selectedSearchContextSpec={selectedSearchContextSpec}
                        fetchAutoDefinedSearchContexts={fetchAutoDefinedSearchContexts}
                        fetchSearchContexts={fetchSearchContexts}
                        getUserSearchContextNamespaces={getUserSearchContextNamespaces}
                        // Case sensitivity props
                        caseSensitive={caseSensitive}
                        setCaseSensitivity={searchActions.setCaseSensitivity}
                        // Pattern type props
                        patternType={patternType}
                        setPatternType={searchActions.setPatternType}
                        // Misc.
                        isLightTheme={theme === 'theme-light'}
                        authenticatedUser={authenticatedUser} // Used for search context CTA, which we won't show here.
                        queryState={queryState}
                        onChange={searchActions.setQuery}
                        onSubmit={onSubmit}
                        autoFocus={true}
                        fetchSuggestions={fetchSuggestions}
                        settingsCascade={sourcegraphSettings}
                        globbing={globbing}
                        // TODO(tj): instead of cssvar, can pipe in font settings from extension
                        // to be able to pass it to Monaco!
                        className={classNames(styles.withEditorFont, 'flex-shrink-past-contents')}
                    />
                </Form>
                {!queryToRun.query && (
                    <div className="flex-grow-1">
                        <HomePanels
                            telemetryService={platformContext.telemetryService}
                            isLightTheme={theme === 'theme-light'}
                            setQuery={searchActions.setQuery}
                        />
                    </div>
                )}
                {queryToRun.query && fullQuery && (
                    <div className={classNames(styles.streamingSearchResultsContainer)}>
                        {/* Display Sign up banner if no access token is detected (assuming they do not have a Sourcegraph account)  */}
                        {!authenticatedUser && platformContext.telemetryService && (
                            <SearchPageCta
                                icon={<SearchBetaIcon />}
                                ctaTitle="Sign up to add your public and private repositories and access other features"
                                ctaDescription="Do all the things editors can’t: search multiple repos & commit history, monitor, save searches and more."
                                buttonText="Create a free account"
                                onClickAction={onSignUpClick}
                            />
                        )}
                        {/* TODO: This is a temporary repo file viewer */}
                        {openRepoFileTree && fileVariables && entries && (
                            <RepoPage
                                platformContext={platformContext}
                                theme={theme}
                                getFiles={getFiles}
                                entries={entries}
                                instanceHostname={instanceHostname}
                                sourcegraphVSCodeExtensionAPI={sourcegraphVSCodeExtensionAPI}
                                selectedRepoName={fileVariables.repoName}
                                backToSearchResultPage={backToSearchResults}
                            />
                        )}
                        {fullQuery && !openRepoFileTree && (
                            <SearchResults
                                platformContext={platformContext}
                                theme={theme}
                                sourcegraphVSCodeExtensionAPI={sourcegraphVSCodeExtensionAPI}
                                settings={sourcegraphSettings}
                                instanceHostname={instanceHostname}
                                fullQuery={fullQuery}
                                getFiles={getFiles}
                                authenticatedUser={authenticatedUser}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

interface SearchPageCtaProps {
    icon: JSX.Element
    ctaTitle: string
    ctaDescription: string
    buttonText: string
    onClickAction?: () => void
}

export const SearchPageCta: React.FunctionComponent<SearchPageCtaProps> = ({
    icon,
    ctaTitle,
    ctaDescription,
    buttonText,
    onClickAction,
}) => (
    <div className="cta-card d-flex flex-md-row flex-column align-items-center p-1">
        <div className="mr-md-3 ml-3">
            <div className="w-50">{icon}</div>
        </div>
        <div className={classNames('flex-1 my-md-0 my-2', styles.streamingSearchResultsCtaContainer)}>
            <div className={classNames('mb-1', styles.streamingSearchResultsCtaTitle)}>
                <strong>{ctaTitle}</strong>
            </div>
            <div className={classNames('text-muted', styles.streamingSearchResultsCtaDescription)}>
                {ctaDescription}
            </div>
        </div>
        <a
            className={classNames('btn', styles.streamingSearchResultsBtn)}
            href="https://sourcegraph.com/sign-up?editor=vscode"
            onClick={onClickAction}
        >
            <span className={styles.streamingSearchResultsText}>{buttonText}</span>
        </a>
    </div>
)
