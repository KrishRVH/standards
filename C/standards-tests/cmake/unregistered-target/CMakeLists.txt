cmake_minimum_required(VERSION 3.20)
project(c_unregistered_target_fixture LANGUAGES C)

include("${CMAKE_CURRENT_LIST_DIR}/../../../cmake/ProjectCStandards.cmake")

add_subdirectory(nested)
project_assert_c_standards_applied()
