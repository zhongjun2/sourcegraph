import * as H from 'history'
import * as React from 'react'
import * as GQL from '../../../../../shared/src/graphql/schema'
import SourcePullIcon from 'mdi-react/SourcePullIcon'
import { LinkOrSpan } from '../../../../../shared/src/components/LinkOrSpan'
import { ThemeProps } from '../../../../../shared/src/theme'
import { ExtensionsControllerProps } from '../../../../../shared/src/extensions/controller'
import { Hoverifier } from '@sourcegraph/codeintellify'
import { RepoSpec, RevSpec, FileSpec, ResolvedRevSpec } from '../../../../../shared/src/util/url'
import { HoverMerged } from '../../../../../shared/src/api/client/types/hover'
import { ActionItemAction } from '../../../../../shared/src/actions/ActionItem'
import { FileDiffConnection } from '../../../components/diff/FileDiffConnection'
import { FileDiffNode } from '../../../components/diff/FileDiffNode'
import { gql } from '../../../../../shared/src/graphql/graphql'
import { queryGraphQL } from '../../../backend/graphql'
import { FileDiffFields, FileDiffHunkRangeFields, DiffStatFields } from '../../../backend/diff'
import { map } from 'rxjs/operators'
import { createAggregateError } from '../../../../../shared/src/util/errors'
import { Observable } from 'rxjs'

interface Props extends ThemeProps {
    nodes: (GQL.IExternalChangeset | GQL.IChangesetPlan)[]
    persistLines?: boolean
    history: H.History
    location: H.Location
    extensionInfo?: {
        hoverifier: Hoverifier<RepoSpec & RevSpec & FileSpec & ResolvedRevSpec, HoverMerged, ActionItemAction>
    } & ExtensionsControllerProps
}

function queryDiffs(campaign: GQL.ID): (args: { first?: number }) => Observable<GQL.IFileDiffConnection> {
    return (args: { first?: number }) =>
        queryGraphQL(
            gql`
                query RepositoryComparisonDiff($campaign: ID!, $first: Int) {
                    node(id: $campaign) {
                        ... on Campaign {
                            repositoryDiffs(first: $first) {
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
                        ... on Repository {
                            comparison(base: $base, head: $head) {
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
            { ...args, campaign }
        ).pipe(
            map(({ data, errors }) => {
                if (!data || !data.node) {
                    throw createAggregateError(errors)
                }
                const repo = data.node as GQL.IRepository
                if (!repo.comparison || !repo.comparison.fileDiffs || errors) {
                    throw createAggregateError(errors)
                }
                return repo.comparison.fileDiffs
            })
        )
}

export const FileDiffTab: React.FunctionComponent<Props> = ({
    nodes,
    persistLines = true,
    isLightTheme,
    history,
    location,
    extensionInfo,
}) => (
    <>
        {nodes.map(
            (changesetNode, i) =>
                changesetNode.diff && (
                    <div key={i}>
                        <h3>
                            <SourcePullIcon className="icon-inline mr-2" />{' '}
                            <LinkOrSpan to={changesetNode.repository.url}>{changesetNode.repository.name}</LinkOrSpan>
                        </h3>
                        <FileDiffConnection
                            noun="changed file"
                            pluralNoun="changed files"
                            queryConnection={queryDiffs}
                            nodeComponent={FileDiffNode}
                            nodeComponentProps={{
                                isLightTheme,
                                lineNumbers: true,
                                persistLines,
                                history,
                                location,
                                extensionInfo:
                                    extensionInfo && changesetNode.__typename === 'ExternalChangeset'
                                        ? {
                                              ...extensionInfo,
                                              base: {
                                                  repoID: changesetNode.repository.id,
                                                  repoName: changesetNode.repository.name,
                                                  commitID: changesetNode.base.target.oid,
                                                  rev: changesetNode.base.target.oid,
                                              },
                                              head: {
                                                  repoID: changesetNode.repository.id,
                                                  repoName: changesetNode.repository.name,
                                                  commitID: changesetNode.head.target.oid,
                                                  rev: changesetNode.head.target.oid,
                                              },
                                          }
                                        : undefined,
                            }}
                            defaultFirst={100}
                            hideSearch={true}
                            noSummaryIfAllNodesVisible={true}
                            location={location}
                            history={history}
                        ></FileDiffConnection>
                    </div>
                )
        )}
    </>
)
