import { EMPTY, Subject } from 'rxjs'
import { bufferTime, catchError, concatMap } from 'rxjs/operators'
import vscode from 'vscode'

import { checkOk, isHTTPAuthError } from '@sourcegraph/shared/src/backend/fetch'
import { GRAPHQL_URI } from '@sourcegraph/shared/src/graphql/constants'
import { gql, GraphQLResult } from '@sourcegraph/shared/src/graphql/graphql'
import { asError } from '@sourcegraph/shared/src/util/errors'

import { Exact, Maybe, UserEventVariables } from '../graphql-operations'
import { accessTokenSetting, handleAccessTokenError } from '../settings/accessTokenSetting'
import { endpointSetting, endpointCorsSetting } from '../settings/endpointSetting'
import { currentAuthStateQuery } from '../webview/search-panel/queries'

let invalidated = false

/**
 * To be called when Sourcegraph URL changes.
 */
export function invalidateClient(): void {
    invalidated = true
}

// Check what platform is the user on
// return 'desktop', 'github.dev', 'codespaces', or 'web'
export const currentPlatform = vscode.env.appHost

export const requestGraphQLFromVSCode = async <R, V = object>(
    request: string,
    variables: V
): Promise<GraphQLResult<R>> => {
    if (invalidated) {
        throw new Error(
            'Sourcegraph GraphQL Client has been invalidated due to instance URL change. Restart VS Code to fix.'
        )
    }

    const nameMatch = request.match(/^\s*(?:query|mutation)\s+(\w+)/)
    const apiURL = `${GRAPHQL_URI}${nameMatch ? '?' + nameMatch[1] : ''}`

    const headers: HeadersInit = []
    const sourcegraphURL = endpointSetting()
    const accessToken = accessTokenSetting()
    const corsUrl = endpointCorsSetting()
    // Add Access Token to request header
    if (accessToken) {
        headers.push(['Authorization', `token ${accessToken}`])
    } else {
        headers.push(['Content-Type', 'application/json'])
    }
    if (currentPlatform !== 'desktop' && !accessToken && !corsUrl) {
        throw asError(
            'Access Token (and CORS for version below 3.35.2) is required to use Sourcegraph with Private Instances on VS Code Web.'
        )
    }
    try {
        // Add CORS if provided
        const searchUrl = corsUrl
            ? `${new URL('/', corsUrl).href}${new URL(apiURL, sourcegraphURL).href}`
            : new URL(apiURL, sourcegraphURL).href
        const response = checkOk(
            await fetch(searchUrl, {
                body: JSON.stringify({
                    query: request,
                    variables,
                }),
                method: 'POST',
                headers,
            })
        )
        // TODO request cancellation w/ VS Code cancellation tokens.

        // eslint-disable-next-line @typescript-eslint/return-await
        return response.json() as Promise<GraphQLResult<any>>
    } catch (error) {
        if (isHTTPAuthError(error)) {
            handleAccessTokenError(accessToken ?? '')
        }
        throw asError(error)
    }
}

// Check if the provided access token is valid or not
export function hasValidatedToken(): boolean {
    const accessToken = accessTokenSetting()
    const authCheck = requestGraphQLFromVSCode(currentAuthStateQuery, {})
        .then(response => response.data)
        .catch(() => {})
    if (accessToken && authCheck !== null) {
        return true
    }
    return false
}

export function currentUserSettings(): SourcegraphVsceUserSettingProps {
    const currentEndpoint = endpointSetting()
    const currentHost = new URL(currentEndpoint).hostname
    const currentToken = accessTokenSetting() !== undefined
    const currentCorsUrl = endpointCorsSetting()
    const currentTokenValidated = hasValidatedToken()
    const currentPlatform = vscode.env.appHost
    return {
        endpoint: currentEndpoint,
        host: currentHost,
        token: currentToken,
        corsUrl: currentCorsUrl,
        validated: currentTokenValidated,
        platform: currentPlatform,
    }
}

export interface SourcegraphVsceUserSettingProps {
    endpoint: string
    host: string
    token: boolean
    corsUrl: string
    validated: boolean
    platform: string
}

export type LogEventsVariables = Exact<{
    events: Maybe<UserEventVariables[]>
}>
// Log events in batches.
const events = new Subject<UserEventVariables>()

export const logEventsMutation = gql`
    mutation LogEvents($events: [Event!]) {
        logEvents(events: $events) {
            alwaysNil
        }
    }
`
events
    .pipe(
        bufferTime(1000),
        concatMap(events => {
            if (events.length > 0) {
                const test = requestGraphQLFromVSCode<LogEventsResult, LogEventsVariables>(logEventsMutation, {
                    events,
                })
                    .then(response => console.log(response))
                    .catch(error => console.error(error))

                return test
            }
            return EMPTY
        }),
        catchError(error => {
            console.error('Error logging events:', error)
            return []
        })
    )
    // eslint-disable-next-line rxjs/no-ignored-subscription
    .subscribe()

/**
 * Log a raw user action (used to allow site admins on a Sourcegraph instance
 * to see a count of unique users on a daily, weekly, and monthly basis).
 *
 * When invoked on a non-Sourcegraph.com instance, this data is stored in the
 * instance's database, and not sent to Sourcegraph.com.
 */
export function logEvents(eventVariable: UserEventVariables): void {
    events.next(eventVariable)
}
