#!/usr/bin/env bun

import { createInterface } from "node:readline/promises"
import { readFile, writeFile } from "node:fs/promises"
import { stdin as input, stdout as output } from "node:process"
import { join } from "node:path"

const rootDir = process.cwd()

const parseJsonc = source => JSON.parse(source.replace(/,\s*([}\]])/g, "$1"))

const writeJson = async (filePath, value) => {
	await writeFile(filePath, `${JSON.stringify(value, null, "\t")}\n`)
}

const readCurrentValues = async () => {
	const wranglerPath = join(rootDir, "wrangler.jsonc")
	const configPath = join(rootDir, "src/lib/server/config.ts")

	const wrangler = parseJsonc(await readFile(wranglerPath, "utf8"))
	const configSource = await readFile(configPath, "utf8")
	const appNameMatch = configSource.match(/appName:\s*"([^"]*)"/)

	return {
		appName: appNameMatch?.[1] ?? "",
		databaseId: wrangler.env?.production?.d1_databases?.[0]?.database_id ?? "",
		databaseName:
			wrangler.env?.production?.d1_databases?.[0]?.database_name ?? "",
		sessionCookieDomain:
			wrangler.env?.production?.vars?.SESSION_COOKIE_DOMAIN ?? "",
		workerName: wrangler.env?.production?.name ?? "",
	}
}

const promptWithDefault = async (rl, label, defaultValue) => {
	const suffix = defaultValue ? ` [${defaultValue}]` : ""

	while (true) {
		const value = (await rl.question(`${label}${suffix}: `)).trim()

		if (value) {
			return value
		}

		if (defaultValue) {
			return defaultValue
		}
	}
}

const updateFiles = async values => {
	const wranglerPath = join(rootDir, "wrangler.jsonc")
	const packageJsonPath = join(rootDir, "package.json")
	const configPath = join(rootDir, "src/lib/server/config.ts")

	const wrangler = parseJsonc(await readFile(wranglerPath, "utf8"))

	if (!wrangler.env?.production) {
		throw new Error("Missing env.production in wrangler.jsonc")
	}

	if (
		!Array.isArray(wrangler.env.production.d1_databases) ||
		wrangler.env.production.d1_databases.length === 0
	) {
		throw new Error("Missing production d1_databases[0] in wrangler.jsonc")
	}

	wrangler.env.production.name = values.workerName
	wrangler.env.production.vars = {
		...(wrangler.env.production.vars ?? {}),
		SESSION_COOKIE_DOMAIN: values.sessionCookieDomain,
	}
	wrangler.env.production.d1_databases[0] = {
		...wrangler.env.production.d1_databases[0],
		database_name: values.databaseName,
		database_id: values.databaseId,
	}

	await writeJson(wranglerPath, wrangler)

	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"))
	const replaceDatabaseName = script =>
		script.replace(
			/(wrangler d1 migrations apply )([^ ]+)/,
			`$1${values.databaseName}`
		)

	if (typeof packageJson.scripts?.["db:migrate"] !== "string") {
		throw new Error("Missing scripts.db:migrate in package.json")
	}

	if (typeof packageJson.scripts?.["db:migrate:remote"] !== "string") {
		throw new Error("Missing scripts.db:migrate:remote in package.json")
	}

	packageJson.scripts["db:migrate"] = replaceDatabaseName(
		packageJson.scripts["db:migrate"]
	)
	packageJson.scripts["db:migrate:remote"] = replaceDatabaseName(
		packageJson.scripts["db:migrate:remote"]
	)

	await writeJson(packageJsonPath, packageJson)

	const configSource = await readFile(configPath, "utf8")
	const nextConfigSource = configSource.replace(
		/appName:\s*"[^"]*"/,
		`appName: ${JSON.stringify(values.appName)}`
	)

	if (nextConfigSource === configSource) {
		throw new Error("Could not update appName in src/lib/server/config.ts")
	}

	await writeFile(configPath, nextConfigSource)
}

const currentValues = await readCurrentValues()
const rl = createInterface({ input, output })

try {
	const values = {
		workerName: await promptWithDefault(
			rl,
			"Cloudflare Worker app name",
			currentValues.workerName
		),
		databaseName: await promptWithDefault(
			rl,
			"D1 database name",
			currentValues.databaseName
		),
		databaseId: await promptWithDefault(
			rl,
			"D1 database id",
			currentValues.databaseId
		),
		sessionCookieDomain: await promptWithDefault(
			rl,
			"Session cookie domain",
			currentValues.sessionCookieDomain
		),
		appName: await promptWithDefault(
			rl,
			"App name shown in website",
			currentValues.appName
		),
	}

	await updateFiles(values)

	console.log("\nUpdated deployment config:")
	console.log(`  Worker app name: ${values.workerName}`)
	console.log(`  D1 database name: ${values.databaseName}`)
	console.log(`  D1 database id: ${values.databaseId}`)
	console.log(`  Session cookie domain: ${values.sessionCookieDomain}`)
	console.log(`  Website app name: ${values.appName}`)
} finally {
	rl.close()
}
