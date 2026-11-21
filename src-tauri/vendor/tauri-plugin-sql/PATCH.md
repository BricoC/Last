# Local compatibility patch

This is the unmodified Rust source of `tauri-plugin-sql` 2.6.0, distributed under the included upstream license.

The dependency is adjusted to SQLx 0.9.1 so the application and Tauri SQL plugin share one SQLite native-link crate and can use the patched `libsqlite3-sys` 0.40.x. The small source adaptations use SQLx 0.9's `AssertSqlSafe` for application-authored SQL statements and `SqlSafeStr` for static embedded migration SQL; bound runtime values remain separate query parameters. The plugin API and runtime behavior are otherwise unchanged.

Upstream source: <https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/sql>
Crates.io release: <https://crates.io/crates/tauri-plugin-sql/2.6.0>
Revisit and remove this local patch when a compatible upstream Tauri SQL plugin release supports SQLx 0.9.
