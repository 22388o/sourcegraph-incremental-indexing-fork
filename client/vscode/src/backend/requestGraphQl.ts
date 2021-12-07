import vscode from 'vscode'

import { checkOk, isHTTPAuthError } from '@sourcegraph/shared/src/backend/fetch'
import { GRAPHQL_URI } from '@sourcegraph/shared/src/graphql/constants'
import { GraphQLResult } from '@sourcegraph/shared/src/graphql/graphql'
import { asError } from '@sourcegraph/shared/src/util/errors'

import { accessTokenSetting, handleAccessTokenError } from '../settings/accessTokenSetting'
import { endpointSetting, endpointCorsSetting } from '../settings/endpointSetting'

let invalidated = false

/**
 * To be called when Sourcegraph URL changes.
 */
export function invalidateClient(): void {
    invalidated = true
}

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
    if (accessToken) {
        headers.push(['Authorization', `token ${accessToken}`])
    }
    try {
        // Add CORS when available
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
            await handleAccessTokenError(accessToken ?? '')
        }
        await vscode.window.showErrorMessage(
            'Fail to connect to endpoint. Please make sure you have CORS configured in your setting if you are on VS Code Web.'
        )
        throw asError(error)
    }
}
