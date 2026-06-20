package greeter

import "testing"

func TestGreeting(t *testing.T) {
	t.Parallel()

	if got := Greeting("standards"); got != "hello, standards" {
		t.Fatalf("Greeting() = %q", got)
	}
}
