cmake_minimum_required(VERSION 3.20)
project(c_stripped_target_fixture LANGUAGES C)

set(PROJECT_BUILD_SHARED OFF CACHE BOOL "" FORCE)
set(PROJECT_INSTALL OFF CACHE BOOL "" FORCE)
add_subdirectory("${CMAKE_CURRENT_LIST_DIR}/../../.." project-under-test)

# Model an accidental or hostile replacement after the standards helper ran.
set_property(TARGET project_cli PROPERTY COMPILE_OPTIONS -Werror)
