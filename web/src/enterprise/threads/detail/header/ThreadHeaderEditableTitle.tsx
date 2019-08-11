import React, { useCallback, useState } from 'react'
import { NotificationType } from '../../../../../../shared/src/api/client/services/notifications'
import { ExtensionsControllerNotificationProps } from '../../../../../../shared/src/extensions/controller'
import * as GQL from '../../../../../../shared/src/graphql/schema'
import { Form } from '../../../../components/Form'
import { updateThread } from '../../common/EditThreadForm'

interface Props extends ExtensionsControllerNotificationProps {
    thread: Pick<GQL.IThread, 'id' | 'number' | 'title'>
    onThreadUpdate: () => void
    className?: string

    /** Provided by tests only. */
    _updateThread?: typeof updateThread
}

/**
 * The title in the thread header, which has an edit mode.
 */
// tslint:disable: jsx-no-lambda
export const ThreadHeaderEditableTitle: React.FunctionComponent<Props> = ({
    thread,
    onThreadUpdate,
    className = '',
    extensionsController,
    _updateThread = updateThread,
}) => {
    const [state, setState] = useState<'viewing' | 'editing' | 'loading'>('viewing')
    const [uncommittedTitle, setUncommittedTitle] = useState(thread.title)

    const onSubmit: React.FormEventHandler = async e => {
        e.preventDefault()
        setState('loading')
        try {
            await _updateThread({ id: thread.id, title: uncommittedTitle })
            onThreadUpdate()
        } catch (err) {
            extensionsController.services.notifications.showMessages.next({
                message: `Error editing thread title: ${err.message}`,
                type: NotificationType.Error,
            })
        } finally {
            setState('viewing')
        }
    }

    const onEditClick = useCallback(() => setState('editing'), [])
    const onCancelClick = useCallback<React.MouseEventHandler>(
        e => {
            e.preventDefault()
            setState('viewing')
            setUncommittedTitle(thread.title)
        },
        [thread.title]
    )

    return state === 'viewing' ? (
        <div className={`d-flex align-items-start justify-content-between ${className}`}>
            <h1 className="font-weight-normal mb-0 h2 mr-2">
                {thread.title} <span className="text-muted font-weight-normal">#{thread.number}</span>
            </h1>
            <button type="button" className="btn btn-secondary btn-sm mt-1" onClick={onEditClick}>
                Edit
            </button>
        </div>
    ) : (
        <Form className={`form d-flex ${className}`} onSubmit={onSubmit}>
            <input
                type="text"
                className="form-control flex-1 mr-2"
                value={uncommittedTitle}
                onChange={e => setUncommittedTitle(e.currentTarget.value)}
                placeholder="Title"
                autoComplete="off"
                autoFocus={true}
                disabled={state === 'loading'}
            />
            <div className="text-nowrap flex-0 d-flex align-items-center">
                <button type="submit" className="btn btn-success" disabled={state === 'loading'}>
                    Save
                </button>
                <button type="reset" className="btn btn-link" onClick={onCancelClick} disabled={state === 'loading'}>
                    Cancel
                </button>
            </div>
        </Form>
    )
}