import React, { useCallback, useState } from 'react'
import { ExtensionsControllerProps } from '../../../../../shared/src/extensions/controller'
import Form, { ISubmitEvent, IChangeEvent, Field } from 'react-jsonschema-form'
import { FormContribution } from '../../../../../shared/src/api/protocol'
import { Markdown } from '../../../../../shared/src/components/Markdown'
import { renderMarkdown } from '../../../../../shared/src/util/markdown'

interface Props extends ExtensionsControllerProps<'services'> {
    form: FormContribution
}

type FormData = object

const FIELDS: { [name: string]: Field } = {
    DescriptionField: ({ description }) =>
        description ? (
            <Markdown
                className="form-text small mt-0 mb-1 text-muted"
                dangerousInnerHTML={renderMarkdown(description)}
            />
        ) : (
            <span />
        ),
}

/**
 * A form that is displayed in a view (contributed by an extension).
 */
export const ViewForm: React.FunctionComponent<Props> = ({ form, extensionsController }) => {
    const [formData, setFormData] = useState<FormData | undefined>()

    const onFormChange = useCallback(
        (e: IChangeEvent<FormData>) => {
            setFormData(e.formData)

            const { change } = form
            if (change) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                ;(async () =>
                    extensionsController.services.commands.executeCommand({
                        command: change,
                        arguments: [e.formData],
                    }))()
            }
        },
        [extensionsController.services.commands, form]
    )

    const onFormSubmit = useCallback(
        (e: ISubmitEvent<FormData>) => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            ;(async () =>
                extensionsController.services.commands.executeCommand({
                    command: form.submit.command,
                    arguments: [e.formData],
                }))()
        },
        [extensionsController.services.commands, form]
    )

    return (
        <Form<FormData>
            schema={form.schema}
            uiSchema={form.uiSchema}
            formData={formData}
            onChange={onFormChange}
            onSubmit={onFormSubmit}
            fields={FIELDS}
        >
            {form.submit.label !== undefined && (
                <button type="submit" className="btn btn-primary">
                    {form.submit.label}
                </button>
            )}
        </Form>
    )
}
