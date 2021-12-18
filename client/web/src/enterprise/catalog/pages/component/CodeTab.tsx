import classNames from 'classnames'
import React from 'react'

import { ExtensionsControllerProps } from '@sourcegraph/shared/src/extensions/controller'
import { SettingsCascadeProps } from '@sourcegraph/shared/src/settings/settings'
import { TelemetryProps } from '@sourcegraph/shared/src/telemetry/telemetryService'
import { ThemeProps } from '@sourcegraph/shared/src/theme'

import { ComponentStateDetailFields } from '../../../../graphql-operations'

import { EntityCodeOwners } from './CodeOwners'
import { ComponentContributors } from './ComponentContributors'
import { ComponentSourceDefinitions } from './ComponentSourceDefinitions'
import { ComponentSources } from './ComponentSources'

interface Props extends TelemetryProps, ExtensionsControllerProps, ThemeProps, SettingsCascadeProps {
    entity: ComponentStateDetailFields
    className?: string
}

export const CodeTab: React.FunctionComponent<Props> = ({ entity, className, ...props }) => (
    <div className={classNames('row no-gutters', className)}>
        <div className="col-md-8 col-lg-9 col-xl-10 p-3">
            {entity.__typename === 'Component' && (
                <>
                    <h4 className="sr-only">Sources</h4>
                    <ComponentSourceDefinitions component={entity} className="mb-3" />
                </>
            )}

            <h4 className="sr-only">All files</h4>
            <ComponentSources {...props} component={entity} className="mb-3 card p-2" />
        </div>
        <div className="col-md-4 col-lg-3 col-xl-2 border-left p-3">
            <EntityCodeOwners entity={entity} className="mb-3" />
            <ComponentContributors component={entity} className="mb-3" />
        </div>
    </div>
)