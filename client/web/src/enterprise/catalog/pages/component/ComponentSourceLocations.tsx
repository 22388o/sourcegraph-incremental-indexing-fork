import classNames from 'classnames'
import FolderIcon from 'mdi-react/FolderIcon'
import SourceRepositoryIcon from 'mdi-react/SourceRepositoryIcon'
import React from 'react'

import { RepoFileLink } from '@sourcegraph/shared/src/components/RepoFileLink'
import { RepoLink } from '@sourcegraph/shared/src/components/RepoLink'
import { pluralize } from '@sourcegraph/shared/src/util/strings'

import { ComponentSourcesFields } from '../../../../graphql-operations'

interface Props {
    component: ComponentSourcesFields
    listGroupClassName?: string
    className?: string
}

export const ComponentSourceLocations: React.FunctionComponent<Props> = ({
    component: { sourceLocations },
    listGroupClassName,
    className,
}) => (
    <div className={className}>
        {sourceLocations.length > 0 ? (
            <ol className={classNames('list-group mb-0', listGroupClassName)}>
                {sourceLocations.map(sourceLocation => (
                    <ComponentSourceLocation
                        key={`${sourceLocation.repositoryName}:${sourceLocation.path || ''}`}
                        sourceLocation={sourceLocation}
                        className="list-group-item py-2"
                    />
                ))}
            </ol>
        ) : (
            <div className="alert alert-warning">No sources defined</div>
        )}
    </div>
)

const ComponentSourceLocation: React.FunctionComponent<{
    sourceLocation: ComponentSourcesFields['sourceLocations'][0]
    tag?: 'li'
    className?: string
}> = ({ sourceLocation, tag: Tag = 'li', className }) => (
    <Tag className={classNames('d-flex align-items-center', className)}>
        {sourceLocation.path === null ? (
            <>
                <SourceRepositoryIcon className="icon-inline mr-1 text-muted" />
                <RepoLink repoName={sourceLocation.repositoryName} to={sourceLocation.repository?.url} />
            </>
        ) : (
            <>
                <FolderIcon className="icon-inline mr-1 text-muted" />
                {/* TODO(sqs): properly handle when the repo or tree is not found */}
                {sourceLocation.repository && sourceLocation.treeEntry ? (
                    <RepoFileLink
                        repoName={sourceLocation.repository.name}
                        repoURL={sourceLocation.repository.url}
                        filePath={sourceLocation.path}
                        fileURL={sourceLocation.treeEntry.url}
                        className="d-inline"
                    />
                ) : (
                    'missing'
                )}
            </>
        )}

        {sourceLocation.treeEntry &&
            sourceLocation.treeEntry.__typename === 'GitTree' &&
            sourceLocation.treeEntry.files && (
                <span className="text-muted small ml-2">
                    {sourceLocation.treeEntry.files.length} {pluralize('file', sourceLocation.treeEntry.files.length)}
                </span>
            )}
    </Tag>
)