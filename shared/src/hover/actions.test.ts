import { HoveredToken, LOADER_DELAY } from '@sourcegraph/codeintellify'
import { Location } from '@sourcegraph/extension-api-types'
import { createMemoryHistory } from 'history'
import { BehaviorSubject, from, Observable, of, throwError } from 'rxjs'
import { first, map } from 'rxjs/operators'
import { TestScheduler } from 'rxjs/testing'
import * as sinon from 'sinon'
import { ActionItemAction } from '../actions/ActionItem'
import { Services } from '../api/client/services'
import { CommandRegistry } from '../api/client/services/command'
import { ContributionRegistry } from '../api/client/services/contribution'
import { createTestEditorService } from '../api/client/services/editorService.test'
import { ProvideTextDocumentLocationSignature } from '../api/client/services/location'
import { WorkspaceRootWithMetadata, WorkspaceService } from '../api/client/services/workspaceService'
import { ContributableMenu, ReferenceParams, TextDocumentPositionParams } from '../api/protocol'
import { PrivateRepoPublicSourcegraphComError } from '../backend/errors'
import { getContributedActionItems } from '../contributions/contributions'
import { SuccessGraphQLResult } from '../graphql/graphql'
import { IMutation, IQuery } from '../graphql/schema'
import { PlatformContext } from '../platform/context'
import { EMPTY_SETTINGS_CASCADE } from '../settings/settings'
import { resetAllMemoizationCaches } from '../util/memoizeObservable'
import { FileSpec, PositionSpec, RawRepoSpec, RepoSpec, RevSpec, toPrettyBlobURL, ViewStateSpec } from '../util/url'
import { getDefinitionURL, getHoverActionsContext, HoverActionsContext, registerHoverContributions } from './actions'
import { HoverContext } from './HoverOverlay'

const FIXTURE_PARAMS: TextDocumentPositionParams = {
    textDocument: { uri: 'git://r?c#f' },
    position: { line: 1, character: 1 },
}

const FIXTURE_LOCATION: Location = {
    uri: 'git://r2?c2#f2',
    range: {
        start: { line: 2, character: 2 },
        end: { line: 3, character: 3 },
    },
}

const FIXTURE_HOVER_CONTEXT: HoveredToken & HoverContext = {
    repoName: 'r',
    commitID: 'c',
    rev: 'v',
    filePath: 'f',
    line: 2,
    character: 2,
}

function testWorkspaceService(
    roots: readonly WorkspaceRootWithMetadata[] = [{ uri: 'git://r3?c3', inputRevision: 'v3' }]
): WorkspaceService {
    return { roots: new BehaviorSubject(roots) }
}

// Use toPrettyBlobURL as the urlToFile passed to these functions because it results in the most readable/familiar
// expected test output.
const urlToFile = toPrettyBlobURL
const requestGraphQL: PlatformContext['requestGraphQL'] = <R extends IQuery | IMutation>({
    variables,
}: {
    variables: { [key: string]: any }
}) =>
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    of({
        data: {
            repository: {
                uri: variables.repoName,
                mirrorInfo: {
                    cloned: true,
                },
            },
        },
    } as SuccessGraphQLResult<R>)

const scheduler = (): TestScheduler => new TestScheduler((a, b) => expect(a).toEqual(b))

describe('getHoverActionsContext', () => {
    beforeEach(() => resetAllMemoizationCaches())
    test('shows a loader for the definition if slow', () =>
        scheduler().run(({ cold, expectObservable }) =>
            expectObservable(
                from(
                    getHoverActionsContext(
                        {
                            extensionsController: {
                                services: {
                                    workspace: testWorkspaceService(),
                                    textDocumentDefinition: {
                                        getLocations: () =>
                                            cold<Observable<Location[]>>(`- ${LOADER_DELAY}ms --- d`, {
                                                d: of([FIXTURE_LOCATION]),
                                            }),
                                    },
                                    textDocumentReferences: {
                                        providersForDocument: () =>
                                            cold<ProvideTextDocumentLocationSignature<ReferenceParams, Location>[]>(
                                                'a',
                                                { a: [() => of(null)] }
                                            ),
                                    },
                                },
                            },
                            platformContext: { urlToFile, requestGraphQL },
                        },
                        FIXTURE_HOVER_CONTEXT
                    )
                )
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            ).toBe(`a ${LOADER_DELAY - 1}ms (bc)d`, {
                a: {
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                },
                b: {
                    'goToDefinition.showLoading': true,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                },
                c: {
                    'goToDefinition.showLoading': true,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': '/r@v/-/blob/f#L2:2&tab=references',
                    hoverPosition: FIXTURE_PARAMS,
                },
                d: {
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': '/r2@c2/-/blob/f2#L3:3',
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': '/r@v/-/blob/f#L2:2&tab=references',
                    hoverPosition: FIXTURE_PARAMS,
                },
            } as { [key: string]: HoverActionsContext })
        ))

    test('shows no loader for the definition if fast', () =>
        scheduler().run(({ cold, expectObservable }) =>
            expectObservable(
                from(
                    getHoverActionsContext(
                        {
                            extensionsController: {
                                services: {
                                    workspace: testWorkspaceService(),
                                    textDocumentDefinition: {
                                        getLocations: () =>
                                            cold<Observable<Location[]>>('-b', { b: of([FIXTURE_LOCATION]) }),
                                    },
                                    textDocumentReferences: {
                                        providersForDocument: () =>
                                            cold<ProvideTextDocumentLocationSignature<ReferenceParams, Location>[]>(
                                                'a',
                                                { a: [() => of(null)] }
                                            ),
                                    },
                                },
                            },
                            platformContext: { urlToFile, requestGraphQL },
                        },
                        FIXTURE_HOVER_CONTEXT
                    )
                )
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            ).toBe('a(bc)', {
                a: {
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                },
                b: {
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': '/r2@c2/-/blob/f2#L3:3',
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                },
                c: {
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': '/r2@c2/-/blob/f2#L3:3',
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': '/r@v/-/blob/f#L2:2&tab=references',
                    hoverPosition: FIXTURE_PARAMS,
                },
            } as { [key: string]: HoverActionsContext })
        ))
})

describe('getDefinitionURL', () => {
    beforeEach(() => resetAllMemoizationCaches())
    test('emits null if the locations result is null', () =>
        expect(
            getDefinitionURL(
                { urlToFile, requestGraphQL },
                {
                    workspace: testWorkspaceService(),
                    textDocumentDefinition: { getLocations: () => of(of(null)) },
                },
                FIXTURE_PARAMS
            )
                .pipe(first())
                .toPromise()
        ).resolves.toBe(null))

    test('emits null if the locations result is empty', () =>
        expect(
            getDefinitionURL(
                { urlToFile, requestGraphQL },
                {
                    workspace: testWorkspaceService(),
                    textDocumentDefinition: { getLocations: () => of(of([])) },
                },
                FIXTURE_PARAMS
            )
                .pipe(first())
                .toPromise()
        ).resolves.toBe(null))

    describe('if there is exactly 1 location result', () => {
        test('resolves the raw repo name and passes it to urlToFile()', async () => {
            const requestGraphQL = <R extends IQuery | IMutation>({
                variables,
            }: {
                [key: string]: any
            }): Observable<SuccessGraphQLResult<R>> =>
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                of({
                    data: {
                        repository: {
                            uri: `github.com/${variables.repoName}`,
                            mirrorInfo: {
                                cloned: true,
                            },
                        },
                    },
                } as SuccessGraphQLResult<R>)
            const urlToFile = sinon.spy(
                (
                    location: RepoSpec &
                        Partial<RawRepoSpec> &
                        RevSpec &
                        FileSpec &
                        Partial<PositionSpec> &
                        Partial<ViewStateSpec>
                ) => ''
            )
            await getDefinitionURL(
                { urlToFile, requestGraphQL },
                {
                    workspace: testWorkspaceService(),
                    textDocumentDefinition: {
                        getLocations: () => of<Observable<Location[]>>(of([{ uri: 'git://r3?c3#f' }])),
                    },
                },
                FIXTURE_PARAMS
            )
                .pipe(first())
                .toPromise()
            sinon.assert.calledOnce(urlToFile)
            expect(urlToFile.getCalls()[0].args[0]).toMatchObject({
                filePath: 'f',
                position: undefined,
                rawRepoName: 'github.com/r3',
                repoName: 'r3',
                rev: 'v3',
            })
        })

        test('fails gracefully when resolveRawRepoName() fails with a PrivateRepoPublicSourcegraph error', async () => {
            const requestGraphQL = (): Observable<never> =>
                throwError(new PrivateRepoPublicSourcegraphComError('ResolveRawRepoName'))
            const urlToFile = sinon.spy()
            await getDefinitionURL(
                { urlToFile, requestGraphQL },
                {
                    workspace: testWorkspaceService(),
                    textDocumentDefinition: {
                        getLocations: () => of<Observable<Location[]>>(of([{ uri: 'git://r3?c3#f' }])),
                    },
                },
                FIXTURE_PARAMS
            )
                .pipe(first())
                .toPromise()
            sinon.assert.calledOnce(urlToFile)
            sinon.assert.calledWith(urlToFile, {
                commitID: undefined,
                filePath: 'f',
                position: undefined,
                range: undefined,
                rawRepoName: 'r3',
                repoName: 'r3',
                rev: 'v3',
            })
        })

        describe('when the result is inside the current root', () => {
            test('emits the definition URL the user input revision (not commit SHA) of the root', () =>
                expect(
                    getDefinitionURL(
                        { urlToFile, requestGraphQL },
                        {
                            workspace: testWorkspaceService(),
                            textDocumentDefinition: {
                                getLocations: () => of<Observable<Location[]>>(of([{ uri: 'git://r3?c3#f' }])),
                            },
                        },
                        FIXTURE_PARAMS
                    )
                        .pipe(first())
                        .toPromise()
                ).resolves.toEqual({ url: '/r3@v3/-/blob/f', multiple: false }))
        })

        describe('when the result is not inside the current root (different repo and/or commit)', () => {
            test('emits the definition URL with range', () =>
                expect(
                    getDefinitionURL(
                        { urlToFile, requestGraphQL },
                        {
                            workspace: testWorkspaceService(),
                            textDocumentDefinition: {
                                getLocations: () => of<Observable<Location[]>>(of([FIXTURE_LOCATION])),
                            },
                        },
                        FIXTURE_PARAMS
                    )
                        .pipe(first())
                        .toPromise()
                ).resolves.toEqual({ url: '/r2@c2/-/blob/f2#L3:3', multiple: false }))

            test('emits the definition URL without range', () =>
                expect(
                    getDefinitionURL(
                        { urlToFile, requestGraphQL },
                        {
                            workspace: testWorkspaceService(),
                            textDocumentDefinition: {
                                getLocations: () =>
                                    of<Observable<Location[]>>(of([{ ...FIXTURE_LOCATION, range: undefined }])),
                            },
                        },
                        FIXTURE_PARAMS
                    )
                        .pipe(first())
                        .toPromise()
                ).resolves.toEqual({ url: '/r2@c2/-/blob/f2', multiple: false }))
        })
    })

    test('emits the definition panel URL if there is more than 1 location result', () =>
        expect(
            getDefinitionURL(
                { urlToFile, requestGraphQL },
                {
                    workspace: testWorkspaceService([{ uri: 'git://r?c', inputRevision: 'v' }]),
                    textDocumentDefinition: {
                        getLocations: () =>
                            of<Observable<Location[]>>(of([FIXTURE_LOCATION, { ...FIXTURE_LOCATION, uri: 'other' }])),
                    },
                },
                FIXTURE_PARAMS
            )
                .pipe(first())
                .toPromise()
        ).resolves.toEqual({ url: '/r@v/-/blob/f#L2:2&tab=def', multiple: true }))
})

describe('registerHoverContributions()', () => {
    beforeEach(() => resetAllMemoizationCaches())
    const contribution = new ContributionRegistry(
        createTestEditorService({}),
        {
            getPartialModel: () => ({ languageId: 'x' }),
        },
        { data: of(EMPTY_SETTINGS_CASCADE) },
        of({})
    )
    const commands = new CommandRegistry()
    const textDocumentDefinition: Pick<Services['textDocumentDefinition'], 'getLocations'> = {
        getLocations: () => of(of(null)),
    }
    const history = createMemoryHistory()
    const subscription = registerHoverContributions({
        extensionsController: {
            services: {
                contribution,
                commands,
                workspace: testWorkspaceService(),
                textDocumentDefinition,
            },
        },
        platformContext: { urlToFile, requestGraphQL },
        history,
    })
    afterAll(() => subscription.unsubscribe())

    const getHoverActions = (context: HoverActionsContext): Promise<ActionItemAction[]> =>
        contribution
            .getContributions(undefined, context)
            .pipe(
                first(),
                map(contributions => getContributedActionItems(contributions, ContributableMenu.Hover))
            )
            .toPromise()

    describe('getHoverActions()', () => {
        const GO_TO_DEFINITION_ACTION: ActionItemAction = {
            action: {
                command: 'goToDefinition',
                commandArguments: ['{"textDocument":{"uri":"git://r?c#f"},"position":{"line":1,"character":1}}'],
                id: 'goToDefinition',
                title: 'Go to definition',
                actionItem: undefined,
                category: undefined,
                description: undefined,
                iconURL: undefined,
            },
            altAction: undefined,
        }
        const GO_TO_DEFINITION_PRELOADED_ACTION: ActionItemAction = {
            action: {
                command: 'open',
                commandArguments: ['/r2@c2/-/blob/f2#L3:3'],
                id: 'goToDefinition.preloaded',
                title: 'Go to definition',
            },
            altAction: undefined,
        }
        const FIND_REFERENCES_ACTION: ActionItemAction = {
            action: {
                command: 'open',
                commandArguments: ['/r@v/-/blob/f#L2:2&tab=references'],
                id: 'findReferences',
                title: 'Find references',
            },
            altAction: undefined,
        }

        it('shows goToDefinition (non-preloaded) when the definition is loading', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': true,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([GO_TO_DEFINITION_ACTION]))

        it('shows goToDefinition (non-preloaded) when the definition had an error', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': true,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([GO_TO_DEFINITION_ACTION]))

        it('hides goToDefinition when the definition was not found', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': true,
                    'goToDefinition.error': false,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([]))

        it('shows goToDefinition.preloaded when goToDefinition.url is available', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': '/r2@c2/-/blob/f2#L3:3',
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': null,
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([GO_TO_DEFINITION_PRELOADED_ACTION]))

        it('shows findReferences when the definition exists', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': '/r2@c2/-/blob/f2#L3:3',
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': '/r@v/-/blob/f#L2:2&tab=references',
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([GO_TO_DEFINITION_PRELOADED_ACTION, FIND_REFERENCES_ACTION]))

        it('hides findReferences when the definition might exist (and is still loading)', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': true,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': false,
                    'findReferences.url': '/r@v/-/blob/f#L2:2&tab=references',
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([GO_TO_DEFINITION_ACTION, FIND_REFERENCES_ACTION]))

        it('shows findReferences when the definition had an error', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': false,
                    'goToDefinition.error': true,
                    'findReferences.url': '/r@v/-/blob/f#L2:2&tab=references',
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([GO_TO_DEFINITION_ACTION, FIND_REFERENCES_ACTION]))

        it('does not show findReferences when the definition was not found', () =>
            expect(
                getHoverActions({
                    'goToDefinition.showLoading': false,
                    'goToDefinition.url': null,
                    'goToDefinition.notFound': true,
                    'goToDefinition.error': false,
                    'findReferences.url': '/r@v/-/blob/f#L2:2&tab=references',
                    hoverPosition: FIXTURE_PARAMS,
                })
            ).resolves.toEqual([]))
    })

    describe('goToDefinition command', () => {
        test('reports no definition found', async () => {
            textDocumentDefinition.getLocations = () => of(of(null)) // mock
            await expect(
                commands.executeCommand({ command: 'goToDefinition', arguments: [JSON.stringify(FIXTURE_PARAMS)] })
            ).rejects.toMatchObject({ message: 'No definition found.' })
        })

        test('reports panel already visible', async () => {
            textDocumentDefinition.getLocations = () =>
                of(of([FIXTURE_LOCATION, { ...FIXTURE_LOCATION, uri: 'git://r3?v3#f3' }])) // mock
            history.push('/r@c/-/blob/f#L2:2&tab=def')
            await expect(
                commands.executeCommand({ command: 'goToDefinition', arguments: [JSON.stringify(FIXTURE_PARAMS)] })
            ).rejects.toMatchObject({ message: 'Multiple definitions shown in panel below.' })
        })

        test('reports already at the definition', async () => {
            textDocumentDefinition.getLocations = () => of(of([FIXTURE_LOCATION])) // mock
            history.push('/r2@c2/-/blob/f2#L3:3')
            await expect(
                commands.executeCommand({ command: 'goToDefinition', arguments: [JSON.stringify(FIXTURE_PARAMS)] })
            ).rejects.toMatchObject({ message: 'Already at the definition.' })
        })
    })
})
