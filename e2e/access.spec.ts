import { expect, test } from "@playwright/test"

test("shows sign in by default without a public register toggle", async ({
	page,
}) => {
	await page.goto("/")

	await expect(
		page.getByRole("heading", { name: "Sign in to Your App" })
	).toBeVisible()
	await expect(page.getByLabel("Email (optional)")).toBeVisible()
	await expect(page.getByRole("button", { name: "Register" })).toHaveCount(0)
})
