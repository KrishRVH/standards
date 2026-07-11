// Command boringlint is a vet tool for the project's restricted Go dialect.
package main

import (
	"golang.org/x/tools/go/analysis/unitchecker"

	"example.com/project/boringlint"
)

func main() {
	unitchecker.Main(
		boringlint.NoIterator,
		boringlint.NoGenericMethod,
	)
}
