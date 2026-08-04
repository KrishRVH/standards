cmake_minimum_required(VERSION 3.20)
project(c_excluded_directory_fixture LANGUAGES C)

include("${CMAKE_CURRENT_LIST_DIR}/../../../cmake/ProjectCStandards.cmake")

set(_external_source
    "${CMAKE_CURRENT_LIST_DIR}/../unregistered-target/nested")
add_subdirectory("${_external_source}" external-build)
if(TEST_SELF_EXCLUSION)
  project_exclude_c_standards_directory(
    "${CMAKE_CURRENT_SOURCE_DIR}"
    "an owned root must never exempt itself"
  )
elseif(TEST_MISSING_REASON)
  project_exclude_c_standards_directory("${_external_source}" "")
else()
  project_exclude_c_standards_directory(
    "${_external_source}"
    "standards regression models a third-party target with upstream policy"
  )
endif()
project_assert_c_standards_applied()
