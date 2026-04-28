#!/usr/bin/env bun

const keyPair = await crypto.subtle.generateKey(
	{
		name: "ECDSA",
		namedCurve: "P-256",
	},
	true,
	["sign", "verify"]
)

const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey)
const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey)
const privateKeyValue = JSON.stringify(privateKey)
const publicKeyValue = JSON.stringify(publicKey)

console.log("Raw values for Cloudflare secrets:")
console.log(`SESSION_PRIVATE_KEY_JWK=${privateKeyValue}`)
console.log(`SESSION_PUBLIC_KEY_JWK=${publicKeyValue}`)
console.log("")
console.log("Quoted assignments for .dev.vars:")
console.log(`SESSION_PRIVATE_KEY_JWK=${JSON.stringify(privateKeyValue)}`)
console.log(`SESSION_PUBLIC_KEY_JWK=${JSON.stringify(publicKeyValue)}`)
