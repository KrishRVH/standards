class_name Counter
extends RefCounted

var _value := 0


func increment() -> void:
	_value += 1


func value() -> int:
	return _value
