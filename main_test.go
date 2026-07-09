package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseCommandAPI(t *testing.T) {
	got := parseCommand([]string{"accounting", "get", "deals", "limit==10"})
	if got.Group != "accounting" || got.Command != "api" || got.Method != "GET" {
		t.Fatalf("unexpected command: %+v", got)
	}
	if len(got.Args) != 2 || got.Args[0] != "deals" {
		t.Fatalf("unexpected args: %+v", got.Args)
	}
}

func TestOAuthOptionsFromArgs(t *testing.T) {
	got := oauthOptionsFromArgs([]string{"--remote"})
	if !got.Remote {
		t.Fatalf("remote option not parsed: %+v", got)
	}
	got = oauthOptionsFromArgs([]string{"--no-open"})
	if !got.NoOpen || got.Remote {
		t.Fatalf("no-open option not parsed: %+v", got)
	}
}

func TestConfigureOptionsFromArgs(t *testing.T) {
	got := configureOptionsFromArgs([]string{"configure", "--force", "--remote"})
	if !got.Force || !got.OAuth.Remote {
		t.Fatalf("configure options not parsed: %+v", got)
	}
}

func TestPrintRemoteOAuthGuide(t *testing.T) {
	var buf bytes.Buffer
	printRemoteOAuthGuide(&buf, 54321)
	out := buf.String()
	if !strings.Contains(out, "ssh -L 54321:127.0.0.1:54321") {
		t.Fatalf("port forwarding guide missing: %s", out)
	}
	if !strings.Contains(out, "http://127.0.0.1:54321/callback") {
		t.Fatalf("callback URL missing: %s", out)
	}
}

func TestParseAPIInput(t *testing.T) {
	got, err := parseAPIInput([]string{"deals", "limit==10", "type=income", "amount:=1000", "--json"}, "POST")
	if err != nil {
		t.Fatal(err)
	}
	if got.Path != "deals" || got.Method != "POST" {
		t.Fatalf("unexpected input: %+v", got)
	}
	if got.Query["limit"] != "10" {
		t.Fatalf("query not parsed: %+v", got.Query)
	}
	if got.Body["type"] != "income" || got.Body["amount"].(float64) != 1000 {
		t.Fatalf("body not parsed: %+v", got.Body)
	}
	if !hasFlag(got.Flags, "--json") {
		t.Fatalf("flag not parsed: %+v", got.Flags)
	}
}

func TestParseAPIInputBracketArray(t *testing.T) {
	got, err := parseAPIInput([]string{"deals", "details[0][tax_code]=1", "details[0][amount]=1000"}, "POST")
	if err != nil {
		t.Fatal(err)
	}
	details, ok := got.Body["details"].([]any)
	if !ok || len(details) != 1 {
		t.Fatalf("details array not parsed: %#v", got.Body["details"])
	}
	first, ok := details[0].(map[string]any)
	if !ok {
		t.Fatalf("details[0] not object: %#v", details[0])
	}
	if first["tax_code"] != "1" || first["amount"] != "1000" {
		t.Fatalf("unexpected details[0]: %#v", first)
	}
}

func TestParseAPIInputBodyFromFile(t *testing.T) {
	dir := t.TempDir()
	bodyPath := filepath.Join(dir, "body.json")
	if err := os.WriteFile(bodyPath, []byte(`{"issue_date":"2026-01-01","amount":1000}`), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := parseAPIInput([]string{"deals", "-d", "@" + bodyPath}, "POST")
	if err != nil {
		t.Fatal(err)
	}
	if got.Body["issue_date"] != "2026-01-01" || got.Body["amount"].(float64) != 1000 {
		t.Fatalf("body from file not parsed: %#v", got.Body)
	}
}

func TestParseAPIInputBodyFromStdin(t *testing.T) {
	original := readStdin
	readStdin = func() ([]byte, error) {
		return []byte(`{"issue_date":"2026-01-02","amount":2000}`), nil
	}
	defer func() {
		readStdin = original
	}()

	got, err := parseAPIInput([]string{"deals", "-d", "-"}, "POST")
	if err != nil {
		t.Fatal(err)
	}
	if got.Body["issue_date"] != "2026-01-02" || got.Body["amount"].(float64) != 2000 {
		t.Fatalf("body from stdin not parsed: %#v", got.Body)
	}
}

func TestResolveSchemaPath(t *testing.T) {
	if got := resolveSchemaPath(accounting, "deals/123"); got != "/api/1/deals/{id}" {
		t.Fatalf("unexpected schema path: %s", got)
	}
}

func TestListEndpoints(t *testing.T) {
	out := listEndpoints(accounting, "deals")
	if !strings.Contains(out, "deals") || !strings.Contains(out, "OPERATIONS") {
		t.Fatalf("unexpected list output: %s", out)
	}
}

func TestFormatCompactKeepsIntegerNumbers(t *testing.T) {
	data, err := decodeJSONUseNumber([]byte(`{
		"manual_journals": [
			{"id": 3648662563, "company_id": 12062048, "issue_date": "2026-07-08", "adjustment": false}
		],
		"meta": {"total_count": 1}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	out := formatCompact(data, 10)
	if strings.Contains(out, "e+") || strings.Contains(out, ".000") {
		t.Fatalf("integer IDs should not use float notation: %s", out)
	}
	if !strings.Contains(out, "3648662563") || !strings.Contains(out, "12062048") {
		t.Fatalf("integer IDs missing from output: %s", out)
	}
}
