package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"
)

//go:embed openapi/minimal/*.json openapi/*-api-schema.json
var embeddedFiles embed.FS

var version = "dev"

const (
	appName             = "freee-mcp"
	defaultCallbackPort = 54321
	authTimeout         = 5 * time.Minute
	freeeAPIURL         = "https://api.freee.co.jp"
	userAgentName       = "freee-cli"
)

type apiType string

const (
	accounting apiType = "accounting"
	hr         apiType = "hr"
	invoice    apiType = "invoice"
	pm         apiType = "pm"
	sm         apiType = "sm"
)

var apiOrder = []apiType{accounting, hr, invoice, pm, sm}

type apiMetadata struct {
	SchemaFile string
	FullFile   string
	BaseURL    string
	Name       string
	Prefix     string
}

var apiMeta = map[apiType]apiMetadata{
	accounting: {SchemaFile: "accounting.json", FullFile: "accounting-api-schema.json", BaseURL: "https://api.freee.co.jp", Name: "freee会計 API", Prefix: "/api/1/"},
	hr:         {SchemaFile: "hr.json", FullFile: "hr-api-schema.json", BaseURL: "https://api.freee.co.jp/hr", Name: "freee人事労務 API", Prefix: "/api/v1/"},
	invoice:    {SchemaFile: "invoice.json", FullFile: "invoice-api-schema.json", BaseURL: "https://api.freee.co.jp/iv", Name: "freee請求書 API", Prefix: "/"},
	pm:         {SchemaFile: "pm.json", FullFile: "pm-api-schema.json", BaseURL: "https://api.freee.co.jp/pm", Name: "freee工数管理 API", Prefix: "/"},
	sm:         {SchemaFile: "sm.json", FullFile: "sm-api-schema.json", BaseURL: "https://api.freee.co.jp/sm", Name: "freee販売 API", Prefix: "/"},
}

type config struct {
	Freee struct {
		ClientID     string
		ClientSecret string
		CompanyID    string
		APIURL       string
	}
	OAuth struct {
		CallbackPort          int
		RedirectURI           string
		AuthorizationEndpoint string
		TokenEndpoint         string
		Scope                 string
	}
	Auth struct {
		Timeout time.Duration
	}
}

type companyConfig struct {
	ID          string `json:"id"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	AddedAt     int64  `json:"addedAt"`
	LastUsed    int64  `json:"lastUsed,omitempty"`
}

type fullConfig struct {
	ClientID         string                   `json:"clientId,omitempty"`
	ClientSecret     string                   `json:"clientSecret,omitempty"`
	CallbackPort     int                      `json:"callbackPort,omitempty"`
	DefaultCompanyID string                   `json:"defaultCompanyId"`
	CurrentCompanyID string                   `json:"currentCompanyId"`
	Companies        map[string]companyConfig `json:"companies"`
	DownloadDir      string                   `json:"downloadDir,omitempty"`
}

type tokenData struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
	TokenType    string `json:"token_type"`
	Scope        string `json:"scope"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

type parsedCommand struct {
	Group   string
	Command string
	Method  string
	Args    []string
}

type oauthOptions struct {
	NoOpen bool
	Remote bool
}

type apiInput struct {
	Path      string
	Method    string
	Query     map[string]string
	Body      map[string]any
	Flags     []string
	FilePaths []string
}

type minimalSchema struct {
	Paths map[string]minimalPathItem `json:"paths"`
}

type minimalPathItem struct {
	Get    *minimalOperation `json:"get,omitempty"`
	Post   *minimalOperation `json:"post,omitempty"`
	Put    *minimalOperation `json:"put,omitempty"`
	Delete *minimalOperation `json:"delete,omitempty"`
	Patch  *minimalOperation `json:"patch,omitempty"`
}

type minimalOperation struct {
	Summary     string             `json:"summary,omitempty"`
	Description string             `json:"description,omitempty"`
	Parameters  []minimalParameter `json:"parameters,omitempty"`
	HasJSONBody bool               `json:"hasJsonBody,omitempty"`
}

type minimalParameter struct {
	Name        string `json:"name"`
	In          string `json:"in"`
	Required    bool   `json:"required,omitempty"`
	Description string `json:"description,omitempty"`
	Type        string `json:"type"`
}

type validationResult struct {
	Valid      bool
	Message    string
	Operation  *minimalOperation
	ActualPath string
	Service    apiType
	BaseURL    string
}

type binaryFileResponse struct {
	FilePath string
	MimeType string
	Size     int64
}

type company struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	NameKana    string `json:"name_kana"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
}

var loadedSchemas = map[apiType]*minimalSchema{}
var fullSchemas = map[apiType]map[string]any{}
var regexCache = map[string]*regexp.Regexp{}
var cachedConfig *config
var readStdin = func() ([]byte, error) {
	return io.ReadAll(os.Stdin)
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(argv []string) error {
	if contains(argv, "--version") {
		fmt.Println(version)
		return nil
	}
	if contains(argv, "--help") && len(argv) == 1 {
		printUsage()
		return nil
	}

	parsed := parseCommand(argv)
	switch parsed.Group {
	case "configure":
		return configureCLI(configureOptionsFromArgs(argv))
	case "auth":
		if _, err := loadConfig(); err != nil {
			return err
		}
		out, err := handleAuth(parsed.Command, parsed.Args)
		if out != "" {
			fmt.Println(out)
		}
		return err
	case "company":
		if _, err := loadConfig(); err != nil {
			return err
		}
		out, err := handleCompany(parsed.Command, parsed.Args)
		if out != "" {
			fmt.Println(out)
		}
		return err
	case "accounting", "hr", "invoice", "pm", "sm":
		if _, err := loadConfig(); err != nil {
			return err
		}
		service := apiType(parsed.Group)
		if parsed.Command == "ls" {
			fmt.Println(listEndpoints(service, firstArg(parsed.Args)))
			return nil
		}
		if parsed.Command == "api" {
			out, err := handleAPICommand(service, parsed.Method, parsed.Args)
			if out != "" {
				fmt.Println(out)
			}
			return err
		}
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", parsed.Command)
		printUsage()
		return errors.New("unknown command")
	case "help":
		printUsage()
		return nil
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", parsed.Group)
		printUsage()
		return errors.New("unknown command")
	}
}

func printUsage() {
	fmt.Printf(`freee CLI v%s

Usage: freee <command> [options]

Setup:
  freee configure           OAuth認証と事業所の設定を対話式で行います
  freee configure --force   保存済みのログイン情報をリセットして再設定
  freee configure --no-open ブラウザを開かず認証URLだけ表示
  freee configure --remote  リモート環境向けのPort Forwardingガイドを表示

Auth:
  freee auth login          freee にログイン
  freee auth login --no-open ブラウザを開かず認証URLだけ表示
  freee auth login --remote  リモート環境向けのPort Forwardingガイドを表示
  freee auth logout         ログアウト
  freee auth status         認証状態を表示

Company:
  freee company ls          事業所一覧を表示
  freee company set <id>    操作対象の事業所を設定
  freee company current     現在の事業所を表示

API:
  freee <service> ls [filter]           エンドポイント一覧（filterで絞込可）
  freee <service> get <path>            GET リクエスト
  freee <service> post <path>           POST リクエスト
  freee <service> post receipts <file> ファイルアップロード
  freee <service> put <path>            PUT リクエスト
  freee <service> delete <path>         DELETE リクエスト
  freee <service> patch <path>          PATCH リクエスト

  service: accounting, hr, invoice, pm, sm
  path: deals, approval_requests, partners, etc. (/api/1/ は省略可)

  Docs:
    freee <service> <path> --help
    freee <service> get <path> --help
    freee <service> get <path> --help --response
    freee <service> get <path> --spec

  Input syntax:
    key==val    クエリパラメータ
    key=val     ボディパラメータ（文字列）
    key:=json   ボディパラメータ（JSON値）
    -d '{}'     JSON ボディを直接指定
    -d @file    JSON ボディをファイルから読み込み
    -d -        JSON ボディを標準入力から読み込み
    --json      レスポンスを生JSONで表示
    --max=N     表示件数（デフォルト: 10）
    --verbose   リクエスト先URLとボディを表示

Options:
  --version                 バージョンを表示
  --help                    ヘルプを表示
`, version)
}

func parseCommand(argv []string) parsedCommand {
	if len(argv) == 0 {
		return parsedCommand{Group: "help", Command: "help"}
	}
	group := argv[0]
	rest := argv[1:]
	if isAPIService(group) {
		if len(rest) == 0 {
			return parsedCommand{Group: group, Command: "ls"}
		}
		first := rest[0]
		remaining := rest[1:]
		if first == "ls" {
			return parsedCommand{Group: group, Command: "ls", Args: remaining}
		}
		methods := map[string]string{"get": "GET", "post": "POST", "put": "PUT", "delete": "DELETE", "patch": "PATCH"}
		if method, ok := methods[first]; ok {
			return parsedCommand{Group: group, Command: "api", Method: method, Args: remaining}
		}
		return parsedCommand{Group: group, Command: "api", Args: rest}
	}
	if group == "configure" {
		return parsedCommand{Group: "configure", Command: "configure", Args: rest}
	}
	if len(rest) == 0 {
		return parsedCommand{Group: group, Command: group}
	}
	return parsedCommand{Group: group, Command: rest[0], Args: rest[1:]}
}

func isAPIService(s string) bool {
	_, ok := apiMeta[apiType(s)]
	return ok
}

func handleAPICommand(service apiType, method string, args []string) (string, error) {
	input, err := parseAPIInput(args, method)
	if err != nil {
		return "", err
	}
	if hasFlag(input.Flags, "--help") {
		if input.Method != "" {
			return generateDocs(service, input.Path, input.Method, hasFlag(input.Flags, "--response")), nil
		}
		return generateMethodList(service, input.Path), nil
	}
	if hasFlag(input.Flags, "--spec") {
		return generateSpec(service, input.Path), nil
	}
	return executeAPIRequest(service, input)
}

func parseAPIInput(args []string, methodOverride string) (apiInput, error) {
	out := apiInput{Method: methodOverride, Query: map[string]string{}, Flags: []string{}, FilePaths: []string{}}
	if len(args) == 0 {
		return out, nil
	}
	out.Path = args[0]
	var explicitMethod bool
	for i := 1; i < len(args); {
		arg := args[i]
		switch {
		case arg == "-X" && i+1 < len(args):
			out.Method = strings.ToUpper(args[i+1])
			explicitMethod = true
			i += 2
		case arg == "-d" && i+1 < len(args):
			body, err := readBodyData(args[i+1])
			if err != nil {
				return out, err
			}
			if out.Body == nil {
				out.Body = map[string]any{}
			}
			for k, v := range body {
				out.Body[k] = v
			}
			i += 2
		case strings.HasPrefix(arg, "--"):
			out.Flags = append(out.Flags, arg)
			i++
		case strings.Contains(arg, "=="):
			parts := strings.SplitN(arg, "==", 2)
			out.Query[parts[0]] = parts[1]
			i++
		case strings.Contains(arg, ":="):
			parts := strings.SplitN(arg, ":=", 2)
			var value any
			if err := json.Unmarshal([]byte(parts[1]), &value); err != nil {
				return out, err
			}
			if out.Body == nil {
				out.Body = map[string]any{}
			}
			out.Body[parts[0]] = value
			i++
		case strings.Contains(arg, "="):
			parts := strings.SplitN(arg, "=", 2)
			if out.Body == nil {
				out.Body = map[string]any{}
			}
			setBodyValue(out.Body, parts[0], parts[1])
			i++
		default:
			out.FilePaths = append(out.FilePaths, arg)
			i++
		}
	}
	if !explicitMethod && methodOverride != "" {
		out.Method = methodOverride
	}
	return out, nil
}

func readBodyData(source string) (map[string]any, error) {
	var data []byte
	var err error
	switch {
	case source == "-":
		data, err = readStdin()
	case strings.HasPrefix(source, "@"):
		filePath := strings.TrimPrefix(source, "@")
		if filePath == "" {
			return nil, errors.New("-d @ requires a file path")
		}
		data, err = os.ReadFile(filePath)
	default:
		data = []byte(source)
	}
	if err != nil {
		return nil, err
	}
	var body map[string]any
	if err := json.Unmarshal(data, &body); err != nil {
		return nil, err
	}
	return body, nil
}

func setBodyValue(body map[string]any, rawKey string, value string) {
	if !strings.Contains(rawKey, "[") {
		body[rawKey] = value
		return
	}
	keys := parseBracketKeys(rawKey)
	if len(keys) == 0 {
		return
	}
	body[keys[0]] = setNestedValue(body[keys[0]], keys[1:], value)
}

func parseBracketKeys(raw string) []string {
	parts := strings.Split(raw, "[")
	keys := []string{parts[0]}
	for _, part := range parts[1:] {
		keys = append(keys, strings.TrimSuffix(part, "]"))
	}
	return keys
}

func setNestedValue(current any, keys []string, value any) any {
	if len(keys) == 0 {
		return value
	}
	key := keys[0]
	if idx, err := strconv.Atoi(key); err == nil {
		var arr []any
		if existing, ok := current.([]any); ok {
			arr = existing
		}
		for len(arr) <= idx {
			arr = append(arr, nil)
		}
		arr[idx] = setNestedValue(arr[idx], keys[1:], value)
		return arr
	}
	obj, ok := current.(map[string]any)
	if !ok {
		obj = map[string]any{}
	}
	obj[key] = setNestedValue(obj[key], keys[1:], value)
	return obj
}

func configDir() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, appName)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".", appName)
	}
	return filepath.Join(home, ".config", appName)
}

func configPath() string { return filepath.Join(configDir(), "config.json") }
func tokenPath() string  { return filepath.Join(configDir(), "tokens.json") }

func loadFullConfig() (fullConfig, error) {
	var cfg fullConfig
	data, err := os.ReadFile(configPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			cfg = fullConfig{DefaultCompanyID: "0", CurrentCompanyID: "0", Companies: map[string]companyConfig{}}
			return cfg, saveFullConfig(cfg)
		}
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}
	if cfg.DefaultCompanyID == "" {
		cfg.DefaultCompanyID = "0"
	}
	if cfg.CurrentCompanyID == "" {
		cfg.CurrentCompanyID = "0"
	}
	if cfg.Companies == nil {
		cfg.Companies = map[string]companyConfig{}
	}
	return cfg, nil
}

func saveFullConfig(cfg fullConfig) error {
	if err := os.MkdirAll(configDir(), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0o600)
}

func loadConfig() (*config, error) {
	if cachedConfig != nil {
		return cachedConfig, nil
	}
	full, err := loadFullConfig()
	if err != nil {
		return nil, err
	}
	clientID, clientSecret := os.Getenv("FREEE_CLIENT_ID"), os.Getenv("FREEE_CLIENT_SECRET")
	port := parsePort(os.Getenv("FREEE_CALLBACK_PORT"), defaultCallbackPort)
	if clientID == "" && clientSecret == "" {
		clientID, clientSecret = full.ClientID, full.ClientSecret
		if full.CallbackPort != 0 {
			port = full.CallbackPort
		}
	} else if clientID == "" || clientSecret == "" {
		return nil, errors.New("FREEE_CLIENT_ID と FREEE_CLIENT_SECRET は両方設定してください")
	} else {
		fmt.Fprintln(os.Stderr, "Warning: 環境変数での認証情報設定は非推奨です。")
	}
	if clientID == "" || clientSecret == "" {
		return nil, errors.New("認証情報が設定されていません。`freee configure` を実行してセットアップしてください。")
	}
	cfg := &config{}
	cfg.Freee.ClientID = clientID
	cfg.Freee.ClientSecret = clientSecret
	cfg.Freee.CompanyID = "0"
	cfg.Freee.APIURL = freeeAPIURL
	cfg.OAuth.CallbackPort = port
	cfg.OAuth.RedirectURI = fmt.Sprintf("http://127.0.0.1:%d/callback", port)
	cfg.OAuth.AuthorizationEndpoint = "https://accounts.secure.freee.co.jp/public_api/authorize"
	cfg.OAuth.TokenEndpoint = "https://accounts.secure.freee.co.jp/public_api/token"
	cfg.OAuth.Scope = "read write"
	cfg.Auth.Timeout = authTimeout
	cachedConfig = cfg
	return cfg, nil
}

func parsePort(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	port, err := strconv.Atoi(value)
	if err != nil || port < 1 || port > 65535 {
		return fallback
	}
	return port
}

func currentCompanyID() (string, error) {
	cfg, err := loadFullConfig()
	if err != nil {
		return "", err
	}
	return cfg.CurrentCompanyID, nil
}

func setCurrentCompany(companyID, name, description string) error {
	cfg, err := loadFullConfig()
	if err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	existing := cfg.Companies[companyID]
	if existing.ID == "" {
		existing = companyConfig{ID: companyID, Name: "Company " + companyID, AddedAt: now}
	}
	if name != "" {
		existing.Name = name
	}
	if description != "" {
		existing.Description = description
	}
	existing.LastUsed = now
	cfg.Companies[companyID] = existing
	cfg.CurrentCompanyID = companyID
	return saveFullConfig(cfg)
}

func loadTokens() (*tokenData, error) {
	data, err := os.ReadFile(tokenPath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, err
	}
	var tokens tokenData
	if err := json.Unmarshal(data, &tokens); err != nil {
		return nil, err
	}
	if tokens.AccessToken == "" || tokens.RefreshToken == "" || tokens.ExpiresAt == 0 {
		return nil, errors.New("invalid token file")
	}
	return &tokens, nil
}

func saveTokens(tokens tokenData) error {
	if err := os.MkdirAll(configDir(), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(tokens, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(tokenPath(), data, 0o600)
}

func clearTokens() error {
	err := os.Remove(tokenPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func tokenValid(tokens *tokenData) bool {
	return tokens != nil && time.Now().UnixMilli() < tokens.ExpiresAt
}

func getValidAccessToken() (string, error) {
	tokens, err := loadTokens()
	if err != nil || tokens == nil {
		return "", err
	}
	if tokenValid(tokens) {
		return tokens.AccessToken, nil
	}
	newTokens, err := refreshAccessToken(tokens.RefreshToken)
	if err != nil {
		return "", err
	}
	return newTokens.AccessToken, nil
}

func refreshAccessToken(refreshToken string) (*tokenData, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}
	form := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
		"client_id":     {cfg.Freee.ClientID},
		"client_secret": {cfg.Freee.ClientSecret},
	}
	req, err := http.NewRequest(http.MethodPost, cfg.OAuth.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", userAgent())
	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Token refresh failed: %d %s", resp.StatusCode, responseErrorInfo(resp))
	}
	var tr tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, err
	}
	tokens := createTokenData(tr, refreshToken, cfg.OAuth.Scope)
	return &tokens, saveTokens(tokens)
}

func createTokenData(tr tokenResponse, fallbackRefresh, fallbackScope string) tokenData {
	refresh := tr.RefreshToken
	if refresh == "" {
		refresh = fallbackRefresh
	}
	tokenType := tr.TokenType
	if tokenType == "" {
		tokenType = "Bearer"
	}
	scope := tr.Scope
	if scope == "" {
		scope = fallbackScope
	}
	return tokenData{AccessToken: tr.AccessToken, RefreshToken: refresh, ExpiresAt: time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second).UnixMilli(), TokenType: tokenType, Scope: scope}
}

func handleAuth(command string, args []string) (string, error) {
	switch command {
	case "login":
		if _, err := performOAuth(oauthOptionsFromArgs(args)); err != nil {
			return "Authentication failed: " + err.Error(), nil
		}
		return "Authentication successful.", nil
	case "status":
		tokens, err := loadTokens()
		if err != nil {
			return "", err
		}
		if tokens == nil {
			return "Not authenticated. Run `freee auth login` to authenticate.", nil
		}
		if tokenValid(tokens) {
			return fmt.Sprintf("Authenticated. Token expires at %s.", time.UnixMilli(tokens.ExpiresAt).UTC().Format(time.RFC3339)), nil
		}
		return "Token expired. Run `freee auth login` to re-authenticate.", nil
	case "logout":
		if err := clearTokens(); err != nil {
			return "", err
		}
		return "Logged out. Tokens have been cleared.", nil
	default:
		return "Usage: freee auth [login|status|logout]", nil
	}
}

func performOAuth(options oauthOptions) (*tokenData, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}
	fmt.Print("ステップ 2/3: OAuth認証\n\n")
	if options.Remote {
		printRemoteOAuthGuide(os.Stdout, cfg.OAuth.CallbackPort)
	}
	if options.NoOpen || options.Remote {
		fmt.Println("ブラウザは自動起動しません。表示される認証URLを手元のブラウザで開いてください。")
	} else {
		fmt.Println("ブラウザで認証ページを開きます...")
	}
	codeVerifier := randomBase64URL(32)
	sum := sha256.Sum256([]byte(codeVerifier))
	codeChallenge := base64.RawURLEncoding.EncodeToString(sum[:])
	state := randomBase64URL(16)

	codeCh := make(chan string, 1)
	errCh := make(chan error, 1)
	server := &http.Server{Addr: fmt.Sprintf("127.0.0.1:%d", cfg.OAuth.CallbackPort)}
	mux := http.NewServeMux()
	server.Handler = mux
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/callback" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			fmt.Fprint(w, "<h1>freee OAuth Server</h1><p>コールバックサーバーが稼働中です。</p>")
			return
		}
		if got := r.URL.Query().Get("state"); got != state {
			http.Error(w, "Invalid state", http.StatusBadRequest)
			errCh <- errors.New("invalid OAuth state")
			return
		}
		if e := r.URL.Query().Get("error"); e != "" {
			http.Error(w, e, http.StatusBadRequest)
			errCh <- errors.New(e)
			return
		}
		code := r.URL.Query().Get("code")
		if code == "" {
			http.Error(w, "Missing code", http.StatusBadRequest)
			errCh <- errors.New("missing authorization code")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, "<h1>認証が完了しました</h1><p>このウィンドウを閉じてCLIに戻ってください。</p>")
		codeCh <- code
	})
	ln, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return nil, fmt.Errorf("ポート %d は既に使用されています: %w", cfg.OAuth.CallbackPort, err)
	}
	go func() {
		if err := server.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	defer server.Shutdown(context.Background())

	authURL := buildAuthURL(codeChallenge, state, cfg.OAuth.RedirectURI, cfg)
	fmt.Printf("\n認証URL: %s\n\n", authURL)
	if !options.NoOpen && !options.Remote {
		if err := openBrowser(authURL); err != nil {
			fmt.Println("ブラウザを自動起動できませんでした。上記の認証URLを手元のブラウザで開いてください。")
		}
	}
	fmt.Println("ブラウザで認証を完了してください...")

	select {
	case code := <-codeCh:
		fmt.Println("認証コードを受け取りました。")
		return exchangeCodeForTokens(code, codeVerifier, cfg.OAuth.RedirectURI)
	case err := <-errCh:
		return nil, err
	case <-time.After(cfg.Auth.Timeout):
		return nil, errors.New("認証がタイムアウトしました（5分）")
	}
}

func printRemoteOAuthGuide(w io.Writer, port int) {
	fmt.Fprintln(w, "リモート環境で認証する場合:")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "  1. 手元のPCから、このCLIが動いている環境へPort Forwardingしてください。")
	fmt.Fprintf(w, "     ssh -L %d:127.0.0.1:%d <user>@<remote-host>\n", port, port)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "  2. freeeアプリのコールバックURLには次を登録してください。")
	fmt.Fprintf(w, "     http://127.0.0.1:%d/callback\n", port)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "  3. この後に表示される認証URLを手元のブラウザで開いてください。")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "VS Code Remote / Dev Container / Codespaces の場合は、同じポートをローカルへ転送してください。")
	fmt.Fprintln(w)
}

func buildAuthURL(codeChallenge, state, redirectURI string, cfg *config) string {
	params := url.Values{
		"response_type":         {"code"},
		"client_id":             {cfg.Freee.ClientID},
		"redirect_uri":          {redirectURI},
		"scope":                 {cfg.OAuth.Scope},
		"state":                 {state},
		"code_challenge":        {codeChallenge},
		"code_challenge_method": {"S256"},
	}
	return cfg.OAuth.AuthorizationEndpoint + "?" + params.Encode()
}

func exchangeCodeForTokens(code, codeVerifier, redirectURI string) (*tokenData, error) {
	cfg, err := loadConfig()
	if err != nil {
		return nil, err
	}
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {cfg.Freee.ClientID},
		"client_secret": {cfg.Freee.ClientSecret},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"code_verifier": {codeVerifier},
	}
	req, err := http.NewRequest(http.MethodPost, cfg.OAuth.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", userAgent())
	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Token exchange failed: %d %s", resp.StatusCode, responseErrorInfo(resp))
	}
	var tr tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, err
	}
	tokens := createTokenData(tr, "", cfg.OAuth.Scope)
	return &tokens, saveTokens(tokens)
}

type configureOptions struct {
	Force bool
	OAuth oauthOptions
}

func configureOptionsFromArgs(args []string) configureOptions {
	oauth := oauthOptionsFromArgs(args)
	return configureOptions{
		Force: contains(args, "--force"),
		OAuth: oauth,
	}
}

func oauthOptionsFromArgs(args []string) oauthOptions {
	return oauthOptions{
		NoOpen: contains(args, "--no-open"),
		Remote: contains(args, "--remote"),
	}
}

func configureCLI(options configureOptions) error {
	fmt.Print("\n=== freee Configuration Setup ===\n\n")
	if options.Force {
		fmt.Println("保存済みのログイン情報をリセットしています...")
		_ = clearTokens()
		_ = os.Remove(configPath())
		cachedConfig = nil
		fmt.Print("リセットが完了しました。\n\n")
	}
	fmt.Println("このウィザードでは、freee CLIの設定と認証を対話式で行います。")
	fmt.Print("freee OAuth認証情報が必要です。\n\n")
	full, err := loadFullConfig()
	if err != nil {
		return err
	}
	reader := bufio.NewReader(os.Stdin)
	defaultPort := full.CallbackPort
	if defaultPort == 0 {
		defaultPort = defaultCallbackPort
	}
	fmt.Print("ステップ 1/3: OAuth認証情報の入力\n\n")
	fmt.Printf("freee アプリのコールバックURLには http://127.0.0.1:%d/callback を設定してください。\n\n", defaultPort)
	clientID := prompt(reader, "FREEE_CLIENT_ID", full.ClientID, false)
	clientSecret := prompt(reader, "FREEE_CLIENT_SECRET", full.ClientSecret, true)
	portText := prompt(reader, "コールバックポート", strconv.Itoa(defaultPort), false)
	port := parsePort(portText, defaultPort)
	if clientID == "" || clientSecret == "" {
		return errors.New("CLIENT_ID と CLIENT_SECRET は必須です")
	}
	full.ClientID, full.ClientSecret, full.CallbackPort = clientID, clientSecret, port
	if err := saveFullConfig(full); err != nil {
		return err
	}
	cachedConfig = nil
	if _, err := loadConfig(); err != nil {
		return err
	}
	tokens, err := performOAuth(options.OAuth)
	if err != nil {
		return err
	}
	companies, err := fetchCompanies(tokens.AccessToken)
	if err != nil {
		return err
	}
	if len(companies) == 0 {
		return errors.New("利用可能な事業所がありません")
	}
	fmt.Print("ステップ 3/3: 操作対象の事業所の選択\n\n")
	for i, c := range companies {
		name := c.DisplayName
		if name == "" {
			name = c.Name
		}
		fmt.Printf("  %d) %s (ID: %d) - %s\n", i+1, name, c.ID, c.Role)
	}
	choiceText := prompt(reader, "番号を選択", "1", false)
	choice, _ := strconv.Atoi(choiceText)
	if choice < 1 || choice > len(companies) {
		choice = 1
	}
	selected := companies[choice-1]
	now := time.Now().UnixMilli()
	newCfg := fullConfig{
		ClientID:         clientID,
		ClientSecret:     clientSecret,
		CallbackPort:     port,
		DefaultCompanyID: strconv.Itoa(selected.ID),
		CurrentCompanyID: strconv.Itoa(selected.ID),
		Companies:        map[string]companyConfig{},
	}
	for _, c := range companies {
		id := strconv.Itoa(c.ID)
		name := c.DisplayName
		if name == "" {
			name = c.Name
		}
		entry := companyConfig{ID: id, Name: name, Description: "Role: " + c.Role, AddedAt: now}
		if c.ID == selected.ID {
			entry.LastUsed = now
		}
		newCfg.Companies[id] = entry
	}
	if err := saveFullConfig(newCfg); err != nil {
		return err
	}
	fmt.Println("\nセットアップ完了!")
	fmt.Println("freee CLI を使って API を操作できます:")
	fmt.Println("  freee auth status")
	fmt.Println("  freee accounting ls")
	return nil
}

func prompt(reader *bufio.Reader, label, initial string, secret bool) string {
	if initial != "" {
		if secret {
			fmt.Printf("%s (変更しない場合は空欄): ", label)
		} else {
			fmt.Printf("%s [%s]: ", label, initial)
		}
	} else {
		fmt.Printf("%s: ", label)
	}
	text, _ := reader.ReadString('\n')
	text = strings.TrimSpace(text)
	if text == "" {
		return initial
	}
	return text
}

func handleCompany(command string, args []string) (string, error) {
	switch command {
	case "current":
		id, err := currentCompanyID()
		if err != nil {
			return "", err
		}
		if id == "" || id == "0" {
			return "No company set", nil
		}
		cfg, err := loadFullConfig()
		if err != nil {
			return "", err
		}
		if info := cfg.Companies[id]; info.Name != "" {
			return fmt.Sprintf("Current company: %s (ID: %s)", info.Name, id), nil
		}
		return "Current company: ID: " + id, nil
	case "set":
		if len(args) == 0 {
			return "Usage: freee company set <company_id>", nil
		}
		return "Company set to: " + args[0], setCurrentCompany(args[0], "", "")
	case "ls":
		token, err := getValidAccessToken()
		if err != nil {
			return "", err
		}
		if token == "" {
			return "Not authenticated. Run \"freee auth login\" first.", nil
		}
		result, err := makeAPIRequest("GET", "/api/1/companies", map[string]string{}, nil, freeeAPIURL)
		if err != nil {
			return "", err
		}
		obj, _ := result.(map[string]any)
		items, _ := obj["companies"].([]any)
		if len(items) == 0 {
			return "No companies found.", nil
		}
		lines := []string{"ID\tName\tRole"}
		for _, item := range items {
			c, _ := item.(map[string]any)
			lines = append(lines, fmt.Sprintf("%v\t%v\t%v", c["id"], c["name"], c["role"]))
		}
		return strings.Join(lines, "\n"), nil
	default:
		return "Usage: freee company <command>\n\nCommands:\n  current    Show current company\n  set <id>   Set current company\n  ls         List available companies", nil
	}
}

func fetchCompanies(accessToken string) ([]company, error) {
	if companies, err := fetchAccountingCompanies(accessToken); err == nil && len(companies) > 0 {
		return companies, nil
	}
	return fetchHRCompanies(accessToken)
}

func fetchAccountingCompanies(accessToken string) ([]company, error) {
	req, _ := http.NewRequest(http.MethodGet, freeeAPIURL+"/api/1/companies", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("User-Agent", userAgent())
	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("事業所一覧の取得に失敗しました: %d %s", resp.StatusCode, responseErrorInfo(resp))
	}
	var parsed struct {
		Companies []company `json:"companies"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	return parsed.Companies, nil
}

func fetchHRCompanies(accessToken string) ([]company, error) {
	req, _ := http.NewRequest(http.MethodGet, freeeAPIURL+"/hr/api/v1/users/me", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("User-Agent", userAgent())
	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("事業所一覧の取得に失敗しました（HR API）: %d %s", resp.StatusCode, responseErrorInfo(resp))
	}
	var parsed struct {
		Companies []company `json:"companies"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	for i := range parsed.Companies {
		if parsed.Companies[i].DisplayName == "" {
			parsed.Companies[i].DisplayName = parsed.Companies[i].Name
		}
	}
	return parsed.Companies, nil
}

func loadMinimalSchema(service apiType) (*minimalSchema, error) {
	if s := loadedSchemas[service]; s != nil {
		return s, nil
	}
	meta := apiMeta[service]
	data, err := embeddedFiles.ReadFile("openapi/minimal/" + meta.SchemaFile)
	if err != nil {
		return nil, err
	}
	var schema minimalSchema
	if err := json.Unmarshal(data, &schema); err != nil {
		return nil, err
	}
	loadedSchemas[service] = &schema
	return &schema, nil
}

func loadFullSchema(service apiType) (map[string]any, error) {
	if s := fullSchemas[service]; s != nil {
		return s, nil
	}
	data, err := embeddedFiles.ReadFile("openapi/" + apiMeta[service].FullFile)
	if err != nil {
		return nil, err
	}
	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		return nil, err
	}
	fullSchemas[service] = schema
	return schema, nil
}

func expandPath(service apiType, input string) string {
	if strings.HasPrefix(input, "/") {
		return input
	}
	return apiMeta[service].Prefix + input
}

func schemaPathRegex(schemaPath string) *regexp.Regexp {
	if r := regexCache[schemaPath]; r != nil {
		return r
	}
	var pattern strings.Builder
	pattern.WriteString("^")
	for i := 0; i < len(schemaPath); {
		if schemaPath[i] == '{' {
			if end := strings.IndexByte(schemaPath[i:], '}'); end >= 0 {
				pattern.WriteString("[^/]+")
				i += end + 1
				continue
			}
		}
		pattern.WriteString(regexp.QuoteMeta(schemaPath[i : i+1]))
		i++
	}
	pattern.WriteString("$")
	r := regexp.MustCompile(pattern.String())
	regexCache[schemaPath] = r
	return r
}

func resolveSchemaPath(service apiType, concretePath string) string {
	full := expandPath(service, concretePath)
	schema, err := loadMinimalSchema(service)
	if err != nil {
		return ""
	}
	if _, ok := schema.Paths[full]; ok {
		return full
	}
	for p := range schema.Paths {
		if schemaPathRegex(p).MatchString(full) {
			return p
		}
	}
	return ""
}

func validatePath(service apiType, method, path string) validationResult {
	schema, err := loadMinimalSchema(service)
	if err != nil {
		return validationResult{Message: err.Error()}
	}
	upper := strings.ToUpper(method)
	full := expandPath(service, path)
	if item, ok := schema.Paths[full]; ok {
		if op := operationForMethod(item, upper); op != nil {
			return validationResult{Valid: true, Message: "Valid path and method", Operation: op, ActualPath: full, Service: service, BaseURL: baseURL(service)}
		}
	}
	for p, item := range schema.Paths {
		if schemaPathRegex(p).MatchString(full) {
			if op := operationForMethod(item, upper); op != nil {
				return validationResult{Valid: true, Message: "Valid path and method", Operation: op, ActualPath: full, Service: service, BaseURL: baseURL(service)}
			}
		}
	}
	return validationResult{Message: fmt.Sprintf("Invalid path or method: %s %s for %s", upper, full, service)}
}

func operationForMethod(item minimalPathItem, method string) *minimalOperation {
	switch method {
	case "GET":
		return item.Get
	case "POST":
		return item.Post
	case "PUT":
		return item.Put
	case "DELETE":
		return item.Delete
	case "PATCH":
		return item.Patch
	default:
		return nil
	}
}

func baseURL(service apiType) string {
	env := os.Getenv("FREEE_API_BASE_URL_" + strings.ToUpper(string(service)))
	if env != "" {
		return strings.TrimRight(env, "/")
	}
	return apiMeta[service].BaseURL
}

func listEndpoints(service apiType, filter string) string {
	schema, err := loadMinimalSchema(service)
	if err != nil {
		return err.Error()
	}
	type row struct {
		Path string
		Ops  []string
	}
	var rows []row
	for p, item := range schema.Paths {
		short := toShorthand(service, p)
		var ops []string
		for _, m := range []struct {
			name string
			op   *minimalOperation
		}{{"get", item.Get}, {"post", item.Post}, {"put", item.Put}, {"delete", item.Delete}, {"patch", item.Patch}} {
			if m.op == nil {
				continue
			}
			summary := strings.TrimSuffix(strings.ReplaceAll(m.op.Summary, "一覧の", ""), "の")
			ops = append(ops, fmt.Sprintf("%s(%s)", m.name, summary))
		}
		if filter == "" || strings.Contains(short, filter) || strings.Contains(strings.Join(ops, " "), filter) {
			rows = append(rows, row{Path: short, Ops: ops})
		}
	}
	if len(rows) == 0 {
		return fmt.Sprintf("No endpoints matching '%s'. Run: freee %s ls", filter, service)
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Path < rows[j].Path })
	maxLen := 8
	for _, r := range rows {
		if len(r.Path) > maxLen {
			maxLen = len(r.Path)
		}
	}
	lines := []string{fmt.Sprintf("%-*s  OPERATIONS", maxLen, "RESOURCE")}
	for _, r := range rows {
		lines = append(lines, fmt.Sprintf("%-*s  %s", maxLen, r.Path, strings.Join(r.Ops, " | ")))
	}
	return strings.Join(lines, "\n")
}

func toShorthand(service apiType, fullPath string) string {
	prefix := apiMeta[service].Prefix
	return strings.TrimPrefix(fullPath, prefix)
}

func generateMethodList(service apiType, concretePath string) string {
	schemaPath := resolveSchemaPath(service, concretePath)
	if schemaPath == "" {
		return fmt.Sprintf("パス '%s' は %s に見つかりません。", concretePath, apiMeta[service].Name)
	}
	schema, _ := loadMinimalSchema(service)
	item := schema.Paths[schemaPath]
	lines := []string{fmt.Sprintf("%s: %s", apiMeta[service].Name, schemaPath), ""}
	for _, m := range []struct {
		name string
		op   *minimalOperation
	}{{"get", item.Get}, {"post", item.Post}, {"put", item.Put}, {"delete", item.Delete}, {"patch", item.Patch}} {
		if m.op != nil {
			lines = append(lines, fmt.Sprintf("  %s  %s", strings.ToUpper(m.name), m.op.Summary), fmt.Sprintf("    freee %s %s %s --help", service, m.name, concretePath), "")
		}
	}
	return strings.Join(lines, "\n")
}

func generateDocs(service apiType, concretePath, method string, includeResponse bool) string {
	schemaPath := resolveSchemaPath(service, concretePath)
	if schemaPath == "" {
		return fmt.Sprintf("パス '%s' は %s に見つかりません。", concretePath, apiMeta[service].Name)
	}
	full, err := loadFullSchema(service)
	if err != nil {
		return err.Error()
	}
	paths := asMap(full["paths"])
	pathItem := asMap(paths[schemaPath])
	op := asMap(pathItem[strings.ToLower(method)])
	if op == nil {
		return fmt.Sprintf("%s %s は見つかりません。", strings.ToUpper(method), schemaPath)
	}
	lines := []string{fmt.Sprintf("%s %s", strings.ToUpper(method), schemaPath)}
	if s := asString(op["summary"]); s != "" {
		lines = append(lines, "", stripHTML(s))
	}
	if d := asString(op["description"]); d != "" {
		lines = append(lines, "", stripHTML(d))
	}
	if params, ok := op["parameters"].([]any); ok && len(params) > 0 {
		lines = append(lines, "", "Parameters:")
		for _, raw := range params {
			param := resolveParamRef(asMap(raw), full)
			name := asString(param["name"])
			desc := stripHTML(asString(param["description"]))
			required, _ := param["required"].(bool)
			req := ""
			if required {
				req = " (必須)"
			}
			lines = append(lines, fmt.Sprintf("  %-28s %s", name+req, desc))
		}
	}
	if rb := asMap(op["requestBody"]); rb != nil {
		lines = append(lines, "", "Request Body:")
		renderSchemaLines(&lines, firstContentSchema(rb), full, "  ", 0)
	}
	if includeResponse {
		if responses := asMap(op["responses"]); responses != nil {
			lines = append(lines, "", "Responses:")
			keys := sortedKeys(responses)
			for _, code := range keys {
				resp := asMap(responses[code])
				lines = append(lines, "  "+code+" "+stripHTML(asString(resp["description"])))
				renderSchemaLines(&lines, firstContentSchema(resp), full, "    ", 0)
			}
		}
	}
	lines = append(lines, "", "Examples:", fmt.Sprintf("  freee %s %s %s --help", service, strings.ToLower(method), concretePath))
	return strings.Join(lines, "\n")
}

func generateSpec(service apiType, concretePath string) string {
	schemaPath := resolveSchemaPath(service, concretePath)
	if schemaPath == "" {
		return fmt.Sprintf("パス '%s' は %s に見つかりません。", concretePath, apiMeta[service].Name)
	}
	full, err := loadFullSchema(service)
	if err != nil {
		return err.Error()
	}
	paths := asMap(full["paths"])
	data, _ := json.MarshalIndent(paths[schemaPath], "", "  ")
	return string(data)
}

func executeAPIRequest(service apiType, input apiInput) (string, error) {
	token, err := getValidAccessToken()
	if err != nil {
		return "", err
	}
	if token == "" {
		return "Not authenticated. Run: freee auth login", nil
	}
	method := input.Method
	if method == "" {
		if input.Body != nil {
			method = "POST"
		} else {
			method = "GET"
		}
	}
	apiPath := expandPath(service, input.Path)
	validation := validatePath(service, method, apiPath)
	if !validation.Valid {
		return validation.Message, nil
	}
	companyID, err := currentCompanyID()
	if err != nil {
		return "", err
	}
	query := map[string]string{}
	for k, v := range input.Query {
		query[k] = v
	}
	if companyID != "" {
		if _, ok := query["company_id"]; !ok {
			query["company_id"] = companyID
		}
	}
	body := input.Body
	if body != nil && companyID != "" {
		if _, ok := body["company_id"]; !ok {
			if n, err := strconv.Atoi(companyID); err == nil {
				body["company_id"] = n
			} else {
				body["company_id"] = companyID
			}
		}
	}
	if len(input.FilePaths) > 0 && strings.HasSuffix(apiPath, "/receipts") && strings.EqualFold(method, "POST") {
		result, err := uploadReceipt(input.FilePaths[0], body)
		if err != nil {
			return "", err
		}
		if hasFlag(input.Flags, "--json") {
			return marshalIndent(result), nil
		}
		if obj, ok := result.(map[string]any); ok {
			if key, value := findSingleResource(obj); key != "" {
				return formatSingleResource(key, value), nil
			}
		}
		return marshalIndent(result), nil
	}
	if hasFlag(input.Flags, "--verbose") {
		u := validation.BaseURL + apiPath
		if len(query) > 0 {
			q := url.Values{}
			for k, v := range query {
				q.Set(k, v)
			}
			u += "?" + q.Encode()
		}
		fmt.Fprintln(os.Stderr, method, u)
		if body != nil {
			fmt.Fprintln(os.Stderr, "Body:", marshalCompact(body))
		}
	}
	result, err := makeAPIRequest(method, apiPath, query, body, validation.BaseURL)
	if err != nil {
		return "", err
	}
	if result == nil {
		return "(no content)", nil
	}
	if bin, ok := result.(binaryFileResponse); ok {
		return "File saved: " + bin.FilePath, nil
	}
	if hasFlag(input.Flags, "--json") {
		return marshalIndent(result), nil
	}
	return formatCompact(result, maxItems(input.Flags)), nil
}

func makeAPIRequest(method, apiPath string, params map[string]string, body map[string]any, base string) (any, error) {
	companyID, _ := currentCompanyID()
	accessToken, err := getValidAccessToken()
	if err != nil {
		return nil, err
	}
	if accessToken == "" {
		return nil, fmt.Errorf("認証が必要です。freee auth login で認証を行ってください。\n現在の事業所ID: %s", companyID)
	}
	if base == "" {
		base = freeeAPIURL
	}
	u, err := url.Parse(strings.TrimRight(base, "/") + "/" + strings.TrimLeft(apiPath, "/"))
	if err != nil {
		return nil, err
	}
	q := u.Query()
	for k, v := range params {
		q.Add(k, v)
	}
	u.RawQuery = q.Encode()
	var reader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, u.String(), reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent())
	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("認証エラーが発生しました。freee auth login で再認証を行ってください。\n現在の事業所ID: %s\nエラー詳細: %d %s", companyID, resp.StatusCode, responseErrorInfo(resp))
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("アクセス拒否 (403): %s\n事業所ID: %s", responseErrorInfo(resp), companyID)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s", apiErrorMessage(resp))
	}
	contentType := resp.Header.Get("Content-Type")
	if isBinaryContentType(contentType) {
		dir, _ := downloadDir()
		name := fmt.Sprintf("freee_download_%d%s", time.Now().UnixMilli(), extensionFromContentType(contentType))
		filePath := filepath.Join(dir, name)
		data, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}
		if err := os.WriteFile(filePath, data, 0o600); err != nil {
			return nil, err
		}
		return binaryFileResponse{FilePath: filePath, MimeType: contentType, Size: int64(len(data))}, nil
	}
	if resp.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil || len(data) == 0 {
		return nil, err
	}
	parsed, err := decodeJSONUseNumber(data)
	if err != nil {
		return nil, fmt.Errorf("Failed to parse API response as JSON. Status: %d, Content-Type: %s, Body preview: %s", resp.StatusCode, contentType, preview(data, 200))
	}
	return parsed, nil
}

func uploadReceipt(filePath string, options map[string]any) (any, error) {
	resolved, err := filepath.Abs(filePath)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("ファイルが見つかりません: %s", resolved)
		}
		if errors.Is(err, os.ErrPermission) {
			return nil, fmt.Errorf("ファイルの読み取り権限がありません: %s", resolved)
		}
		return nil, err
	}
	if len(data) > 64*1024*1024 {
		return nil, fmt.Errorf("ファイルサイズが上限(64MB)を超えています: %.1fMB", float64(len(data))/(1024*1024))
	}
	companyID, _ := currentCompanyID()
	accessToken, err := getValidAccessToken()
	if err != nil {
		return nil, err
	}
	if accessToken == "" {
		return nil, errors.New("認証が必要です。freee auth login で認証を行ってください")
	}
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("receipt", filepath.Base(resolved))
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(data); err != nil {
		return nil, err
	}
	_ = writer.WriteField("company_id", companyID)
	for k, v := range options {
		if k != "company_id" {
			_ = writer.WriteField(k, fmt.Sprint(v))
		}
	}
	writer.Close()
	req, err := http.NewRequest(http.MethodPost, freeeAPIURL+"/api/1/receipts", &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("User-Agent", userAgent())
	req.Header.Set("Content-Type", writer.FormDataContentType())
	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s", apiErrorMessage(resp))
	}
	respData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	parsed, err := decodeJSONUseNumber(respData)
	if err != nil {
		return nil, err
	}
	return parsed, nil
}

func formatCompact(data any, max int) string {
	obj, ok := data.(map[string]any)
	if !ok {
		return fmt.Sprint(data)
	}
	key, items := findMainArray(obj)
	if key == "" || len(items) == 0 {
		if k, v := findSingleResource(obj); k != "" {
			return formatSingleResource(k, v)
		}
		return marshalIndent(data)
	}
	total := len(items)
	if meta, ok := obj["meta"].(map[string]any); ok {
		total = numberAsInt(meta["total_count"], total)
	}
	first, _ := items[0].(map[string]any)
	var cols []string
	for k, v := range first {
		if v == nil || !isObjectLike(v) {
			cols = append(cols, k)
		}
	}
	sort.Strings(cols)
	if len(cols) > 6 {
		cols = cols[:6]
	}
	display := items
	if len(display) > max {
		display = display[:max]
	}
	lines := []string{fmt.Sprintf("%s: %d of %d items", key, len(display), total), "", strings.Join(cols, "\t")}
	for _, item := range display {
		row, _ := item.(map[string]any)
		var cells []string
		for _, col := range cols {
			s := displayScalar(row[col])
			if row[col] == nil {
				s = ""
			}
			cells = append(cells, truncate(s, 50))
		}
		lines = append(lines, strings.Join(cells, "\t"))
	}
	if total > max {
		lines = append(lines, fmt.Sprintf("... and %d more (use --max=N or --json)", total-max))
	}
	return strings.Join(lines, "\n")
}

func findMainArray(obj map[string]any) (string, []any) {
	keys := sortedKeysAny(obj)
	for _, k := range keys {
		if k == "meta" {
			continue
		}
		if arr, ok := obj[k].([]any); ok {
			return k, arr
		}
	}
	return "", nil
}

func findSingleResource(obj map[string]any) (string, map[string]any) {
	for _, k := range sortedKeysAny(obj) {
		if v, ok := obj[k].(map[string]any); ok {
			return k, v
		}
	}
	return "", nil
}

func formatSingleResource(key string, resource map[string]any) string {
	lines := []string{key + ":", ""}
	for _, field := range sortedKeysAny(resource) {
		value := resource[field]
		switch v := value.(type) {
		case nil:
			lines = append(lines, "  "+field+"\t")
		case []any:
			for i, item := range v {
				if obj, ok := item.(map[string]any); ok {
					lines = append(lines, fmt.Sprintf("  %s[%d]\t%s", field, i, formatInline(obj)))
				} else {
					lines = append(lines, fmt.Sprintf("  %s[%d]\t%s", field, i, displayScalar(item)))
				}
			}
		case map[string]any:
			lines = append(lines, "  "+field+"\t"+formatInline(v))
		default:
			lines = append(lines, "  "+field+"\t"+truncate(displayScalar(v), 80))
		}
	}
	return strings.Join(lines, "\n")
}

func formatInline(obj map[string]any) string {
	var parts []string
	for _, k := range sortedKeysAny(obj) {
		v := obj[k]
		if v == nil || isObjectLike(v) {
			continue
		}
		parts = append(parts, k+"="+truncate(displayScalar(v), 40))
	}
	return strings.Join(parts, " ")
}

func decodeJSONUseNumber(data []byte) (any, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var parsed any
	if err := decoder.Decode(&parsed); err != nil {
		return nil, err
	}
	return parsed, nil
}

func displayScalar(v any) string {
	switch n := v.(type) {
	case json.Number:
		return n.String()
	case float64:
		if n == float64(int64(n)) {
			return strconv.FormatInt(int64(n), 10)
		}
		return strconv.FormatFloat(n, 'f', -1, 64)
	case float32:
		f := float64(n)
		if f == float64(int64(f)) {
			return strconv.FormatInt(int64(f), 10)
		}
		return strconv.FormatFloat(f, 'f', -1, 32)
	default:
		return fmt.Sprint(v)
	}
}

func numberAsInt(v any, fallback int) int {
	switch n := v.(type) {
	case json.Number:
		if i, err := n.Int64(); err == nil {
			return int(i)
		}
		if f, err := n.Float64(); err == nil {
			return int(f)
		}
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return fallback
}

func responseErrorInfo(resp *http.Response) string {
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if len(data) == 0 {
		return resp.Status
	}
	return string(data)
}

func apiErrorMessage(resp *http.Response) string {
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if len(data) == 0 {
		return fmt.Sprintf("API request failed: %d %s", resp.StatusCode, resp.Status)
	}
	return fmt.Sprintf("API request failed: %d %s", resp.StatusCode, string(data))
}

func userAgent() string {
	return fmt.Sprintf("%s/%s (CLI; +https://github.com/yamitzky/freee-cli)", userAgentName, version)
}

func httpClient() *http.Client {
	return &http.Client{Timeout: 60 * time.Second}
}

func openBrowser(target string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", target)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", target)
	default:
		cmd = exec.Command("xdg-open", target)
	}
	return cmd.Start()
}

func randomBase64URL(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}

func downloadDir() (string, error) {
	cfg, err := loadFullConfig()
	if err != nil {
		return "", err
	}
	if cfg.DownloadDir != "" {
		return cfg.DownloadDir, nil
	}
	return os.TempDir(), nil
}

func isBinaryContentType(contentType string) bool {
	for _, t := range []string{"application/pdf", "application/octet-stream", "image/", "text/csv"} {
		if strings.Contains(contentType, t) {
			return true
		}
	}
	return false
}

func extensionFromContentType(contentType string) string {
	mapping := map[string]string{"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "text/csv": ".csv"}
	for k, v := range mapping {
		if strings.Contains(contentType, k) {
			return v
		}
	}
	return ".bin"
}

func firstContentSchema(obj map[string]any) map[string]any {
	content := asMap(obj["content"])
	if content == nil {
		return nil
	}
	for _, media := range sortedKeys(content) {
		if schema := asMap(asMap(content[media])["schema"]); schema != nil {
			return schema
		}
	}
	return nil
}

func renderSchemaLines(lines *[]string, schema map[string]any, root map[string]any, indent string, depth int) {
	if schema == nil || depth > 2 {
		return
	}
	resolved := resolveSchemaRef(schema, root)
	if props := asMap(resolved["properties"]); props != nil {
		required := map[string]bool{}
		for _, r := range asSlice(resolved["required"]) {
			required[asString(r)] = true
		}
		for _, name := range sortedKeys(props) {
			prop := resolveSchemaRef(asMap(props[name]), root)
			req := ""
			if required[name] {
				req = " (必須)"
			}
			desc := stripHTML(asString(prop["description"]))
			*lines = append(*lines, fmt.Sprintf("%s%-28s %s", indent, name+req, desc))
			renderSchemaLines(lines, prop, root, indent+"  ", depth+1)
		}
		return
	}
	if items := asMap(resolved["items"]); items != nil {
		renderSchemaLines(lines, items, root, indent, depth+1)
	}
}

func resolveParamRef(param map[string]any, root map[string]any) map[string]any {
	ref := asString(param["$ref"])
	if ref == "" {
		return param
	}
	prefix := "#/components/parameters/"
	if strings.HasPrefix(ref, prefix) {
		params := asMap(asMap(root["components"])["parameters"])
		if resolved := asMap(params[strings.TrimPrefix(ref, prefix)]); resolved != nil {
			return resolved
		}
	}
	return param
}

func resolveSchemaRef(schema map[string]any, root map[string]any) map[string]any {
	if schema == nil {
		return nil
	}
	if ref := asString(schema["$ref"]); strings.HasPrefix(ref, "#/components/schemas/") {
		schemas := asMap(asMap(root["components"])["schemas"])
		if resolved := asMap(schemas[strings.TrimPrefix(ref, "#/components/schemas/")]); resolved != nil {
			return resolveSchemaRef(resolved, root)
		}
	}
	for _, key := range []string{"allOf", "oneOf", "anyOf"} {
		if arr := asSlice(schema[key]); len(arr) > 0 {
			return resolveSchemaRef(asMap(arr[0]), root)
		}
	}
	return schema
}

func stripHTML(s string) string {
	re := regexp.MustCompile(`<[^>]*>`)
	replaced := re.ReplaceAllString(s, "")
	replacer := strings.NewReplacer("&lt;", "<", "&gt;", ">", "&amp;", "&", "&quot;", `"`, "&#39;", "'")
	return strings.TrimSpace(replacer.Replace(replaced))
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}
func asSlice(v any) []any {
	s, _ := v.([]any)
	return s
}
func asString(v any) string {
	s, _ := v.(string)
	return s
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sortedKeysAny(m map[string]any) []string { return sortedKeys(m) }

func contains(values []string, needle string) bool {
	for _, v := range values {
		if v == needle {
			return true
		}
	}
	return false
}

func hasFlag(flags []string, flag string) bool { return contains(flags, flag) }

func firstArg(args []string) string {
	if len(args) == 0 {
		return ""
	}
	return args[0]
}

func maxItems(flags []string) int {
	for _, f := range flags {
		if strings.HasPrefix(f, "--max=") {
			if n, err := strconv.Atoi(strings.TrimPrefix(f, "--max=")); err == nil && n > 0 {
				return n
			}
		}
	}
	return 10
}

func marshalIndent(v any) string {
	data, _ := json.MarshalIndent(v, "", "  ")
	return string(data)
}

func marshalCompact(v any) string {
	data, _ := json.Marshal(v)
	return string(data)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	if n <= 3 {
		return s[:n]
	}
	return s[:n-3] + "..."
}

func isObjectLike(v any) bool {
	switch v.(type) {
	case map[string]any, []any:
		return true
	default:
		return false
	}
}

func preview(data []byte, n int) string {
	if len(data) <= n {
		return string(data)
	}
	return string(data[:n])
}
