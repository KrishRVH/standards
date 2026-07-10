extends SceneTree

const SCRIPT_ROOTS: Array[String] = ["res://src", "res://tests"]


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var script_paths: Array[String] = []
	var failures: Array[String] = []
	for root_path: String in SCRIPT_ROOTS:
		_collect_script_paths(root_path, script_paths, failures)
	script_paths.sort()

	for script_path: String in script_paths:
		var script := ResourceLoader.load(script_path, "Script") as Script
		if script == null:
			failures.append("failed to load script: %s" % script_path)

	for failure: String in failures:
		push_error(failure)
	quit(1 if not failures.is_empty() else 0)


func _collect_script_paths(
	root_path: String, paths: Array[String], failures: Array[String]
) -> void:
	var dir := DirAccess.open(root_path)
	if dir == null:
		failures.append("missing script directory: %s" % root_path)
		return

	dir.list_dir_begin()
	var file_name := dir.get_next()
	while not file_name.is_empty():
		var child_path := root_path.path_join(file_name)
		if dir.current_is_dir():
			if not file_name.begins_with("."):
				_collect_script_paths(child_path, paths, failures)
		elif file_name.ends_with(".gd"):
			paths.append(child_path)
		file_name = dir.get_next()
	dir.list_dir_end()
