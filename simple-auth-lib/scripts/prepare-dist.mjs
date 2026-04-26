import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(packageRoot, "..")
const distDir = path.join(packageRoot, "dist")
const packageJsonPath = path.join(packageRoot, "package.json")
const readmePath = path.join(repoRoot, "README.md")
const distPackageJsonPath = path.join(distDir, "package.json")
const distReadmePath = path.join(distDir, "README.md")

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"))

const distPackageJson = {
	name: packageJson.name,
	version: packageJson.version,
	type: packageJson.type,
	sideEffects: packageJson.sideEffects,
	main: "./index.js",
	types: "./index.d.ts",
	exports: {
		".": {
			types: "./index.d.ts",
			import: "./index.js",
		},
	},
	publishConfig: packageJson.publishConfig,
	repository: packageJson.repository,
}

await mkdir(distDir, { recursive: true })
await writeFile(
	distPackageJsonPath,
	`${JSON.stringify(distPackageJson, null, "\t")}\n`
)
await cp(readmePath, distReadmePath)
