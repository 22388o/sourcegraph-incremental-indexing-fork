import classNames from 'classnames'
import React from 'react'

import { WebviewPageProps } from '../platform/context'
import { TelemetryProps } from '../platform/telemetryService'

import styles from './SearchSidebar.module.scss'

interface OpenSearchPanelCtaProps extends TelemetryProps, Pick<WebviewPageProps, 'sourcegraphVSCodeExtensionAPI'> {
    onDesktop: boolean
}

export const OpenSearchPanelCta: React.FunctionComponent<OpenSearchPanelCtaProps> = ({
    onDesktop,
    telemetryService,
}) => (
    <div className={classNames(styles.cta)}>
        <p className={classNames(styles.ctaTitle)}>Welcome!</p>
        <div className={classNames(styles.ctaContainer)}>
            <p className={classNames(styles.ctaParagraph)}>
                The Sourcegraph extension allows you to search millions of open source repositories without cloning them
                to your local machine.
            </p>
            <p className={classNames(styles.ctaParagraph)}>
                Developers at some of the world's best software companies use Sourcegraph to onboard to new code bases,
                find examples, research errors, and resolve incidents.
            </p>
            <div className={classNames(styles.ctaParagraph, 'mb-0')}>
                <p className={classNames('my-0', styles.text)}>Learn more:</p>
                <p className="mb-0">
                    <a
                        href="http://sourcegraph.com/"
                        className={classNames('my-0', styles.text)}
                        onClick={() => telemetryService.log('VSCE_Sidebar_learnsourcegraph_Click')}
                    >
                        Sourcegraph.com
                    </a>
                    <br />
                    <a
                        href="https://marketplace.visualstudio.com/items?itemName=sourcegraph.sourcegraph"
                        onClick={() => telemetryService.log('VSCE_Sidebar_learnextension_Click')}
                        className={classNames('my-0', styles.text)}
                    >
                        Sourcegraph VS Code extension
                    </a>
                </p>
            </div>
        </div>
        {!onDesktop && (
            <div className={classNames(styles.ctaParagraph)}>
                <p className={classNames(styles.ctaWarningText)}>
                    IMPORTANT: You may need to add Access Token and CORS to connect to Sourcegraph Private Instance on
                    VS Code Web.
                </p>
            </div>
        )}
    </div>
)
