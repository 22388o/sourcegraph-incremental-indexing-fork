import { ConsoleMessage, ConsoleMessageType, Page } from 'puppeteer'
import chalk, { Chalk } from 'chalk'
import * as util from 'util'
import terminalSize from 'term-size'
import stringWidth from 'string-width'
import { identity } from 'lodash'
import { asError } from '../util/errors'
import { parseBool } from './config'

const colors: Partial<Record<ConsoleMessageType, Chalk>> = {
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.cyan,
}
const icons: Partial<Record<ConsoleMessageType, string>> = {
    error: '✖',
    warning: '⚠',
    info: 'ℹ',
}

const useSimpleBrowserConsoleLogs = parseBool(process.env.SIMPLE_BROWSER_CONSOLE_LOGS)

/**
 * Formats a console message that was logged in a Puppeteer Chrome instance for
 * output on the NodeJS terminal. Tries to mirror Chrome's console output as
 * closely as possible and makes sense.
 */
export async function formatPuppeteerConsoleMessage(
    page: Page,
    message: ConsoleMessage,
    simple?: boolean
): Promise<string> {
    // Troubleshooting formatted puppeteer console messages: these are known
    // problems:
    //
    // 1. Firefox tests with `puppeteer-firefox`: It does not support
    //    `argumentHandle.evaluateHandle` so messages will be broken, until we
    //    migrate away from `puppeteer-firefox` which is deprecated.
    // 2. Known terminal-size problem: if a message's location string is too
    //    long for the terminal, the formatting logic below will throw an error.
    //
    // Workaround: use `SIMPLE_BROWSER_CONSOLE_LOGS=1` when running tests to
    //    switch to simple formatting, which avoids these problems.
    if (useSimpleBrowserConsoleLogs || simple) {
        return `Browser console (${message.type()}): ${message.text()}`
    }

    const color = colors[message.type()] ?? identity
    const icon = icons[message.type()] ?? ''
    const formattedLocation =
        'at ' +
        chalk.underline(
            [message.location().url, message.location().lineNumber, message.location().columnNumber]
                .filter(Boolean)
                .join(':')
        ) +
        ` from page ${chalk.underline(page.url())}`

    // Right-align location, like in Chrome dev tools
    const locationLine = chalk.dim(
        formattedLocation &&
            '\n' +
                (!process.env.CI
                    ? ' '.repeat(Math.max(0, terminalSize().columns - stringWidth(formattedLocation))) +
                      formattedLocation
                    : '\t' + formattedLocation)
    )
    return [
        chalk.bold('🖥  Browser console:'),
        color(
            ...[
                message.type() !== 'log' ? chalk.bold(icon, message.type()) : '',
                message.args().length === 0 ? message.text() : '',
                ...(
                    await Promise.all(
                        message.args().map(async argumentHandle => {
                            try {
                                const json = (await (
                                    await argumentHandle.evaluateHandle(value =>
                                        JSON.stringify(value, (key, value: unknown) => {
                                            // Check if value is error, because Errors are not serializable but commonly logged
                                            if (value instanceof Error) {
                                                return value.stack
                                            }
                                            return value
                                        })
                                    )
                                ).jsonValue()) as string
                                const parsed: unknown = JSON.parse(json)
                                return parsed
                            } catch (error) {
                                return chalk.italic(`[Could not serialize: ${asError(error).message}]`)
                            }
                        })
                    )
                ).map(value => (typeof value === 'string' ? value : util.inspect(value))),
                locationLine,
            ].filter(Boolean)
        ),
    ].join(' ')
}
