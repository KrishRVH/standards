cmake_minimum_required(VERSION 3.20)
project(c_analyzer_duplicate_fixture LANGUAGES C)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(_source "${CMAKE_CURRENT_LIST_DIR}/../fixtures/cohesive-diagnostic.c")
add_executable(first_profile "${_source}")
add_executable(second_profile "${_source}")
foreach(_target IN ITEMS first_profile second_profile)
  set_target_properties(${_target} PROPERTIES
    C_STANDARD 99
    C_STANDARD_REQUIRED YES
    C_EXTENSIONS NO
  )
endforeach()
target_compile_definitions(second_profile PRIVATE SECOND_PROFILE=1)
