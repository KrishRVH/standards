// Package boringlint enforces the project's restricted Go dialect.
package boringlint

import (
	"go/ast"
	"go/types"

	"golang.org/x/tools/go/analysis"
)

// NoRangeFunc rejects range-over-function iterators introduced in Go 1.23.
var NoRangeFunc = &analysis.Analyzer{
	Name: "norangefunc",
	Doc:  "forbid range-over-function iterators; iterate concrete data or materialize at the dependency boundary",
	Run:  runNoRangeFunc,
}

func runNoRangeFunc(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			stmt, ok := node.(*ast.RangeStmt)
			if !ok {
				return true
			}

			typ := pass.TypesInfo.TypeOf(stmt.X)
			if !isRangeFunc(typ) {
				return true
			}

			pass.Reportf(
				stmt.Range,
				"range over a function value (%s) is forbidden by project standards; iterate concrete data or materialize at the dependency boundary",
				types.TypeString(typ, types.RelativeTo(pass.Pkg)),
			)
			return true
		})
	}
	//nolint:nilnil // analysis.Analyzer uses a nil result to mean no exported fact.
	return nil, nil
}

func isRangeFunc(typ types.Type) bool {
	if typ == nil {
		return false
	}
	if _, ok := typ.Underlying().(*types.Signature); ok {
		return true
	}

	typeParam, ok := types.Unalias(typ).(*types.TypeParam)
	return ok && hasAssignableSignature(
		typeParam.Constraint(),
		typeParam,
		make(map[types.Type]bool),
	)
}

// A successfully type-checked range over a type parameter has a common
// underlying type. Find a candidate signature in the constraint, then let
// go/types prove that every possible type is assignable to it.
//
//nolint:gocognit // Constraint graphs require recursive handling of each go/types node kind.
func hasAssignableSignature(
	typ types.Type,
	typeParam *types.TypeParam,
	seen map[types.Type]bool,
) bool {
	typ = types.Unalias(typ)
	if seen[typ] {
		return false
	}
	seen[typ] = true

	if signature, ok := typ.Underlying().(*types.Signature); ok {
		return types.AssignableTo(typeParam, signature)
	}

	switch typ := typ.(type) {
	case *types.TypeParam:
		return hasAssignableSignature(typ.Constraint(), typeParam, seen)
	case *types.Named:
		return hasAssignableSignature(typ.Underlying(), typeParam, seen)
	case *types.Interface:
		for index := range typ.NumEmbeddeds() {
			if hasAssignableSignature(typ.EmbeddedType(index), typeParam, seen) {
				return true
			}
		}
	case *types.Union:
		for index := range typ.Len() {
			if hasAssignableSignature(typ.Term(index).Type(), typeParam, seen) {
				return true
			}
		}
	}
	return false
}

// NoGenericMethod rejects methods that declare method-local type parameters.
var NoGenericMethod = &analysis.Analyzer{
	Name: "nogenericmethod",
	Doc:  "forbid generic methods introduced in Go 1.27; use a package-level generic function",
	Run:  runNoGenericMethod,
}

func runNoGenericMethod(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		ReportGenericMethods(file, func(decl *ast.FuncDecl) {
			pass.Reportf(
				decl.Pos(),
				"generic method %s declares method-local type parameters, which are forbidden by project standards; use a package-level generic function",
				decl.Name.Name,
			)
		})
	}
	//nolint:nilnil // analysis.Analyzer uses a nil result to mean no exported fact.
	return nil, nil
}

// ReportGenericMethods calls report for each method declaration with its own
// type parameter list. It remains directly testable on toolchains where that
// syntax is still rejected before an analysis driver can run.
func ReportGenericMethods(file *ast.File, report func(*ast.FuncDecl)) {
	for _, declaration := range file.Decls {
		decl, ok := declaration.(*ast.FuncDecl)
		if !ok || decl.Recv == nil || decl.Type == nil {
			continue
		}
		if params := decl.Type.TypeParams; params != nil && len(params.List) > 0 {
			report(decl)
		}
	}
}
