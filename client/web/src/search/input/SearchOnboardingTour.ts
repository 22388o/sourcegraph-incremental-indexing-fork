/**
 * This file contains utility functions for the search onboarding tour.
 */
import * as H from 'history'
import { isEqual } from 'lodash'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Shepherd from 'shepherd.js'
import Tour from 'shepherd.js/src/types/tour'

import { LANGUAGES } from '@sourcegraph/shared/src/search/query/filters'
import { scanSearchQuery } from '@sourcegraph/shared/src/search/query/scanner'
import { Token } from '@sourcegraph/shared/src/search/query/token'
import { useLocalStorage } from '@sourcegraph/shared/src/util/useLocalStorage'

import { daysActiveCount } from '../../marketing/util'
import { eventLogger } from '../../tracking/eventLogger'
import { QueryState } from '../helpers'

import { MonacoQueryInputProps } from './MonacoQueryInput'
import { defaultTourOptions } from './tour-options'

export const HAS_CANCELLED_TOUR_KEY = 'has-cancelled-onboarding-tour'
export const HAS_COMPLETED_TOUR_KEY = 'has-completed-onboarding-tour'

const tourOptions: Shepherd.Tour.TourOptions = {
    ...defaultTourOptions,
    defaultStepOptions: {
        ...defaultTourOptions.defaultStepOptions,
        popperOptions: {
            // Removes default behavior of autofocusing steps
            modifiers: [
                {
                    name: 'focusAfterRender',
                    enabled: false,
                },
                { name: 'offset', options: { offset: [0, 8] } },
            ],
        },
    },
}

/**
 * generateStep creates the content for the search tour card. All steps that just contain
 * static content should use this function to populate the step's `text` field.
 */
function generateStep(options: {
    tour: Shepherd.Tour
    title: string
    stepNumber: number
    additionalContent?: HTMLElement
}): HTMLElement {
    const element = document.createElement('div')
    element.className = `d-flex align-items-center test-tour-step-${options.stepNumber}`
    element.innerHTML = `<div class="tour-card__title mr-3">${options.title}</div>`

    if (options.additionalContent) {
        element.append(options.additionalContent)
    }

    const close = document.createElement('div')
    close.className = 'd-flex align-items-center'
    close.innerHTML = `
        <div class="tour-card__separator mr-3"></div>
        <div class="tour-card__close text-muted">${closeIconSvg}</div>
    `
    element.append(close)
    element.querySelector('.tour-card__close')?.addEventListener('click', () => {
        options.tour.cancel()
        eventLogger.log('CloseOnboardingTourClicked', { stage: options.stepNumber })
    })

    return element
}

const closeIconSvg =
    '<svg width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.667 4.274l-.94-.94L8 7.06 4.273 3.334l-.94.94L7.06 8l-3.727 3.727.94.94L8 8.94l3.727 3.727.94-.94L8.94 8l3.727-3.726z" fill="#5E6E8C"/></svg>'

/**
 * Generates the content for the first step in the tour.
 *
 * @param languageButtonHandler the handler for the "search a language" button.
 * @param repositoryButtonHandler the handler for the "search a repository" button.
 */
function generateStep1(
    tour: Shepherd.Tour,
    languageButtonHandler: () => void,
    repositoryButtonHandler: () => void
): HTMLElement {
    const element = document.createElement('div')
    element.className = 'd-flex align-items-center mr-3'
    element.innerHTML = `
        <button class="btn btn-link p-0 mr-3 tour-language-button">Search a language</button>
        <button class="btn btn-link p-0 tour-repo-button">Search a repository</button>
    `
    element.querySelector('.tour-language-button')?.addEventListener('click', () => {
        languageButtonHandler()
        eventLogger.log('OnboardingTourLanguageOptionClicked')
    })
    element.querySelector('.tour-repo-button')?.addEventListener('click', () => {
        repositoryButtonHandler()
        eventLogger.log('OnboardingTourRepositoryOptionClicked')
    })

    return generateStep({ tour, title: 'Get started', additionalContent: element, stepNumber: 1 })
}

type TourStepID = 'filter-repository' | 'filter-lang' | 'add-query-term'

const TOUR_STEPS = ['filter-repository', 'filter-lang', 'add-query-term'] as TourStepID[]

/**
 * Returns `true` if, while on the filter-(repository|lang) step,
 * the search query is a (repo|lang) filter with no value.
 */
const shouldTriggerSuggestions = (currentTourStep: TourStepID | undefined, queryTokens: Token[]): boolean => {
    if (queryTokens.length !== 1) {
        return false
    }
    const filterToken = queryTokens[0]
    if (filterToken.type !== 'filter' || filterToken.value !== undefined) {
        return false
    }
    return currentTourStep === 'filter-repository'
        ? filterToken.field.value === 'repo'
        : currentTourStep === 'filter-lang'
        ? filterToken.field.value === 'lang'
        : false
}

/**
 * Returns `true` if, while on the filter-(repository|lang) step,
 * the search query is a valid (repo|lang) filter followed by whitespace.
 * -
 */
const shouldAdvanceLangOrRepoStep = (currentTourStep: TourStepID | undefined, queryTokens: Token[]): boolean => {
    if (queryTokens.length !== 2) {
        return false
    }
    const [filterToken, whitespaceToken] = queryTokens
    if (filterToken.type !== 'filter' || whitespaceToken.type !== 'whitespace') {
        return false
    }
    if (currentTourStep === 'filter-repository') {
        return filterToken.field.value === 'repo' && filterToken.value !== undefined
    }
    if (currentTourStep === 'filter-lang') {
        return (
            filterToken.field.value === 'lang' &&
            filterToken.value?.type === 'literal' &&
            LANGUAGES.includes(filterToken.value?.value)
        )
    }
    return false
}

/**
 * Returns true if, while on the add-query-term step, the search query
 * contains a search pattern.
 */
const shouldShowSubmitSearch = (currentTourStep: TourStepID | undefined, queryTokens: Token[]): boolean =>
    currentTourStep === 'add-query-term' && queryTokens.some(({ type }) => type === 'pattern')

/**
 * A hook returning the current step ID of the Shepherd Tour.
 */
const useCurrentStep = (tour: Tour): TourStepID | undefined => {
    const [currentStep, setCurrentStep] = useState<TourStepID | undefined>()
    useEffect(() => {
        setCurrentStep(TOUR_STEPS.find(stepID => isEqual(tour.getCurrentStep(), tour.getById(stepID))))
        const listener = ({ step }: { step: Shepherd.Step }): void => {
            setCurrentStep(TOUR_STEPS.find(stepID => isEqual(step, tour.getById(stepID))))
        }
        tour.on('show', listener)
        return () => {
            tour.off('show', listener)
        }
    }, [tour, setCurrentStep])
    return currentStep
}

const generateStepDescription = (description: string): HTMLElement => {
    const element = document.createElement('div')
    element.className = 'tour-card__description text-monospace mr-3'
    element.textContent = description
    return element
}

const useTourWithSteps = ({ setQueryState }: Pick<UseSearchOnboardingTourOptions, 'setQueryState'>): Tour => {
    const tour = useMemo(() => new Shepherd.Tour(tourOptions), [])
    useEffect(() => {
        tour.addSteps([
            {
                id: 'start-tour',
                text: generateStep1(
                    tour,
                    () => {
                        setQueryState({ query: 'lang:' })
                        tour.show('filter-lang')
                    },
                    () => {
                        setQueryState({ query: 'repo:' })
                        tour.show('filter-repository')
                    }
                ),
                classes: 'tour-card--arrow-left-up',
                attachTo: {
                    element: '.search-page__input-container',
                    on: 'bottom',
                },
                popperOptions: {
                    modifiers: [{ name: 'offset', options: { offset: [100, 8] } }],
                },
            },
            {
                id: 'filter-lang',
                text: generateStep({
                    tour,
                    title: 'Enter a language',
                    stepNumber: 2,
                    additionalContent: generateStepDescription('Example: Python'),
                }),
                when: {
                    show() {
                        eventLogger.log('ViewedOnboardingTourFilterLangStep')
                    },
                },
                classes: 'tour-card--arrow-left-down',
                attachTo: {
                    element: '.search-page__input-container',
                    on: 'top',
                },
                popperOptions: {
                    modifiers: [{ name: 'offset', options: { offset: [100, 8] } }],
                },
            },
            {
                id: 'filter-repository',
                text: generateStep({
                    tour,
                    title: 'Enter a repository',
                    stepNumber: 2,
                    additionalContent: generateStepDescription('Example: sourcegraph/sourcegraph'),
                }),
                when: {
                    show() {
                        eventLogger.log('ViewedOnboardingTourFilterRepoStep')
                    },
                },
                classes: 'tour-card--arrow-left-down',
                attachTo: {
                    element: '.search-page__input-container',
                    on: 'top',
                },
                popperOptions: {
                    modifiers: [{ name: 'offset', options: { offset: [100, 8] } }],
                },
            },
            {
                id: 'add-query-term',
                text: generateStep({
                    tour,
                    title: 'Enter source code',
                    stepNumber: 3,
                    additionalContent: generateStepDescription('Example: []*Request'),
                }),
                when: {
                    show() {
                        eventLogger.log('ViewedOnboardingTourAddQueryTermStep')
                    },
                },
                classes: 'tour-card--arrow-left-up',
                attachTo: {
                    element: '.search-page__input-container',
                    on: 'bottom',
                },
                popperOptions: {
                    modifiers: [{ name: 'offset', options: { offset: [100, 8] } }],
                },
            },
            {
                id: 'submit-search',
                text: generateStep({
                    tour,
                    title: 'Search',
                    stepNumber: 4,
                    additionalContent: generateStepDescription('(Or press RETURN)'),
                }),
                when: {
                    show() {
                        eventLogger.log('ViewedOnboardingTourSubmitSearchStep')
                    },
                },
                classes: 'tour-card--arrow-right-down',
                attachTo: {
                    element: '.search-button',
                    on: 'top',
                },
                popperOptions: {
                    modifiers: [{ name: 'offset', options: { offset: [-170, 8] } }],
                },
                advanceOn: { selector: '.search-button__btn', event: 'click' },
            },
        ])
    }, [tour, setQueryState])
    return tour
}

interface UseSearchOnboardingTourOptions {
    /**
     * Whether the onboarding tour feature flag is enabled.
     */
    showOnboardingTour: boolean

    /**
     * A callback allowing the onboarding tour to trigger
     * updates to the search query.
     */
    setQueryState: (queryState: QueryState) => void

    /**
     * The query currently displayed in the query input.
     */
    queryState: QueryState
    history: H.History
    location: H.Location
}

/**
 * Represents the object returned by `useSearchOnboardingTour`.
 *
 * The subset of MonacoQueryInput props should be passed down to the input component.
 */
interface UseSearchOnboardingTourReturnValue
    extends Pick<MonacoQueryInputProps, 'onCompletionItemSelected' | 'onSuggestionsInitialized' | 'onFocus'> {
    /**
     * Whether the query input should be focused by default
     * (`false` on the search homepage when the tour is active).
     */
    shouldFocusQueryInput: boolean
    isSearchOnboardingTourActive: boolean
}

/**
 * A hook that handles displaying and running the search onboarding tour,
 * to be used in conjunction with the MonacoQueryInput.
 *
 * See {@link UseSearchOnboardingTourOptions} and {@link UseSearchOnboardingTourReturnValue}
 */
export const useSearchOnboardingTour = ({
    showOnboardingTour,
    queryState,
    setQueryState,
}: UseSearchOnboardingTourOptions): UseSearchOnboardingTourReturnValue => {
    const tour = useTourWithSteps({ setQueryState })
    // True when the user has manually cancelled the tour
    const [hasCancelledTour, setHasCancelledTour] = useLocalStorage(HAS_CANCELLED_TOUR_KEY, false)
    // True when the user has completed the tour on the search results page
    const [hasCompletedTour, setHasCompletedTour] = useLocalStorage(HAS_COMPLETED_TOUR_KEY, false)
    const shouldShowTour = useMemo(
        () => showOnboardingTour && daysActiveCount === 1 && !hasCancelledTour && !hasCompletedTour,
        [showOnboardingTour, hasCancelledTour, hasCompletedTour]
    )

    // Start the Tour when the query input is focused on the search homepage.
    const onFocus = useCallback(() => {
        if (shouldShowTour && !tour.isActive()) {
            tour.start()
        }
    }, [shouldShowTour, tour])

    // Hook into Tour cancellation and completion events.
    useEffect(() => {
        const onCancelled = (): void => {
            setHasCancelledTour(true)
        }
        const onCompleted = (): void => {
            setHasCompletedTour(true)
        }
        tour.on('cancel', onCancelled)
        tour.on('complete', onCompleted)
        return () => {
            tour.off('cancel', onCancelled)
            tour.off('complete', onCompleted)
        }
    }, [tour, setHasCompletedTour, setHasCancelledTour])

    // 'Complete' tour on unmount.
    // This will not necessarily result in HAS_COMPLETED_CODE_MONITOR
    // being set to true (see completion event handler).
    useEffect(
        () => () => {
            if (tour.isActive()) {
                tour.complete()
            }
        },
        [tour]
    )

    useEffect(() => {
        if (shouldShowTour) {
            eventLogger.log('ViewOnboardingTour')
        }
    }, [tour, shouldShowTour])

    // A handle allowing to trigger display of the MonacoQueryInput suggestions widget.
    const [suggestions, onSuggestionsInitialized] = useState<{ trigger: () => void }>()

    // On query or step changes, advance the Tour if appropriate.
    const currentStep = useCurrentStep(tour)
    const queryTokens = useMemo((): Token[] => {
        const scannedQuery = scanSearchQuery(queryState.query)
        return scannedQuery.type === 'success' ? scannedQuery.term : []
    }, [queryState.query])
    useEffect(() => {
        if (!tour.isActive()) {
            return
        }
        if (shouldTriggerSuggestions(currentStep, queryTokens)) {
            suggestions?.trigger()
        } else if (shouldAdvanceLangOrRepoStep(currentStep, queryTokens)) {
            tour.show('add-query-term')
        } else if (shouldShowSubmitSearch(currentStep, queryTokens)) {
            tour.show('submit-search')
        }
    }, [suggestions, queryTokens, tour, currentStep])

    // When a completion item is selected,
    // advance the repo or lang step if appropriate.
    const onCompletionItemSelected = useCallback(() => {
        if (shouldAdvanceLangOrRepoStep(currentStep, queryTokens)) {
            tour.show('add-query-term')
        }
    }, [queryTokens, tour, currentStep])

    return {
        onCompletionItemSelected,
        onFocus,
        onSuggestionsInitialized,
        shouldFocusQueryInput: !shouldShowTour,
        isSearchOnboardingTourActive: tour.isActive(),
    }
}
