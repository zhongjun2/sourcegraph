import { startCase } from 'lodash'
import puppeteer from 'puppeteer'
import { saveScreenshotsUponFailures } from '../../../shared/src/e2e/screenshotReporter'
import { createDriverForTest, Driver, percySnapshot } from '../../../shared/src/e2e/driver'
import { getConfig } from '../../../shared/src/e2e/config'

const BROWSER: 'chrome' | 'firefox' = (process.env.E2E_BROWSER as 'chrome' | 'firefox') || 'chrome'

async function getTokenWithSelector(
    page: puppeteer.Page,
    token: string,
    selector: string
): Promise<puppeteer.ElementHandle> {
    const elements = await page.$$(selector)

    let element: puppeteer.ElementHandle | undefined
    for (const elem of elements) {
        const text = await page.evaluate(element => element.textContent, elem)
        if (text === token) {
            element = elem
            break
        }
    }

    if (!element) {
        throw new Error(`Unable to find token '${token}' with selector ${selector}`)
    }

    return element
}

async function clickElement(page: puppeteer.Page, element: puppeteer.ElementHandle): Promise<void> {
    // Wait for JS to be evaluated (https://github.com/GoogleChrome/puppeteer/issues/1805#issuecomment-357999249).
    await page.waitFor(500)
    await element.click()
}

const { sourcegraphBaseUrl } = getConfig('sourcegraphBaseUrl')

describe(`Sourcegraph ${startCase(BROWSER)} extension`, () => {
    let driver: Driver

    // Open browser.
    before(async function() {
        this.timeout(90 * 1000)
        driver = await createDriverForTest({
            sourcegraphBaseUrl,
            loadExtension: true,
            logBrowserConsole: true,
            browserVendor: BROWSER,
        })
        if (BROWSER === 'chrome') {
            await driver.page.setBypassCSP(true)
        }
    })

    // Close browser.
    after('Close browser', async () => {
        if (driver) {
            await driver.close()
        }
    })

    // Take a screenshot when a test fails.
    saveScreenshotsUponFailures(() => driver.page)

    const repoBaseURL = 'https://github.com/gorilla/mux'

    it('injects View on Sourcegraph', async () => {
        await driver.page.goto(repoBaseURL)
        await driver.page.waitForSelector('li#open-on-sourcegraph', { timeout: 30000 })
        await percySnapshot(driver.page, `Injects View on Sourcegraph: ${BROWSER}`)
    })

    it('injects toolbar for code views', async () => {
        await driver.page.goto('https://github.com/gorilla/mux/blob/master/mux.go')
        await driver.page.waitForSelector('.code-view-toolbar')
        await percySnapshot(driver.page, `Injects toolbar for code views: ${BROWSER}`)
    })

    it('provides tooltips for single file', async () => {
        await driver.page.goto('https://github.com/gorilla/mux/blob/master/mux.go')

        await driver.page.waitForSelector('.code-view-toolbar')
        const element = await getTokenWithSelector(driver.page, 'NewRouter', 'span.pl-en')

        await clickElement(driver.page, element)

        await driver.page.waitForSelector('.e2e-tooltip-go-to-definition')
        await percySnapshot(driver.page, `Provides tooltips for single file: ${BROWSER}`)
    })

    const tokens = {
        base: { text: 'matchHost', selector: 'span.pl-s1' },
        head: { text: 'typ', selector: 'span.pl-s1' },
    }

    for (const diffType of ['unified', 'split']) {
        for (const side of ['base' /* , 'head'*/] as const) {
            it(`provides tooltips for diff files (${diffType}, ${side})`, async () => {
                await driver.page.goto(`https://github.com/gorilla/mux/pull/328/files?diff=${diffType}`)

                const token = tokens[side]
                const element = await getTokenWithSelector(driver.page, token.text, token.selector)

                // Scrolls the element into view so that code view is in view.
                await element.hover()
                await driver.page.waitForSelector('[data-path="regexp.go"] .code-view-toolbar .open-on-sourcegraph')
                await clickElement(driver.page, element)
                await driver.page.waitForSelector('.e2e-tooltip-go-to-definition')
                await percySnapshot(driver.page, `Provides tooltips for diff files (${diffType}, ${side}): ${BROWSER}`)
            })
        }
    }
})
