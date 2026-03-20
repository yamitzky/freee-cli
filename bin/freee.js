#! /usr/bin/env node
var m=new Set(["accounting","hr","invoice","pm","sm"]);function a(o){if(o.length===0)return{group:"help",command:"help",args:[]};let[e,...n]=o;if(m.has(e)){if(n.length===0)return{group:e,command:"ls",args:[]};let[c,...t]=n;if(c.startsWith("/"))return{group:e,command:"api",args:[c,...t]};return{group:e,command:c,args:t}}if(n.length===0)return{group:e,command:e,args:[]};let[l,...r]=n;return{group:e,command:l,args:r}}function s(){console.log(`freee CLI v${"0.13.0"}

Usage: freee <command> [options]

Auth:
  freee auth login          freee にログイン
  freee auth logout         ログアウト
  freee auth status         認証状態を表示

Company:
  freee company ls          事業所一覧を表示
  freee company set <id>    操作対象の事業所を設定
  freee company show        現在の事業所を表示

API:
  freee <service> ls                    エンドポイント一覧
  freee <service> <path>                GET リクエスト実行
  freee <service> <path> --help         エンドポイントの詳細を表示
  freee <service> <path> key==value     クエリパラメータ付き GET

  service: accounting, hr, invoice, pm, sm

Options:
  --version                 バージョンを表示
  --help                    ヘルプを表示`)}async function i(o){if(o.includes("--version")){console.log("0.13.0");return}if(o.includes("--help")&&o.length===1){s();return}let e=a(o);switch(e.group){case"auth":console.log("auth: not yet implemented");break;case"company":console.log("company: not yet implemented");break;case"accounting":case"hr":case"invoice":case"pm":case"sm":console.log(`${e.group} ${e.command}: not yet implemented`);break;case"help":s();break;default:console.error(`Unknown command: ${e.group}`),s(),process.exit(1)}}i(process.argv.slice(2)).catch((o)=>{console.error("Error:",o.message??o),process.exit(1)});
