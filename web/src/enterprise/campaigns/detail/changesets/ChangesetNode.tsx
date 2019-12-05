import * as H from 'history'
import * as GQL from '../../../../../../shared/src/graphql/schema'
import React from 'react'
import SourcePullIcon from 'mdi-react/SourcePullIcon'
import {
    changesetStatusColorClasses,
    changesetReviewStateColors,
    changesetReviewStateIcons,
    changesetStageLabels,
} from './presentation'
import { Link } from '../../../../../../shared/src/components/Link'
import { LinkOrSpan } from '../../../../../../shared/src/components/LinkOrSpan'
import { ThemeProps } from '../../../../../../shared/src/theme'
import { Collapsible } from '../../../../components/Collapsible'
import { DiffStat } from '../../../../components/diff/DiffStat'
import { Hoverifier } from '@sourcegraph/codeintellify'
import { ExtensionsControllerProps } from '../../../../../../shared/src/extensions/controller'
import { RepoSpec, RevSpec, FileSpec, ResolvedRevSpec } from '../../../../../../shared/src/util/url'
import { HoverMerged } from '../../../../../../shared/src/api/client/types/hover'
import { ActionItemAction } from '../../../../../../shared/src/actions/ActionItem'
import { ChangesetDiffConnection } from '../ChangesetDiffConnection'

export interface ChangesetNodeProps extends ThemeProps {
    node: GQL.IExternalChangeset | GQL.IChangesetPlan
    history: H.History
    location: H.Location
    extensionInfo?: {
        hoverifier: Hoverifier<RepoSpec & RevSpec & FileSpec & ResolvedRevSpec, HoverMerged, ActionItemAction>
    } & ExtensionsControllerProps
}

export const ChangesetNode: React.FunctionComponent<ChangesetNodeProps> = ({
    node,
    isLightTheme,
    history,
    location,
    extensionInfo,
}) => {
    const fileDiffs = node.diff?.fileDiffs
    const ReviewStateIcon =
        node.__typename === 'ExternalChangeset'
            ? changesetReviewStateIcons[node.reviewState]
            : changesetReviewStateIcons[GQL.ChangesetReviewState.PENDING]
    return (
        <li className="list-group-item">
            <Collapsible
                title={
                    <div className="d-flex pl-1 align-items-center">
                        <div className="flex-shrink-0 flex-grow-0 m-1">
                            <SourcePullIcon
                                className={
                                    node.__typename === 'ExternalChangeset'
                                        ? `text-${changesetStatusColorClasses[node.state]}`
                                        : `text-${changesetStatusColorClasses[GQL.ChangesetState.OPEN]}`
                                }
                                data-tooltip={
                                    node.__typename === 'ExternalChangeset'
                                        ? changesetStageLabels[node.state]
                                        : changesetStageLabels[GQL.ChangesetState.OPEN]
                                }
                            />
                        </div>
                        {node.__typename === 'ExternalChangeset' && (
                            <div className="flex-shrink-0 flex-grow-0 m-1">
                                <ReviewStateIcon
                                    className={`text-${changesetReviewStateColors[node.reviewState]}`}
                                    data-tooltip={changesetStageLabels[node.reviewState]}
                                />
                            </div>
                        )}
                        <div className="flex-fill overflow-hidden m-1">
                            <h4 className="m-0">
                                <Link
                                    to={node.repository.url}
                                    className="text-muted"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {node.repository.name}
                                </Link>{' '}
                                {node.__typename === 'ExternalChangeset' && (
                                    <>
                                        <LinkOrSpan
                                            to={node.externalURL && node.externalURL.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {node.title}
                                        </LinkOrSpan>
                                        <div className="text-truncate w-100">{node.body}</div>
                                    </>
                                )}
                            </h4>
                            {fileDiffs && (
                                <DiffStat
                                    {...fileDiffs.diffStat}
                                    className="flex-shrink-0 flex-grow-0"
                                    expandedCounts={true}
                                ></DiffStat>
                            )}
                        </div>
                    </div>
                }
                wholeTitleClickable={false}
            >
                <ChangesetDiffConnection
                    node={node}
                    isLightTheme={isLightTheme}
                    history={history}
                    location={location}
                    extensionInfo={extensionInfo}
                ></ChangesetDiffConnection>
            </Collapsible>
        </li>
    )
}
