import { join, resolve } from 'node:path'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { FluentBundle, FluentResource } from '@fluent/bundle'
import { negotiateLanguages } from '@fluent/langneg'
import AppConstants from '../app-constants.js'

const supportedLocales = AppConstants.SUPPORTED_LOCALES?.split(',')
const fluentBundles = {}
let appLocale // set during a request

/**
* Create Fluent bundles for all supported locales.
* Reads .ftl files in parallel for better server start performance.
*/
async function initFluentBundles () {
  const promises = supportedLocales.map(async locale => {
    const bundle = new FluentBundle(locale, { useIsolating: false })
    const dirname = resolve('../locales', locale)

    try {
      const filenames = readdirSync(dirname).filter(item => item.endsWith('.ftl'))

      await Promise.all(filenames.map(async filename => {
        const str = await readFile(join(dirname, filename), 'utf8')

        bundle.addResource(new FluentResource(str))
      }))
    } catch (e) {
      console.error('Could not read Fluent file:', e)
      throw new Error(e)
    }

    fluentBundles[locale] = bundle
  })

  await Promise.allSettled(promises)

  console.log('Fluent bundles created:', Object.keys(fluentBundles))
}

/**
* Set the locale used for translations negotiated between requested and available
* @param {Array} requestedLocales - Locales requested by client.
*/
function updateAppLocale (requestedLocales) {
  appLocale = negotiateLanguages(
    requestedLocales,
    supportedLocales,
    { strategy: 'lookup', defaultLocale: 'en' }
  )

  return appLocale
}

/**
* Translate a message and return the raw string
* Defaults to en if message id not found in requested locale
* @param {string} id - The Fluent message id.
*/
function getRawMessage (id) {
  let bundle = fluentBundles[appLocale]

  if (!bundle.hasMessage(id)) bundle = fluentBundles.en

  if (bundle.hasMessage(id)) return bundle.getMessage(id).value

  return id
}

/**
* Translate and transform a message pattern
* Defaults to en if message id not found in requested locale
* @param {string} id - The Fluent message id.
* @param {object} args - key/value pairs corresponding to pattern in Fluent resource.
* @example
* // Given FluentResource("hello = Hello, {$name}!")
* getMessage (hello, {name: "Jane"})
* // Returns "Hello, Jane!"
*/
function getMessage (id, args) {
  let bundle = fluentBundles[appLocale]

  if (!bundle.hasMessage(id)) bundle = fluentBundles.en

  if (bundle.hasMessage(id)) return bundle.formatPattern(bundle.getMessage(id).value, args)

  return id
}

function fluentError (id) {
  return new Error(getMessage(id))
}

export { initFluentBundles, updateAppLocale, getMessage, getRawMessage, fluentError }
