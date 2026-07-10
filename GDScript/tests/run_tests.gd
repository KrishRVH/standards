extends SceneTree


func _init() -> void:
	var counter := Counter.new()
	counter.increment()
	if counter.value() != 1:
		push_error("expected counter value 1, got %d" % counter.value())
		quit(1)
		return
	quit(0)
