cmake_minimum_required(VERSION 3.30)
project(cpp_tester VERSION 0.1.0 LANGUAGES CXX)

include(CTest)

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

function(project_require_cxx_standard target scope)
  target_compile_features(${target} ${scope} cxx_std_26)
endfunction()

function(project_apply_common target)
  get_target_property(_type ${target} TYPE)
  if(_type STREQUAL "STATIC_LIBRARY")
    target_include_directories(${target} PUBLIC "${PROJECT_SOURCE_DIR}/include")
    set(_feature_scope PUBLIC)
  else()
    target_include_directories(${target} PRIVATE "${PROJECT_SOURCE_DIR}/include")
    set(_feature_scope PRIVATE)
  endif()

  project_require_cxx_standard(${target} ${_feature_scope})
  set_target_properties(${target} PROPERTIES CXX_SCAN_FOR_MODULES OFF)
  target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic -Wconversion -Wshadow -Wold-style-cast -Wformat=2 -Werror)
endfunction()

add_library(project_library STATIC src/library.cpp)
project_apply_common(project_library)

add_executable(project_cli src/main.cpp)
target_link_libraries(project_cli PRIVATE project_library)
project_apply_common(project_cli)

add_executable(project_tests tests/project_tests.cpp)
target_link_libraries(project_tests PRIVATE project_library)
project_apply_common(project_tests)
add_test(NAME project_tests COMMAND project_tests)
