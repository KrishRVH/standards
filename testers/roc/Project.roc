Project := [].{
	greet : Str -> Str
	greet = |name| "Hello, ${name}!"
}

expect Project.greet("Roc") == "Hello, Roc!"
