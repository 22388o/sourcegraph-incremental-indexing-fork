import { Tabs, TabsProps } from '@reach/tabs'
import classNames from 'classnames'
import React, { HTMLAttributes } from 'react'

import styles from './ConnectionPopover.module.scss'

type ConnectionPopoverProps = HTMLAttributes<HTMLDivElement>

export const ConnectionPopover: React.FunctionComponent<ConnectionPopoverProps> = ({
    className,
    children,
    ...rest
}) => (
    <div className={classNames(styles.connectionPopover, className)} {...rest}>
        {children}
    </div>
)

type ConnectionPopoverTabsProps = TabsProps & {
    className?: string
}

export const ConnectionPopoverTabs: React.FunctionComponent<ConnectionPopoverTabsProps> = ({
    children,
    className,
    ...rest
}) => (
    <Tabs className={classNames(styles.connectionPopover, className)} {...rest}>
        {children}
    </Tabs>
)