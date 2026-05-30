cmake_minimum_required(VERSION 3.20)
project(c_project VERSION 0.1.0 LANGUAGES C)

include(GNUInstallDirs)
include(CTest)

option(PROJECT_ENABLE_SANITIZERS "Enable Address+UB sanitizers (GCC/Clang only)" OFF)
option(PROJECT_WERROR "Treat compiler warnings as errors when supported" OFF)
option(PROJECT_MINGW_STATIC "Static link MinGW executables" ON)
option(PROJECT_BUILD_CLI "Build the CLI executable" ON)
option(PROJECT_BUILD_SHARED "Build a shared library in addition to the static library" OFF)
option(PROJECT_INSTALL "Install library and headers" OFF)

set(PROJECT_LIBRARY_SOURCES
    "src/library.c"
    CACHE STRING "Semicolon-separated library source list")
set(PROJECT_CLI_SOURCES
    "src/main.c"
    CACHE STRING "Semicolon-separated CLI source list")
set(PROJECT_TEST_SOURCES
    "tests/project_tests.c"
    CACHE STRING "Semicolon-separated test source list")

set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Project-wide defaults. Targets may still override these when necessary.
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS OFF)

# Detect CompCert by compiler executable name (CMake may not have a built-in ID).
get_filename_component(PROJECT_C_COMPILER_BASENAME "${CMAKE_C_COMPILER}" NAME)
set(PROJECT_COMPILER_IS_COMPCERT OFF)
if(PROJECT_C_COMPILER_BASENAME MATCHES "^(ccomp|ccomp\\.exe)$")
  set(PROJECT_COMPILER_IS_COMPCERT ON)
endif()

function(project_apply_common target)
  get_target_property(_type ${target} TYPE)
  set(_is_interface OFF)
  if(_type STREQUAL "INTERFACE_LIBRARY")
    set(_is_interface ON)
  endif()

  if(_is_interface)
    target_include_directories(${target} INTERFACE
      $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
      $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
    )
    set(_opt_scope INTERFACE)
  elseif(_type STREQUAL "STATIC_LIBRARY" OR _type STREQUAL "SHARED_LIBRARY" OR
         _type STREQUAL "MODULE_LIBRARY" OR _type STREQUAL "OBJECT_LIBRARY")
    target_include_directories(${target} PUBLIC
      $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>
      $<INSTALL_INTERFACE:${CMAKE_INSTALL_INCLUDEDIR}>
    )
    set(_opt_scope PRIVATE)
  else()
    target_include_directories(${target} PRIVATE "${PROJECT_SOURCE_DIR}/include")
    set(_opt_scope PRIVATE)
  endif()

  # Warnings: strict for GCC/Clang, conservative for CompCert, MSVC-friendly.
  if(MSVC)
    target_compile_options(${target} ${_opt_scope} /W4)
    if(PROJECT_WERROR)
      target_compile_options(${target} ${_opt_scope} /WX)
    endif()
  elseif(PROJECT_COMPILER_IS_COMPCERT)
    target_compile_options(${target} ${_opt_scope} -Wall)
    if(PROJECT_WERROR)
      target_compile_options(${target} ${_opt_scope} -Werror)
    endif()
  else()
    target_compile_options(${target} ${_opt_scope}
      "$<$<COMPILE_LANGUAGE:C>:-Wall;-Wextra;-Wpedantic;-Wconversion;-Wshadow>"
    )
    if(PROJECT_WERROR)
      target_compile_options(${target} ${_opt_scope} -Werror)
    endif()
  endif()

  # Visibility: default to hidden for shared libs; export public symbols explicitly.
  if(_type STREQUAL "SHARED_LIBRARY")
    set_target_properties(${target} PROPERTIES
      C_VISIBILITY_PRESET hidden
      VISIBILITY_INLINES_HIDDEN YES
    )
  endif()

  # Sanitizers: native GCC/Clang only (not MinGW, not MSVC, not CompCert).
  if(PROJECT_ENABLE_SANITIZERS AND NOT _is_interface)
    if(NOT MSVC AND NOT MINGW AND NOT PROJECT_COMPILER_IS_COMPCERT)
      target_compile_options(${target} PRIVATE
        -fsanitize=address,undefined
        -fno-omit-frame-pointer
      )
      get_target_property(_target_type ${target} TYPE)
      if(_target_type STREQUAL "EXECUTABLE" OR _target_type STREQUAL "SHARED_LIBRARY" OR
         _target_type STREQUAL "MODULE_LIBRARY")
        target_link_options(${target} PRIVATE -fsanitize=address,undefined)
      endif()
    endif()
  endif()

  # MinGW static linking (executables only).
  if(WIN32 AND NOT MSVC AND PROJECT_MINGW_STATIC)
    get_target_property(_target_type ${target} TYPE)
    if(_target_type STREQUAL "EXECUTABLE")
      target_link_options(${target} PRIVATE -static)
    endif()
  endif()
endfunction()

add_library(project_library STATIC ${PROJECT_LIBRARY_SOURCES})
project_apply_common(project_library)
set_target_properties(project_library PROPERTIES
  OUTPUT_NAME ${PROJECT_NAME}
  EXPORT_NAME library
  VERSION ${PROJECT_VERSION}
  SOVERSION ${PROJECT_VERSION_MAJOR}
)
add_library(${PROJECT_NAME}::library ALIAS project_library)

if(PROJECT_BUILD_SHARED OR BUILD_SHARED_LIBS)
  add_library(project_library_shared SHARED ${PROJECT_LIBRARY_SOURCES})
  project_apply_common(project_library_shared)
  set_target_properties(project_library_shared PROPERTIES
    OUTPUT_NAME ${PROJECT_NAME}
    EXPORT_NAME library_shared
    VERSION ${PROJECT_VERSION}
    SOVERSION ${PROJECT_VERSION_MAJOR}
  )
  add_library(${PROJECT_NAME}::library_shared ALIAS project_library_shared)
endif()

if(PROJECT_BUILD_CLI)
  add_executable(project_cli ${PROJECT_CLI_SOURCES})
  target_link_libraries(project_cli PRIVATE project_library)
  project_apply_common(project_cli)
endif()

if(BUILD_TESTING)
  add_executable(project_tests ${PROJECT_TEST_SOURCES})
  target_link_libraries(project_tests PRIVATE project_library)
  project_apply_common(project_tests)
  add_test(NAME project_tests COMMAND project_tests)
endif()

if(PROJECT_INSTALL)
  set(PROJECT_INSTALL_TARGETS project_library)
  if(TARGET project_library_shared)
    list(APPEND PROJECT_INSTALL_TARGETS project_library_shared)
  endif()

  install(TARGETS ${PROJECT_INSTALL_TARGETS}
    EXPORT ${PROJECT_NAME}Targets
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    INCLUDES DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
  )

  install(DIRECTORY include/
    DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}
    FILES_MATCHING PATTERN "*.h"
  )

  install(EXPORT ${PROJECT_NAME}Targets
    NAMESPACE ${PROJECT_NAME}::
    DESTINATION ${CMAKE_INSTALL_LIBDIR}/cmake/${PROJECT_NAME}
  )
endif()
