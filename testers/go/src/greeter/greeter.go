package greeter

import "fmt"

func Greeting(name string) string {
	return fmt.Sprintf("hello, %s", name)
}
