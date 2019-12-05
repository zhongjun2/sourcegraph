import * as H from 'history'
import * as GQL from '../../../../../shared/src/graphql/schema'
import React, { useMemo } from 'react'
import { ThemeProps } from '../../../../../shared/src/theme'
import { FileDiffConnection } from '../../../components/diff/FileDiffConnection'
import { Hoverifier } from '@sourcegraph/codeintellify'
import { ExtensionsControllerProps } from '../../../../../shared/src/extensions/controller'
import { RepoSpec, RevSpec, FileSpec, ResolvedRevSpec } from '../../../../../shared/src/util/url'
import { HoverMerged } from '../../../../../shared/src/api/client/types/hover'
import { ActionItemAction } from '../../../../../shared/src/actions/ActionItem'
import { FileDiffNode } from '../../../components/diff/FileDiffNode'
import { createAggregateError } from '../../../../../shared/src/util/errors'
import { queryGraphQL } from '../../../backend/graphql'
import { Observable } from 'rxjs'
import { FileDiffFields, FileDiffHunkRangeFields, DiffStatFields } from '../../../backend/diff'
import { map } from 'rxjs/operators'
import { gql } from '../../../../../shared/src/graphql/graphql'

export interface ExternalChangesetDiffConnectionProps extends ThemeProps {
    node: GQL.IExternalChangeset | GQL.IChangesetPlan
    history: H.History
    location: H.Location
    extensionInfo?: {
        hoverifier: Hoverifier<RepoSpec & RevSpec & FileSpec & ResolvedRevSpec, HoverMerged, ActionItemAction>
    } & ExtensionsControllerProps
}

export const ExternalChangesetDiffConnection: React.FunctionComponent<ExternalChangesetDiffConnectionProps> = ({
    node,
    isLightTheme,
    history,
    location,
    extensionInfo,
}) => {
    const queryExternalChangesetFileDiffs = useMemo(
        () =>
            function queryExternalChangesetFileDiffs(args: { first?: number }): Observable<GQL.IFileDiffConnection> {
                return queryGraphQL(
                    gql`
                        query ExternalChangesets($changeset: ID!, $first: Int) {
                            node(id: $changeset) {
                                __typename
                                ... on ExternalChangeset {
                                    diff {
                                        fileDiffs(first: $first) {
                                            nodes {
                                                ...FileDiffFields
                                            }
                                            totalCount
                                            pageInfo {
                                                hasNextPage
                                            }
                                            diffStat {
                                                ...DiffStatFields
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        ${FileDiffFields}

                        ${FileDiffHunkRangeFields}

                        ${DiffStatFields}
                    `,
                    { ...args, changeset: (node as GQL.IExternalChangeset).id }
                ).pipe(
                    map(({ data, errors }) => {
                        if (!data || !data.node) {
                            throw createAggregateError(errors)
                        }
                        const repo = data.node as GQL.IExternalChangeset
                        if (!repo.diff || !repo.diff.fileDiffs || errors) {
                            throw createAggregateError(errors)
                        }
                        return { ...repo.diff.fileDiffs, totalCount: 10 }
                    })
                )
            },
        []
    )
    const augmentedExtensionInfo = useMemo(
        () =>
            extensionInfo && node.__typename === 'ExternalChangeset'
                ? {
                      ...extensionInfo,
                      base: {
                          repoID: node.repository.id,
                          repoName: node.repository.name,
                          commitID: node.base.target.oid,
                          rev: node.base.target.oid,
                      },
                      head: {
                          repoID: node.repository.id,
                          repoName: node.repository.name,
                          commitID: node.head.target.oid,
                          rev: node.head.target.oid,
                      },
                  }
                : undefined,
        []
    )
    return (
        <FileDiffConnection
            noun="changed file"
            pluralNoun="changed files"
            queryConnection={queryExternalChangesetFileDiffs}
            nodeComponent={FileDiffNode}
            nodeComponentProps={{
                isLightTheme,
                history,
                location,
                lineNumbers: true,
                extensionInfo: augmentedExtensionInfo,
                persistLines: node.__typename === 'ExternalChangeset',
            }}
            defaultFirst={25}
            hideSearch={true}
            useURLQuery={false}
            noSummaryIfAllNodesVisible={true}
            location={location}
            history={history}
        ></FileDiffConnection>
    )
}
