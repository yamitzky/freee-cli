# CLAUDE.md

This repository is a Go single-binary CLI plus Agent Skill for freee APIs.

## Commands

- `go test ./...` - Run Go tests and vet checks
- `go build -o freee .` - Build the local CLI
- `go build -trimpath -ldflags "-s -w -X main.version=$(cat VERSION)" -o freee .` - Release-like local build
- `gofmt -w main.go` - Format the Go implementation

If the sandbox cannot write Go caches under the home directory, use:

```bash
GOCACHE=/tmp/freee-go-build GOMODCACHE=/tmp/freee-go-mod go test ./...
```

## Architecture

- `main.go` contains the CLI, OAuth, token storage, OpenAPI lookup, request execution, and output formatting.
- `openapi/minimal/*.json` and `openapi/*-api-schema.json` are embedded with `go:embed`.
- `skills/freee-cli-skill` remains the Agent Skill documentation used by coding agents.
- Runtime configuration remains compatible with the previous implementation:
  - config: `~/.config/freee-mcp/config.json`
  - tokens: `~/.config/freee-mcp/tokens.json`

## Distribution

npm/Bun/TypeScript packaging has been removed. Releases should publish Go binaries through GitHub Releases.

Recommended release build:

```bash
VERSION=$(cat VERSION)
go build -trimpath -ldflags "-s -w -X main.version=$VERSION" -o freee .
```

## Notes

- Keep the implementation dependency-free unless there is a strong reason to add a Go module dependency.
- Preserve existing CLI command compatibility where practical.
- Do not reintroduce npm packaging.
