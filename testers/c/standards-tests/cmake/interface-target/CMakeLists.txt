cmake_minimum_required(VERSION 3.20)
project(c_interface_target_fixture LANGUAGES C)

set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
set(PROJECT_BUILD_CLI OFF CACHE BOOL "" FORCE)
set(PROJECT_INSTALL OFF CACHE BOOL "" FORCE)
add_subdirectory("${CMAKE_CURRENT_LIST_DIR}/../../.." project-under-test)

add_library(header_only INTERFACE)
project_apply_common(header_only)
