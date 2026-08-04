cmake_minimum_required(VERSION 3.20)
project(c_analyzer_fixture LANGUAGES C)

if(NOT DEFINED FIXTURE_SOURCE OR FIXTURE_SOURCE STREQUAL "")
  message(FATAL_ERROR "FIXTURE_SOURCE must name exactly one analyzer fixture")
endif()

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
add_executable(analyzer_fixture "${FIXTURE_SOURCE}")
set_target_properties(analyzer_fixture PROPERTIES
  C_STANDARD 99
  C_STANDARD_REQUIRED YES
  C_EXTENSIONS NO
)
target_include_directories(analyzer_fixture PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/include with spaces")
target_compile_options(analyzer_fixture PRIVATE
  -Wall
  -Wextra
  -Wpedantic
  -Wformat=2
  -Werror
)
