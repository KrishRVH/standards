from standards_python_tester import Greeting, render_greeting


def test_render_greeting_function() -> None:
    assert render_greeting("Ada") == "Hello, Ada!"


def test_greeting_value_object() -> None:
    greeting = Greeting(name="Grace")

    assert greeting.render() == "Hello, Grace!"
