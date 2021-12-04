import React from 'react'

import { CatalogEntityOwnerFields } from '../../../../graphql-operations'
import { PersonLink } from '../../../../person/PersonLink'
import { GroupLink } from '../../pages/group-detail/GroupLink'

interface Props {
    owner: CatalogEntityOwnerFields['owner']
    blankIfNone?: boolean
    className?: string
}

export const EntityOwner: React.FunctionComponent<Props> = ({ owner, blankIfNone, className }) =>
    owner ? (
        owner.__typename === 'Person' ? (
            <PersonLink person={owner} className={className} />
        ) : owner.__typename === 'Group' ? (
            <GroupLink group={owner} className={className} />
        ) : (
            <span className={className}>Unknown</span>
        )
    ) : (
        <span className={className}>{blankIfNone ? '' : 'None'}</span>
    )
