//! Executable contract for the first-party Rust attribute policy.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::str::FromStr;

use proc_macro2::{Delimiter, TokenStream, TokenTree};
use serde::Deserialize;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::{Expr, Lit, Meta, Token};

const ROOT_EXCLUDED_DIRECTORIES: [&str; 5] = [
    ".cargo-tools",
    "mutants.out",
    "mutants.out.old",
    "target",
    "vendor",
];

#[derive(Deserialize)]
struct CargoMetadataDocument {
    packages: Vec<CargoPackage>,
    workspace_members: Vec<String>,
}

#[derive(Deserialize)]
struct CargoPackage {
    id: String,
    manifest_path: PathBuf,
    targets: Vec<CargoTarget>,
}

#[derive(Deserialize)]
struct CargoTarget {
    src_path: PathBuf,
}

#[derive(Default)]
struct CargoWorkspaceInputs {
    enumeration_roots: BTreeSet<PathBuf>,
    package_roots: BTreeSet<PathBuf>,
    target_sources: Vec<PathBuf>,
}

fn allow_policy_violation_count(source: &str) -> Result<usize, proc_macro2::LexError> {
    TokenStream::from_str(source).map(|tokens| allow_violations_in_tokens(&tokens))
}

fn allow_violations_in_tokens(tokens: &TokenStream) -> usize {
    let token_trees: Vec<TokenTree> = tokens.clone().into_iter().collect();
    let mut count = 0_usize;

    for (index, token) in token_trees.iter().enumerate() {
        if let TokenTree::Group(group) = token {
            count = count.saturating_add(allow_violations_in_tokens(&group.stream()));
        }

        let TokenTree::Punct(pound) = token else {
            continue;
        };
        if pound.as_char() != '#' {
            continue;
        }

        let mut following = token_trees.iter().skip(index.saturating_add(1));
        let Some(mut next) = following.next() else {
            continue;
        };
        if matches!(next, TokenTree::Punct(punctuation) if punctuation.as_char() == '!') {
            let Some(after_bang) = following.next() else {
                continue;
            };
            next = after_bang;
        }

        let TokenTree::Group(attribute) = next else {
            continue;
        };
        if attribute.delimiter() != Delimiter::Bracket {
            continue;
        }
        if contains_macro_metavariable(&attribute.stream())
            || syn::parse2::<Meta>(attribute.stream()).is_ok_and(|meta| meta_contains_allow(&meta))
        {
            count = count.saturating_add(1);
        }
    }

    count
}

fn contains_macro_metavariable(tokens: &TokenStream) -> bool {
    tokens.clone().into_iter().any(|token| match token {
        TokenTree::Punct(punctuation) => punctuation.as_char() == '$',
        TokenTree::Group(group) => contains_macro_metavariable(&group.stream()),
        _ => false,
    })
}

enum SourceReference {
    LiteralInclude(String),
    OpaqueInclude,
    CustomModulePath,
}

fn source_references(tokens: &TokenStream) -> Vec<SourceReference> {
    let token_trees: Vec<TokenTree> = tokens.clone().into_iter().collect();
    let mut references = Vec::new();

    for (index, token) in token_trees.iter().enumerate() {
        if let TokenTree::Group(group) = token {
            references.extend(source_references(&group.stream()));
        }

        if let TokenTree::Ident(identifier) = token {
            let preceded_by_dollar = index
                .checked_sub(1)
                .and_then(|previous| token_trees.get(previous))
                .is_some_and(|previous| {
                    matches!(previous, TokenTree::Punct(punctuation) if punctuation.as_char() == '$')
                });
            let bang = token_trees.get(index.saturating_add(1));
            let arguments = token_trees.get(index.saturating_add(2));
            if ident_is_name(identifier, "include")
                && !preceded_by_dollar
                && matches!(bang, Some(TokenTree::Punct(punctuation)) if punctuation.as_char() == '!')
            {
                if let Some(TokenTree::Group(arguments)) = arguments {
                    references.push(literal_include_reference(arguments));
                } else {
                    references.push(SourceReference::OpaqueInclude);
                }
            }
        }

        let TokenTree::Punct(pound) = token else {
            continue;
        };
        if pound.as_char() != '#' {
            continue;
        }

        let mut following = token_trees.iter().skip(index.saturating_add(1));
        let Some(mut next) = following.next() else {
            continue;
        };
        if matches!(next, TokenTree::Punct(punctuation) if punctuation.as_char() == '!') {
            let Some(after_bang) = following.next() else {
                continue;
            };
            next = after_bang;
        }
        let TokenTree::Group(attribute) = next else {
            continue;
        };
        if attribute.delimiter() == Delimiter::Bracket
            && syn::parse2::<Meta>(attribute.stream())
                .is_ok_and(|meta| meta_contains_custom_path(&meta))
        {
            references.push(SourceReference::CustomModulePath);
        }
    }

    references
}

fn meta_contains_custom_path(meta: &Meta) -> bool {
    if path_is_ident(meta.path(), "path") {
        return true;
    }
    let Meta::List(list) = meta else {
        return false;
    };
    if !path_is_ident(&list.path, "cfg_attr") {
        return false;
    }

    Punctuated::<Meta, Token![,]>::parse_terminated
        .parse2(list.tokens.clone())
        .is_ok_and(|metas| metas.iter().skip(1).any(meta_contains_custom_path))
}

fn literal_include_reference(arguments: &proc_macro2::Group) -> SourceReference {
    let Ok(expressions) =
        Punctuated::<Expr, Token![,]>::parse_terminated.parse2(arguments.stream())
    else {
        return SourceReference::OpaqueInclude;
    };
    if expressions.len() == 1
        && let Some(Expr::Lit(expression)) = expressions.first()
        && let Lit::Str(path) = &expression.lit
    {
        return SourceReference::LiteralInclude(path.value());
    }
    SourceReference::OpaqueInclude
}

fn ident_is_name(identifier: &proc_macro2::Ident, expected: &str) -> bool {
    let identifier = identifier.to_string();
    identifier.strip_prefix("r#").unwrap_or(&identifier) == expected
}

fn meta_contains_allow(meta: &Meta) -> bool {
    if path_is_ident(meta.path(), "allow") {
        return true;
    }
    let Meta::List(list) = meta else {
        return false;
    };
    if !path_is_ident(&list.path, "cfg_attr") {
        return false;
    }

    Punctuated::<Meta, Token![,]>::parse_terminated
        .parse2(list.tokens.clone())
        .is_ok_and(|metas| metas.iter().skip(1).any(meta_contains_allow))
}

fn path_is_ident(path: &syn::Path, expected: &str) -> bool {
    path.leading_colon.is_none()
        && path.segments.len() == 1
        && path
            .segments
            .first()
            .is_some_and(|segment| ident_is_name(&segment.ident, expected))
}

fn collect_project_files(
    path: &Path,
    canonical_root: &Path,
    package_roots: &BTreeSet<PathBuf>,
    visited_directories: &mut BTreeSet<PathBuf>,
    source_files: &mut Vec<PathBuf>,
    manifests: &mut Vec<PathBuf>,
    violations: &mut Vec<String>,
) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        let canonical_path = match fs::canonicalize(path) {
            Ok(path) => path,
            Err(error) => {
                violations.push(format!("{} cannot be resolved: {error}", path.display()));
                return Ok(());
            },
        };
        let target_metadata = fs::metadata(path)?;
        if target_metadata.is_dir() {
            if !canonical_path.starts_with(canonical_root) {
                violations.push(format!(
                    "{} resolves outside canonical project root {}",
                    path.display(),
                    canonical_root.display()
                ));
                return Ok(());
            }
            if !visited_directories.insert(canonical_path) {
                return Ok(());
            }
            for entry in fs::read_dir(path)? {
                collect_project_files(
                    &entry?.path(),
                    canonical_root,
                    package_roots,
                    visited_directories,
                    source_files,
                    manifests,
                    violations,
                )?;
            }
            return Ok(());
        }
        if path.extension().is_some_and(|extension| extension == "rs") {
            source_files.push(path.to_path_buf());
        }
        if is_cargo_manifest(path) {
            manifests.push(path.to_path_buf());
        }
        return Ok(());
    }
    if metadata.is_file() {
        if path.extension().is_some_and(|extension| extension == "rs") {
            source_files.push(path.to_path_buf());
        }
        if is_cargo_manifest(path) {
            manifests.push(path.to_path_buf());
        }
        return Ok(());
    }
    if !metadata.is_dir() || is_excluded_directory(path, package_roots)? {
        return Ok(());
    }
    if !visited_directories.insert(fs::canonicalize(path)?) {
        return Ok(());
    }

    for entry in fs::read_dir(path)? {
        collect_project_files(
            &entry?.path(),
            canonical_root,
            package_roots,
            visited_directories,
            source_files,
            manifests,
            violations,
        )?;
    }
    Ok(())
}

fn is_excluded_directory(path: &Path, package_roots: &BTreeSet<PathBuf>) -> io::Result<bool> {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return Ok(false);
    };
    if name == ".git" {
        return Ok(true);
    }
    if !ROOT_EXCLUDED_DIRECTORIES.contains(&name) {
        return Ok(false);
    }
    let Some(parent) = path.parent() else {
        return Ok(false);
    };
    Ok(package_roots.contains(&fs::canonicalize(parent)?))
}

fn is_cargo_manifest(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "Cargo.toml")
}

fn project_policy_violations(root: &Path) -> io::Result<Vec<String>> {
    let canonical_root = fs::canonicalize(root)?;
    let mut source_files = Vec::new();
    let mut manifests = Vec::new();
    let mut visited_directories = BTreeSet::new();
    let mut violations = Vec::new();
    let CargoWorkspaceInputs {
        mut enumeration_roots,
        mut package_roots,
        target_sources,
    } = cargo_workspace_inputs(root, &canonical_root, &mut violations);
    package_roots.insert(canonical_root.clone());
    enumeration_roots.insert(canonical_root.clone());
    collect_project_files(
        root,
        &canonical_root,
        &package_roots,
        &mut visited_directories,
        &mut source_files,
        &mut manifests,
        &mut violations,
    )?;
    for enumeration_root in enumeration_roots {
        if enumeration_root != canonical_root {
            collect_source_root_files(
                &enumeration_root,
                &canonical_root,
                &package_roots,
                &mut visited_directories,
                &mut source_files,
                &mut manifests,
                &mut violations,
            )?;
        }
    }
    source_files.extend(target_sources);
    manifests.sort();
    for manifest in manifests {
        source_files.extend(cargo_target_source_paths(
            &manifest,
            &canonical_root,
            &mut violations,
        )?);
    }
    source_files.sort();

    let mut visited = BTreeSet::new();
    for source_file in source_files {
        scan_source_file(&source_file, &canonical_root, &mut visited, &mut violations)?;
    }
    violations.sort();
    Ok(violations)
}

fn collect_source_root_files(
    source_root: &Path,
    canonical_root: &Path,
    package_roots: &BTreeSet<PathBuf>,
    visited_directories: &mut BTreeSet<PathBuf>,
    source_files: &mut Vec<PathBuf>,
    manifests: &mut Vec<PathBuf>,
    violations: &mut Vec<String>,
) -> io::Result<()> {
    if !visited_directories.insert(source_root.to_path_buf()) {
        return Ok(());
    }
    for entry in fs::read_dir(source_root)? {
        collect_project_files(
            &entry?.path(),
            canonical_root,
            package_roots,
            visited_directories,
            source_files,
            manifests,
            violations,
        )?;
    }
    Ok(())
}

fn cargo_workspace_inputs(
    root: &Path,
    canonical_root: &Path,
    violations: &mut Vec<String>,
) -> CargoWorkspaceInputs {
    let manifest_path = root.join("Cargo.toml");
    if !manifest_path.is_file() {
        return CargoWorkspaceInputs::default();
    }

    let output = match Command::new(env!("CARGO"))
        .args([
            "metadata",
            "--locked",
            "--format-version=1",
            "--manifest-path",
        ])
        .arg(&manifest_path)
        .current_dir(root)
        .output()
    {
        Ok(output) => output,
        Err(error) => {
            violations.push(format!(
                "cannot run locked Cargo metadata for {}: {error}",
                manifest_path.display()
            ));
            return CargoWorkspaceInputs::default();
        },
    };
    if !output.status.success() {
        violations.push(format!(
            "locked Cargo metadata failed for {}: {}",
            manifest_path.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
        return CargoWorkspaceInputs::default();
    }

    let metadata = match serde_json::from_slice::<CargoMetadataDocument>(&output.stdout) {
        Ok(metadata) => metadata,
        Err(error) => {
            violations.push(format!(
                "locked Cargo metadata for {} is not valid JSON: {error}",
                manifest_path.display()
            ));
            return CargoWorkspaceInputs::default();
        },
    };
    let mut packages_by_id = BTreeMap::new();
    for package in metadata.packages {
        if packages_by_id.contains_key(&package.id) {
            violations.push(format!(
                "locked Cargo metadata contains duplicate package id {:?}",
                package.id
            ));
            continue;
        }
        packages_by_id.insert(package.id.clone(), package);
    }

    let mut inputs = CargoWorkspaceInputs::default();
    let mut seen_members = BTreeSet::new();
    for member_id in metadata.workspace_members {
        if !seen_members.insert(member_id.clone()) {
            violations.push(format!(
                "locked Cargo metadata contains duplicate workspace member id {member_id:?}"
            ));
            continue;
        }
        let Some(package) = packages_by_id.get(&member_id) else {
            violations.push(format!(
                "locked Cargo metadata workspace member {member_id:?} has no matching package"
            ));
            continue;
        };
        let Some(canonical_manifest) = canonical_workspace_path(
            &package.manifest_path,
            "workspace member manifest",
            canonical_root,
            violations,
        ) else {
            continue;
        };
        let Some(package_root) = canonical_manifest.parent() else {
            violations.push(format!(
                "workspace member manifest {} has no package root",
                canonical_manifest.display()
            ));
            continue;
        };
        inputs.package_roots.insert(package_root.to_path_buf());
        inputs.enumeration_roots.insert(package_root.to_path_buf());
        for target in &package.targets {
            if let Some(source) = canonical_workspace_path(
                &target.src_path,
                "workspace member target",
                canonical_root,
                violations,
            ) {
                if let Some(parent) = source.parent() {
                    inputs.enumeration_roots.insert(parent.to_path_buf());
                }
                inputs.target_sources.push(source);
            }
        }
    }
    inputs
}

fn canonical_workspace_path(
    path: &Path,
    kind: &str,
    canonical_root: &Path,
    violations: &mut Vec<String>,
) -> Option<PathBuf> {
    let canonical_path = match fs::canonicalize(path) {
        Ok(path) => path,
        Err(error) => {
            violations.push(format!(
                "{kind} {} cannot be resolved: {error}",
                path.display()
            ));
            return None;
        },
    };
    if !canonical_path.starts_with(canonical_root) {
        violations.push(format!(
            "{kind} {} resolves outside canonical project root {}",
            path.display(),
            canonical_root.display()
        ));
        return None;
    }
    Some(canonical_path)
}

fn cargo_target_source_paths(
    manifest_path: &Path,
    canonical_root: &Path,
    violations: &mut Vec<String>,
) -> io::Result<Vec<PathBuf>> {
    let canonical_manifest = match fs::canonicalize(manifest_path) {
        Ok(path) => path,
        Err(error) => {
            violations.push(format!(
                "{} cannot be resolved: {error}",
                manifest_path.display()
            ));
            return Ok(Vec::new());
        },
    };
    if !canonical_manifest.starts_with(canonical_root) {
        violations.push(format!(
            "{} resolves outside canonical project root {}",
            manifest_path.display(),
            canonical_root.display()
        ));
        return Ok(Vec::new());
    }

    let source = fs::read_to_string(&canonical_manifest)?;
    let manifest = match toml::from_str::<toml::Value>(&source) {
        Ok(manifest) => manifest,
        Err(error) => {
            violations.push(format!(
                "{} is not valid TOML: {error}",
                canonical_manifest.display()
            ));
            return Ok(Vec::new());
        },
    };
    let Some(root_table) = manifest.as_table() else {
        violations.push(format!(
            "{} does not contain a TOML table",
            canonical_manifest.display()
        ));
        return Ok(Vec::new());
    };
    let Some(manifest_directory) = canonical_manifest.parent() else {
        violations.push(format!(
            "{} has no parent directory",
            canonical_manifest.display()
        ));
        return Ok(Vec::new());
    };

    let mut paths = Vec::new();
    if let Some(package) = root_table.get("package") {
        add_cargo_build_script_path(
            package,
            &canonical_manifest,
            manifest_directory,
            &mut paths,
            violations,
        );
    }
    if let Some(target) = root_table.get("lib") {
        add_cargo_target_path(
            target,
            "lib",
            &canonical_manifest,
            manifest_directory,
            &mut paths,
            violations,
        );
    }
    for target_kind in ["bin", "test", "example", "bench"] {
        let Some(targets) = root_table.get(target_kind) else {
            continue;
        };
        let Some(targets) = targets.as_array() else {
            violations.push(format!(
                "{} has non-array [[{target_kind}]] targets",
                canonical_manifest.display()
            ));
            continue;
        };
        for target in targets {
            add_cargo_target_path(
                target,
                target_kind,
                &canonical_manifest,
                manifest_directory,
                &mut paths,
                violations,
            );
        }
    }
    Ok(paths)
}

fn add_cargo_build_script_path(
    package: &toml::Value,
    manifest_path: &Path,
    manifest_directory: &Path,
    paths: &mut Vec<PathBuf>,
    violations: &mut Vec<String>,
) {
    let Some(package) = package.as_table() else {
        violations.push(format!(
            "{} has a non-table package definition",
            manifest_path.display()
        ));
        return;
    };
    let Some(build_script) = package.get("build") else {
        return;
    };
    if build_script.as_bool().is_some_and(|enabled| !enabled) {
        return;
    }
    let Some(path) = build_script.as_str() else {
        violations.push(format!(
            "{} has a malformed package.build; custom Cargo build-script paths must be literal strings or false",
            manifest_path.display()
        ));
        return;
    };
    paths.push(manifest_directory.join(path));
}

fn add_cargo_target_path(
    target: &toml::Value,
    target_kind: &str,
    manifest_path: &Path,
    manifest_directory: &Path,
    paths: &mut Vec<PathBuf>,
    violations: &mut Vec<String>,
) {
    let Some(target) = target.as_table() else {
        violations.push(format!(
            "{} has a non-table {target_kind} target",
            manifest_path.display()
        ));
        return;
    };
    let Some(path) = target.get("path") else {
        return;
    };
    let Some(path) = path.as_str() else {
        violations.push(format!(
            "{} has a non-string {target_kind}.path; custom Cargo target paths must be literal strings",
            manifest_path.display()
        ));
        return;
    };
    paths.push(manifest_directory.join(path));
}

fn scan_source_file(
    source_path: &Path,
    canonical_root: &Path,
    visited: &mut BTreeSet<PathBuf>,
    violations: &mut Vec<String>,
) -> io::Result<()> {
    let canonical_path = match fs::canonicalize(source_path) {
        Ok(path) => path,
        Err(error) => {
            violations.push(format!(
                "{} cannot be resolved: {error}",
                source_path.display()
            ));
            return Ok(());
        },
    };
    if !canonical_path.starts_with(canonical_root) {
        violations.push(format!(
            "{} resolves outside canonical project root {}",
            source_path.display(),
            canonical_root.display()
        ));
        return Ok(());
    }
    if !visited.insert(canonical_path.clone()) {
        return Ok(());
    }

    let source = fs::read_to_string(&canonical_path)?;
    let tokens = match TokenStream::from_str(&source) {
        Ok(tokens) => tokens,
        Err(error) => {
            violations.push(format!(
                "{} is not tokenizable Rust source: {error}",
                canonical_path.display()
            ));
            return Ok(());
        },
    };

    let count = allow_violations_in_tokens(&tokens);
    if count != 0 {
        violations.push(format!("{} ({count})", canonical_path.display()));
    }

    for reference in source_references(&tokens) {
        match reference {
            SourceReference::LiteralInclude(relative_path) => {
                let Some(parent) = canonical_path.parent() else {
                    violations.push(format!(
                        "{} has no parent for include!({relative_path:?})",
                        canonical_path.display()
                    ));
                    continue;
                };
                scan_source_file(
                    &parent.join(relative_path),
                    canonical_root,
                    visited,
                    violations,
                )?;
            }
            SourceReference::OpaqueInclude => violations.push(format!(
                "{} uses a non-literal include!; use a project-relative string literal so the policy scanner can inspect the compiler input",
                canonical_path.display()
            )),
            SourceReference::CustomModulePath => violations.push(format!(
                "{} uses #[path]; use conventional mod file layout so the policy scanner can enumerate every compiler input",
                canonical_path.display()
            )),
        }
    }
    Ok(())
}

#[test]
fn rejects_crate_inner_allow_with_a_reason() {
    let source = "#![allow(clippy::unwrap_used, reason = \"claimed exception\")]\nfn main() {}";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        1
    );
}

#[test]
fn rejects_raw_identifier_allow() {
    let source = "#![r#allow(dead_code)]\nfn main() {}";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        1
    );
}

#[test]
fn rejects_multiline_and_cfg_attr_allows() {
    let source = r"
        #[
            allow(dead_code)
        ]
        fn direct() {}

        #[cfg_attr(unix, cfg_attr(test, allow(clippy::unwrap_used)))]
        fn conditional() {}
        ";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        2
    );
}

#[test]
fn rejects_raw_identifier_cfg_attr_with_nested_allow() {
    let source = "#[r#cfg_attr(unix, cfg_attr(test, r#allow(dead_code)))]\nfn conditional() {}";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        1
    );
}

#[test]
fn rejects_allow_generated_inside_a_macro_body() {
    let source = "macro_rules! generated { () => { #[allow(dead_code)] fn hidden() {} }; }";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        1
    );
}

#[test]
fn rejects_macro_attribute_forwarding_metavariables() {
    let source = r"
        macro_rules! meta_attr { ($attribute:meta) => { #[$attribute] struct Meta; }; }
        macro_rules! ident_attr { ($attribute:ident) => { #[$attribute] struct Ident; }; }
        macro_rules! tt_attr { ($attribute:tt) => { #[$attribute] struct TokenTree; }; }
        ";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        3
    );
}

#[test]
fn rejects_semicolon_wrapped_allow_forwarding() {
    let source = r"
        macro_rules! with_attr { ($attribute:meta;) => { #[$attribute] struct Generated; }; }
        with_attr!(allow(dead_code););
        ";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        1
    );
}

#[test]
fn rejects_repeated_and_cfg_attr_metavariable_emission() {
    let source = r"
        macro_rules! repeated { ($($attribute:meta),*) => { $(#[$attribute] struct Generated;)* }; }
        macro_rules! conditional { ($attribute:meta) => { #[cfg_attr(test, $attribute)] struct Conditional; }; }
        ";
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        2
    );
}

#[test]
fn ignores_attribute_text_in_comments_and_literals() {
    let source = r####"
        // #![allow(dead_code)]
        const TEXT: &str = r###"#[allow(dead_code)]"###;
        #[cfg_attr(feature = "allow", derive(Clone))]
        #[expect(dead_code, reason = "the probe is intentionally unused")]
        struct Probe;
        "####;
    assert_eq!(
        allow_policy_violation_count(source).expect("valid Rust tokens"),
        0
    );
}

#[test]
fn follows_literal_includes_cycle_safely() {
    let root = policy_fixture_root("literal-include").expect("fixture root should be creatable");
    fs::write(root.join("lib.rs"), "include!(\"payload.inc\");")
        .expect("fixture root source should be writable");
    fs::write(
        root.join("payload.inc"),
        "#[allow(dead_code)] fn included() {}\ninclude!(\"lib.rs\");",
    )
    .expect("included fixture source should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 1);
    assert!(violations[0].contains("payload.inc"));
}

#[test]
fn follows_all_cargo_custom_target_source_paths() {
    let root =
        policy_fixture_root("cargo-custom-targets").expect("fixture root should be creatable");
    fs::create_dir_all(root.join("src")).expect("fixture source directory should be creatable");
    fs::write(
        root.join("Cargo.toml"),
        r#"
            [package]
            name = "policy-fixture"
            version = "0.1.0"
            edition = "2024"
            build = "src/build-script.inc"

            [lib]
            path = "src/library.inc"

            [[bin]]
            name = "command"
            path = "src/command.inc"

            [[test]]
            name = "integration"
            path = "src/integration.inc"

            [[example]]
            name = "example"
            path = "src/example.inc"

            [[bench]]
            name = "benchmark"
            path = "src/benchmark.inc"

            [workspace]
        "#,
    )
    .expect("fixture manifest should be writable");
    for source in [
        "library.inc",
        "command.inc",
        "integration.inc",
        "example.inc",
        "benchmark.inc",
        "build-script.inc",
    ] {
        fs::write(
            root.join("src").join(source),
            "#[allow(dead_code)] fn target() {}",
        )
        .expect("custom target source should be writable");
    }
    write_fixture_lock(&root, &["policy-fixture"]).expect("fixture lock should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 6);
    for source in [
        "library.inc",
        "command.inc",
        "integration.inc",
        "example.inc",
        "benchmark.inc",
        "build-script.inc",
    ] {
        assert!(
            violations
                .iter()
                .any(|violation| violation.contains(source)),
            "custom target {source} was not scanned: {violations:?}"
        );
    }
}

#[test]
fn rejects_opaque_and_out_of_root_cargo_target_paths() {
    let root =
        policy_fixture_root("invalid-cargo-targets").expect("fixture root should be creatable");
    let external = root
        .parent()
        .expect("fixture root should have a parent")
        .join(format!("external-target-{}.inc", std::process::id()));
    fs::write(&external, "fn external() {}").expect("external target source should be writable");
    fs::write(
        root.join("Cargo.toml"),
        format!(
            r#"
                [package]
                name = "policy-fixture"
                version = "0.1.0"
                edition = "2024"
                build = true

                [lib]
                path = {{ workspace = true }}

                [[bin]]
                name = "external"
                path = "../{}"

                [workspace]
            "#,
            external
                .file_name()
                .and_then(|name| name.to_str())
                .expect("external fixture name should be UTF-8")
        ),
    )
    .expect("fixture manifest should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("locked Cargo metadata failed"))
    );
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("package.build"))
    );
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("literal strings"))
    );
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("outside canonical project root"))
    );
}

#[test]
fn accepts_an_explicitly_disabled_cargo_build_script() {
    let root =
        policy_fixture_root("disabled-build-script").expect("fixture root should be creatable");
    fs::create_dir_all(root.join("src")).expect("fixture source directory should be creatable");
    fs::write(
        root.join("Cargo.toml"),
        r#"
            [package]
            name = "policy-fixture"
            version = "0.1.0"
            edition = "2024"
            build = false

            [workspace]
        "#,
    )
    .expect("fixture manifest should be writable");
    fs::write(root.join("src/lib.rs"), "fn ordinary() {}")
        .expect("fixture source should be writable");
    write_fixture_lock(&root, &["policy-fixture"]).expect("fixture lock should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert!(
        violations.is_empty(),
        "unexpected violations: {violations:?}"
    );
}

#[test]
fn rejects_workspace_members_outside_the_canonical_project_root() {
    let container = std::env::temp_dir().join(format!(
        "rust-policy-external-workspace-{}",
        std::process::id()
    ));
    if container.exists() {
        fs::remove_dir_all(&container).expect("stale fixture should be removable");
    }
    let root = container.join("project");
    let external = container.join("member");
    fs::create_dir_all(&root).expect("fixture root should be creatable");
    fs::create_dir_all(&external).expect("external member directory should be creatable");
    fs::write(
        root.join("Cargo.toml"),
        r#"
            [workspace]
            resolver = "3"
            members = ["../member"]
        "#,
    )
    .expect("workspace manifest should be writable");
    fs::write(
        external.join("Cargo.toml"),
        r#"
            [package]
            name = "external-workspace-member"
            version = "0.1.0"
            edition = "2024"
            workspace = "../project"

            [lib]
            path = "lib.rs"
        "#,
    )
    .expect("external member manifest should be writable");
    fs::write(external.join("lib.rs"), "fn external() {}")
        .expect("external member source should be writable");
    write_fixture_lock(&root, &["external-workspace-member"])
        .expect("workspace lock should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert!(
        violations.iter().any(|violation| {
            violation.contains("workspace member manifest")
                && violation.contains("outside canonical project root")
        }),
        "external workspace member was not rejected: {violations:?}"
    );
    fs::remove_dir_all(container).expect("fixture should be removable");
}

#[test]
fn scans_internal_workspace_targets_without_scanning_external_path_dependencies() {
    let root =
        policy_fixture_root("workspace-member-scope").expect("fixture root should be creatable");
    let member = root.join("vendor/member");
    fs::create_dir_all(&member).expect("internal member directory should be creatable");
    let dependency_name = format!("external-path-dependency-{}", std::process::id());
    let dependency = root
        .parent()
        .expect("fixture root should have a parent")
        .join(&dependency_name);
    fs::create_dir_all(&dependency).expect("external dependency directory should be creatable");

    fs::write(
        root.join("Cargo.toml"),
        r#"
            [workspace]
            resolver = "3"
            members = ["vendor/member"]
        "#,
    )
    .expect("workspace manifest should be writable");
    fs::write(
        member.join("Cargo.toml"),
        format!(
            r#"
                [package]
                name = "internal-workspace-member"
                version = "0.1.0"
                edition = "2024"

                [dependencies]
                external-path-dependency = {{ path = "../../../{dependency_name}" }}

                [lib]
                path = "compiler-input"
            "#,
        ),
    )
    .expect("internal member manifest should be writable");
    fs::write(member.join("compiler-input"), "include!(\"payload.inc\");")
        .expect("internal target should be writable");
    fs::write(
        member.join("payload.inc"),
        "#[allow(dead_code)] fn internal_member() {}",
    )
    .expect("internal included source should be writable");
    fs::write(
        dependency.join("Cargo.toml"),
        r#"
            [package]
            name = "external-path-dependency"
            version = "0.1.0"
            edition = "2024"

            [lib]
            path = "lib.rs"
        "#,
    )
    .expect("external dependency manifest should be writable");
    fs::write(
        dependency.join("lib.rs"),
        "#[allow(dead_code)] fn external_dependency() {}",
    )
    .expect("external dependency source should be writable");
    fs::write(
        root.join("Cargo.lock"),
        r#"# This file is automatically @generated by Cargo.
version = 4

[[package]]
name = "external-path-dependency"
version = "0.1.0"

[[package]]
name = "internal-workspace-member"
version = "0.1.0"
dependencies = [
 "external-path-dependency",
]
"#,
    )
    .expect("workspace lock should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 1, "unexpected violations: {violations:?}");
    assert!(violations[0].contains("payload.inc"));
    assert!(!violations[0].contains("external-path-dependency"));
}

#[test]
fn scans_cfg_disabled_conventional_modules_in_root_pruned_workspace_members() {
    let root = policy_fixture_root("workspace-member-conventional-module")
        .expect("fixture root should be creatable");
    let member = root.join("vendor/member");
    fs::create_dir_all(member.join("src")).expect("member source directory should be creatable");
    fs::create_dir_all(member.join("target")).expect("member target directory should be creatable");
    fs::create_dir_all(member.join("vendor")).expect("member vendor directory should be creatable");
    fs::write(
        root.join("Cargo.toml"),
        r#"
            [workspace]
            resolver = "3"
            members = ["vendor/member"]
        "#,
    )
    .expect("workspace manifest should be writable");
    fs::write(
        member.join("Cargo.toml"),
        r#"
            [package]
            name = "conventional-module-member"
            version = "0.1.0"
            edition = "2024"
        "#,
    )
    .expect("member manifest should be writable");
    fs::write(member.join("src/lib.rs"), "#[cfg(windows)] mod hidden;")
        .expect("member crate root should be writable");
    fs::write(
        member.join("src/hidden.rs"),
        "#![allow(dead_code)]\npub fn hidden() {}",
    )
    .expect("cfg-disabled conventional module should be writable");
    for generated in [
        member.join("target/generated.rs"),
        member.join("vendor/dependency.rs"),
    ] {
        fs::write(generated, "#![allow(dead_code)]\nfn generated() {}")
            .expect("generated source should be writable");
    }
    write_fixture_lock(&root, &["conventional-module-member"])
        .expect("workspace lock should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 1, "unexpected violations: {violations:?}");
    assert!(violations[0].contains("src/hidden.rs"));
}

#[test]
fn rejects_opaque_includes_and_custom_module_paths() {
    let root = policy_fixture_root("opaque-inputs").expect("fixture root should be creatable");
    fs::write(
        root.join("lib.rs"),
        "include!(concat!(env!(\"OUT_DIR\"), \"/generated.rs\"));\n#[path = \"payload.inc\"] mod payload;\n#[cfg_attr(test, path = \"conditional.inc\")] mod conditional;",
    )
    .expect("fixture root source should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 3);
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("non-literal include!"))
    );
    assert_eq!(
        violations
            .iter()
            .filter(|violation| violation.contains("uses #[path]"))
            .count(),
        2
    );
}

#[test]
fn prunes_generated_roots_without_hiding_nested_source_directories() {
    let root = policy_fixture_root("nested-exclusion").expect("fixture root should be creatable");
    fs::create_dir_all(root.join("vendor")).expect("root vendor directory should be creatable");
    fs::write(
        root.join("vendor/generated.rs"),
        "#[allow(dead_code)] fn generated() {}",
    )
    .expect("generated source should be writable");

    let nested = root.join("src/vendor");
    fs::create_dir_all(&nested).expect("nested vendor source should be creatable");
    fs::write(
        nested.join("mod.rs"),
        "#[path = \"payload.inc\"] mod payload;",
    )
    .expect("nested source should be writable");
    fs::write(nested.join("payload.inc"), "fn payload() {}")
        .expect("nested payload should be writable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 1);
    assert!(violations[0].contains("src/vendor/mod.rs"));
}

#[cfg(unix)]
#[test]
fn follows_internal_rust_symlinks_and_rejects_external_targets() {
    use std::os::unix::fs::symlink;

    let root = policy_fixture_root("symlinks").expect("fixture root should be creatable");
    let external = root
        .parent()
        .expect("fixture root should have a parent")
        .join(format!("external-{}", std::process::id()));
    fs::write(
        root.join("payload.inc"),
        "#[allow(dead_code)] fn internal() {}",
    )
    .expect("internal symlink target should be writable");
    fs::write(&external, "fn external() {}").expect("external symlink target should be writable");
    symlink("payload.inc", root.join("internal.rs")).expect("internal symlink should be creatable");
    symlink(&external, root.join("external.rs")).expect("external symlink should be creatable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 2);
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("payload.inc"))
    );
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("outside canonical project root"))
    );
}

#[cfg(unix)]
#[test]
fn follows_internal_directory_symlinks_and_rejects_external_targets() {
    use std::os::unix::fs::symlink;

    let root = policy_fixture_root("directory-symlinks").expect("fixture root should be creatable");
    let internal = root.join("target/compiler-input");
    fs::create_dir_all(&internal).expect("internal target directory should be creatable");
    fs::write(
        internal.join("payload.rs"),
        "#[allow(dead_code)] fn internal() {}",
    )
    .expect("internal target source should be writable");
    symlink(&internal, root.join("src")).expect("internal directory symlink should be creatable");
    symlink(root.join("src"), internal.join("cycle"))
        .expect("directory symlink cycle should be creatable");

    let external = root
        .parent()
        .expect("fixture root should have a parent")
        .join(format!("external-directory-{}", std::process::id()));
    fs::create_dir_all(&external).expect("external target directory should be creatable");
    fs::write(external.join("payload.rs"), "fn external() {}")
        .expect("external target source should be writable");
    symlink(&external, root.join("external-src"))
        .expect("external directory symlink should be creatable");

    let violations = project_policy_violations(&root).expect("fixture project should be readable");
    assert_eq!(violations.len(), 2);
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("payload.rs"))
    );
    assert!(
        violations
            .iter()
            .any(|violation| violation.contains("outside canonical project root"))
    );
}

fn policy_fixture_root(name: &str) -> io::Result<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target/allow-policy-fixtures")
        .join(format!("{}-{name}", std::process::id()));
    fs::create_dir_all(&root)?;
    Ok(root)
}

fn write_fixture_lock(root: &Path, package_names: &[&str]) -> io::Result<()> {
    let mut lock = String::from("# This file is automatically @generated by Cargo.\nversion = 4\n");
    for package_name in package_names {
        lock.push_str("\n[[package]]\nname = \"");
        lock.push_str(package_name);
        lock.push_str("\"\nversion = \"0.1.0\"\n");
    }
    fs::write(root.join("Cargo.lock"), lock)
}

#[test]
fn project_sources_contain_no_policy_violations() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let violations = project_policy_violations(root).expect("project files should be readable");

    assert!(
        violations.is_empty(),
        "allow attributes and macro-emitted attribute metavariables are forbidden; use narrow, reasoned #[expect]: {}",
        violations.join(", ")
    );
}

#[test]
fn mutation_tasks_preserve_workspace_and_base_resolution_contracts() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let task_path = root.join(".config/mise/conf.d/20-rust.toml");
    let tasks =
        fs::read_to_string(&task_path).expect("the copied Rust task fragment should be readable");
    let Some(full) = task_definition(&tasks, "rust:mutants") else {
        panic!("the full Rust mutation task should exist");
    };
    let Some(diff) = task_definition(&tasks, "rust:mutants:diff") else {
        panic!("the diff Rust mutation task should exist");
    };

    assert!(
        full.contains("--test-workspace=true"),
        "the full mutation task must run every workspace test"
    );
    assert!(
        full.lines().any(|line| {
            line.contains("cargo-mutants\"")
                && line.contains(" mutants ")
                && line.contains("--output=.")
        }),
        "the full mutation task must force cargo-mutants to write the report under the project root"
    );
    assert!(
        full.contains("sh scripts/verify-mutants.sh full mutants.out"),
        "the full mutation task must verify post-run outcome evidence"
    );
    for contract in [
        ". scripts/mutants-lock.sh",
        "acquire_mutants_task_lock full",
        "run_mutants_task_child",
        "trap mutants_task_release_lock EXIT",
    ] {
        assert!(
            full.contains(contract),
            "the full mutation task is missing transaction-lock contract {contract}"
        );
    }
    assert!(
        diff.contains("--test-workspace=true"),
        "the diff mutation task must run every workspace test"
    );
    assert!(
        diff.lines().any(|line| {
            line.contains("cargo-mutants\"")
                && line.contains(" mutants ")
                && line.contains("--output=.")
        }),
        "the diff mutation task must force cargo-mutants to write the report under the project root"
    );
    assert!(
        diff.contains("sh scripts/verify-mutants.sh diff mutants.out"),
        "the diff mutation task must verify post-run outcome evidence"
    );
    for contract in [
        "refs/remotes/origin/main^{commit}",
        "refs/heads/main^{commit}",
        "$base_ref^{commit}",
        "git merge-base HEAD \"$base_commit\"",
        "git ls-files --others --exclude-standard",
        "git add -N <path>",
        "git diff --relative \"$merge_base\" --",
        ". scripts/mutants-lock.sh",
        "acquire_mutants_task_lock diff",
        "run_mutants_task_child",
        "mutants_task_release_lock",
    ] {
        assert!(
            diff.contains(contract),
            "the diff mutation task is missing base-resolution contract {contract}"
        );
    }
    let untracked_guard = diff
        .find("git ls-files --others --exclude-standard")
        .expect("the diff mutation task should inspect untracked files");
    let diff_capture = diff
        .find("git diff --relative \"$merge_base\" --")
        .expect("the diff mutation task should capture the merge-base diff");
    assert!(
        untracked_guard < diff_capture,
        "the untracked-file guard must run before the mutation diff is captured"
    );
}

fn task_definition<'a>(tasks: &'a str, name: &str) -> Option<&'a str> {
    let heading = format!("[tasks.\"{name}\"]");
    let (_, after_heading) = tasks.split_once(&heading)?;
    Some(
        after_heading
            .split_once("\n[tasks.")
            .map_or(after_heading, |(definition, _)| definition),
    )
}
