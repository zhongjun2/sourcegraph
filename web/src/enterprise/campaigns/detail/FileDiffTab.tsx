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
import { ChangesetDiffConnection } from './ChangesetDiffConnection'

interface Props extends ThemeProps {
    nodes: (GQL.IExternalChangeset | GQL.IChangesetPlan)[]
    history: H.History
    location: H.Location
    extensionInfo?: {
        hoverifier: Hoverifier<RepoSpec & RevSpec & FileSpec & ResolvedRevSpec, HoverMerged, ActionItemAction>
    } & ExtensionsControllerProps
}

export const FileDiffTab: React.FunctionComponent<Props> = ({
    nodes,
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
                        <ChangesetDiffConnection
                            node={changesetNode}
                            isLightTheme={isLightTheme}
                            extensionInfo={extensionInfo}
                            location={location}
                            history={history}
                        ></ChangesetDiffConnection>
                    </div>
                )
        )}
    </>
)
