import React, { useCallback } from 'react'

import { Meta, Story } from '@storybook/react'

import { BrandedStory } from '@sourcegraph/branded/src/components/BrandedStory'
// eslint-disable-next-line no-restricted-imports
import webStyles from '@sourcegraph/web/src/SourcegraphWebApp.scss'

import { Grid } from '../../Grid'

import { Checkbox, CheckboxProps } from './Checkbox'

const config: Meta = {
    title: 'wildcard/Checkbox',

    decorators: [
        story => (
            <BrandedStory styles={webStyles}>{() => <div className="container mt-3">{story()}</div>}</BrandedStory>
        ),
    ],

    parameters: {
        component: Checkbox,
        design: {
            type: 'figma',
            name: 'Figma',
            url: 'https://www.figma.com/file/NIsN34NH7lPu04olBzddTw/Wildcard-Design-System?node-id=860%3A79469',
        },
    },
}

export default config

const BaseCheckbox = ({ name, ...props }: { name: string } & Pick<CheckboxProps, 'isValid' | 'disabled'>) => {
    const [isChecked, setChecked] = React.useState(false)

    const handleChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(event => {
        setChecked(event.target.checked)
    }, [])

    return (
        <Checkbox
            name={name}
            id={name}
            value="first"
            checked={isChecked}
            onChange={handleChange}
            label="Check me!"
            message="Hello world!"
            {...props}
        />
    )
}

export const CheckboxExamples: Story = () => (
    <>
        <h1>Checkbox</h1>
        <Grid columnCount={4}>
            <div>
                <h2>Standard</h2>
                <BaseCheckbox name="standard-example" />
            </div>
            <div>
                <h2>Valid</h2>
                <BaseCheckbox name="valid-example" isValid={true} />
            </div>
            <div>
                <h2>Invalid</h2>
                <BaseCheckbox name="invalid-example" isValid={false} />
            </div>
            <div>
                <h2>Disabled</h2>
                <BaseCheckbox name="disabled-example" disabled={true} />
            </div>
        </Grid>
    </>
)

CheckboxExamples.parameters = {
    chromatic: {
        enableDarkMode: true,
        disableSnapshot: false,
    },
}
